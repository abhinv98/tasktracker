import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Any logged-in internal user (admin or employee). Blocks portal client accounts. */
export async function requireInternalUser(ctx: Ctx): Promise<Doc<"users">> {
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
