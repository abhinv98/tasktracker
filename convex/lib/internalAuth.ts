import { getAuthUserId as rawGetAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";

/**
 * Drop-in replacement for @convex-dev/auth's getAuthUserId for INTERNAL
 * functions: portal client accounts (role "client") and outside reviewer
 * accounts (isReviewer) are treated as unauthenticated, so every internal
 * query/mutation that gates on `getAuthUserId` automatically rejects them.
 * Portal-facing functions use requireClient from lib/guards instead; the few
 * functions a reviewer may use (Echo, their own profile) use requireEchoUser
 * or getSelfUserId.
 *
 * In action contexts (no ctx.db) the raw id is returned — actions read/write
 * through queries/mutations, which are guarded here anyway.
 */
export async function getAuthUserId(ctx: {
  auth: unknown;
  db?: { get: (id: Id<"users">) => Promise<{ role?: string; isReviewer?: boolean } | null> };
}): Promise<Id<"users"> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (await rawGetAuthUserId(ctx as any)) as Id<"users"> | null;
  if (!userId) return null;
  if (!ctx.db) return userId;
  const user = await ctx.db.get(userId);
  if (user?.role === "client" || user?.isReviewer === true) return null;
  return userId;
}

/**
 * The signed-in person's own id for functions that only touch their own
 * account (name, photo): staff and reviewer accounts, never portal clients.
 */
export async function getSelfUserId(ctx: {
  auth: unknown;
  db: { get: (id: Id<"users">) => Promise<{ role?: string } | null> };
}): Promise<Id<"users"> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (await rawGetAuthUserId(ctx as any)) as Id<"users"> | null;
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user && user.role !== "client" ? userId : null;
}
