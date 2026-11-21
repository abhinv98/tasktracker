import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Any logged-in internal user (admin or employee). Blocks portal client
 *  accounts and outside reviewer accounts. */
export async function requireInternalUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireEchoUser(ctx);
  if (user.isReviewer === true) throw new Error("Not authorized");
  return user;
}

/** Staff, or an outside reviewer account: for Echo's own functions only
 *  (their meetings, their calendar). Everything else uses requireInternalUser. */
export async function requireEchoUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role === "client") throw new Error("Not authorized");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireInternalUser(ctx);
  if (user.role !== "admin") throw new Error("Not authorized");
  return user;
}

/** Super admins only — the finance (quotations/invoices) surface. */
export async function requireSuperAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireAdmin(ctx);
  if (user.isSuperAdmin !== true) throw new Error("Not authorized");
  return user;
}

export type ClientUser = Doc<"users"> & { clientBrandId: Id<"brands"> };

/** A logged-in portal client account, with its brand binding guaranteed. */
export async function requireClient(ctx: Ctx): Promise<ClientUser> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "client" || !user.clientBrandId) {
    throw new Error("Not authorized");
  }
  return user as ClientUser;
}

export async function requireClientForBrand(
  ctx: Ctx,
  brandId: Id<"brands">
): Promise<ClientUser> {
  const client = await requireClient(ctx);
  if (client.clientBrandId !== brandId) throw new Error("Not authorized");
  return client;
}

/**
 * HR briefs are confidential (same rule as briefs.listBriefs): HR sees only
 * HR's briefs, everyone else sees everything but HR's, super admins see all.
 */
export async function canViewBrief(
  ctx: Ctx,
  user: Doc<"users">,
  briefId: Id<"briefs">
): Promise<boolean> {
  if (user.role === "client") return false;
  if (user.isSuperAdmin === true) return true;
  const hrTeam = (await ctx.db.query("teams").collect()).find((t) => t.name === "HR");
  if (!hrTeam) return true;
  const links = await ctx.db
    .query("briefTeams")
    .withIndex("by_brief", (q) => q.eq("briefId", briefId))
    .collect();
  const isHRBrief = links.some((l) => l.teamId === hrTeam._id);
  return user.isHR === true ? isHRBrief : !isHRBrief;
}

/** Who may work in recruitment, and on which positions. */
export type RecruitAccess = {
  userId: Id<"users">;
  user: Doc<"users">;
  /** HR and super admins: every position, every tracker, and who else gets in. */
  full: boolean;
  /** For everyone else: the positions HR gave them (users.recruitJobs), with
   *  their sub-positions. Applicants file under the parent position. */
  jobs: ReadonlySet<number>;
};

/** The caller's recruitment access, or null when they have none. */
export async function recruitAccess(ctx: Ctx): Promise<RecruitAccess | null> {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get(userId) : null;
  if (!userId || !user || user.role === "client" || user.isReviewer === true) return null;
  const full = user.isHR === true || user.isSuperAdmin === true;
  const jobs = new Set(user.recruitJobs ?? []);
  if (!full && jobs.size === 0) return null;
  if (!full) {
    for (const job of await ctx.db.query("recruitJobs").collect()) {
      if (job.parentSourceId != null && jobs.has(job.parentSourceId)) jobs.add(job.sourceId);
    }
  }
  return { userId, user, full, jobs };
}

/** May this person work on that position? */
export const mayRecruitFor = (access: RecruitAccess, jobSourceId: number) =>
  access.full || access.jobs.has(jobSourceId);
