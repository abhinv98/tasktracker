import { getAuthUserId as rawGetAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";

/**
 * Drop-in replacement for @convex-dev/auth's getAuthUserId for INTERNAL
 * functions: portal client accounts (role "client") are treated as
 * unauthenticated so every internal query/mutation that gates on
 * `getAuthUserId` automatically rejects them. Portal-facing functions use
 * requireClient from lib/guards instead.
 *
 * In action contexts (no ctx.db) the raw id is returned — actions read/write
 * through queries/mutations, which are guarded here anyway.
 */
export async function getAuthUserId(ctx: {
  auth: unknown;
  db?: { get: (id: Id<"users">) => Promise<{ role?: string } | null> };
}): Promise<Id<"users"> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (await rawGetAuthUserId(ctx as any)) as Id<"users"> | null;
  if (!userId) return null;
  if (!ctx.db) return userId;
  const user = await ctx.db.get(userId);
  if (user?.role === "client") return null;
  return userId;
}
