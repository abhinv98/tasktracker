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
  const brief = await ctx.db.get(briefId);
  if (brief?.briefType === "recruitment") return (await recruitmentBriefView(ctx, user, brief)) !== null;
  const hrTeam = (await ctx.db.query("teams").collect()).find((t) => t.name === "HR");
  if (!hrTeam) return true;
  const links = await ctx.db
    .query("briefTeams")
    .withIndex("by_brief", (q) => q.eq("briefId", briefId))
    .collect();
  const isHRBrief = links.some((l) => l.teamId === hrTeam._id);
  return user.isHR === true ? isHRBrief : !isHRBrief;
}

/**
 * A recruitment brief names candidates. HR and super admins see all of it, as
 * does whoever manages it, and anyone hiring for its position (or who made it,
 * when it is for no one position). Someone given a task in it sees their own
 * tasks. Nobody else sees it. "all" also means they may run it.
 */
export async function recruitmentBriefView(
  ctx: Ctx,
  user: Doc<"users">,
  brief: Doc<"briefs">
): Promise<"all" | "own" | null> {
  if (user.role === "client" || user.isReviewer === true) return null;
  if (runsRecruitment(user, brief)) return "all";
  if (user.recruitJobs?.length) {
    const round = brief.hiringRoundId ? await ctx.db.get(brief.hiringRoundId) : null;
    if (!round && brief.createdBy === user._id) return "all";
    const access = round ? await accessOf(ctx, user) : null;
    if (access && typeof round?.fields.job === "string" && mayRecruitFor(access, Number(round.fields.job))) return "all";
  }
  const mine = await ctx.db
    .query("tasks")
    .withIndex("by_brief_assignee", (q) => q.eq("briefId", brief._id).eq("assigneeId", user._id))
    .first();
  return mine ? "own" : null;
}

const runsRecruitment = (user: Doc<"users">, brief: Doc<"briefs">) =>
  user.isSuperAdmin === true || user.isHR === true || brief.assignedManagerId === user._id;

/** Which of a brief's tasks this person sees. Everything, except in a recruitment
 *  brief: there someone hiring for a few positions sees those positions' tasks and
 *  the ones they gave out, and someone with a task sees their own. */
export async function visibleTasks(
  ctx: Ctx,
  user: Doc<"users">,
  brief: Doc<"briefs">,
  tasks: Doc<"tasks">[]
): Promise<Doc<"tasks">[]> {
  if (brief.briefType !== "recruitment") return tasks;
  const view = await recruitmentBriefView(ctx, user, brief);
  if (view === null) return [];
  if (runsRecruitment(user, brief)) return tasks;
  const access = view === "all" ? await accessOf(ctx, user) : null;
  const out = [];
  for (const t of tasks) {
    if (t.assigneeId === user._id) out.push(t);
    else if (view === "all" && t.assignedBy === user._id) out.push(t);
    else if (access && (t.candidateId ? await myCandidate(ctx, t.candidateId, access) : brief.hiringRoundId)) out.push(t);
  }
  return out;
}

/** May this person see this one task? */
export async function canViewTask(ctx: Ctx, user: Doc<"users">, task: Doc<"tasks">): Promise<boolean> {
  const brief = await ctx.db.get(task.briefId);
  if (brief?.briefType !== "recruitment") return canViewBrief(ctx, user, task.briefId);
  return (await visibleTasks(ctx, user, brief, [task])).length > 0;
}

/** May this person read and write a brief's or a task's discussion and files?
 *  Only recruitment is held back; everything else keeps the rules it had. */
export async function canViewThread(
  ctx: Ctx,
  userId: Id<"users">,
  parentType: "brief" | "task",
  parentId: string
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  const taskId = parentType === "task" ? ctx.db.normalizeId("tasks", parentId) : null;
  const task = taskId ? await ctx.db.get(taskId) : null;
  const briefId = task?.briefId ?? (parentType === "brief" ? ctx.db.normalizeId("briefs", parentId) : null);
  const brief = briefId ? await ctx.db.get(briefId) : null;
  if (brief?.briefType !== "recruitment") return true;
  if (!user) return false;
  return task ? canViewTask(ctx, user, task) : (await recruitmentBriefView(ctx, user, brief)) === "all";
}

/** Changing a recruitment brief, or one task in it, is for people who run it.
 *  Every other brief passes: its own rules decide. */
export async function guardRecruitment(
  ctx: Ctx,
  userId: Id<"users">,
  briefId: Id<"briefs">,
  task?: Doc<"tasks">
): Promise<boolean> {
  const brief = await ctx.db.get(briefId);
  if (brief?.briefType !== "recruitment") return false;
  const user = await ctx.db.get(userId);
  if (!user || (await recruitmentBriefView(ctx, user, brief)) !== "all") throw new Error("Not authorized");
  // The whole brief goes with every task in it, so every task has to be theirs to see.
  const touched = task
    ? [task]
    : await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
  if ((await visibleTasks(ctx, user, brief, touched)).length < touched.length) throw new Error("Not authorized");
  return true;
}

/** Whoever manages a recruitment brief sees all of it, so only HR and super admins name one. */
export async function guardRecruitmentManager(ctx: Ctx, userId: Id<"users">, briefId: Id<"briefs">) {
  const brief = await ctx.db.get(briefId);
  const user = brief?.briefType === "recruitment" ? await ctx.db.get(userId) : null;
  if (brief?.briefType === "recruitment" && !(user?.isSuperAdmin === true || user?.isHR === true)) {
    throw new Error("Only HR and super admins choose who manages a recruitment brief");
  }
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
  return user ? accessOf(ctx, user) : null;
}

async function accessOf(ctx: Ctx, user: Doc<"users">): Promise<RecruitAccess | null> {
  if (user.role === "client" || user.isReviewer === true) return null;
  const full = user.isHR === true || user.isSuperAdmin === true;
  const jobs = new Set(user.recruitJobs ?? []);
  if (!full && jobs.size === 0) return null;
  if (!full) {
    for (const job of await ctx.db.query("recruitJobs").collect()) {
      if (job.parentSourceId != null && jobs.has(job.parentSourceId)) jobs.add(job.sourceId);
    }
  }
  return { userId: user._id, user, full, jobs };
}

/** May this person work on that position? */
export const mayRecruitFor = (access: RecruitAccess, jobSourceId: number) =>
  access.full || access.jobs.has(jobSourceId);

/** A candidate on the Candidates list the caller may work on, or null. */
export async function myCandidate(
  ctx: Ctx,
  id: Id<"hrRecords">,
  given?: RecruitAccess | null
): Promise<Doc<"hrRecords"> | null> {
  const access = given === undefined ? await recruitAccess(ctx) : given;
  const row = access ? await ctx.db.get(id) : null;
  if (!access || !row || row.tracker !== "pipeline") return null;
  if (access.full) return row;
  // A candidate's scope is decided by their open position, or failing that their role.
  const roundId = ctx.db.normalizeId("hrRecords", String(row.fields.reqId ?? ""));
  const job = roundId ? (await ctx.db.get(roundId))?.fields.job : row.fields.job;
  return typeof job === "string" && mayRecruitFor(access, Number(job)) ? row : null;
}
