import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/** Internal lookup for password helpers (name/email substring, case-insensitive). */
export const findUserByNameContains = internalQuery({
  args: { needle: v.string() },
  handler: async (ctx, { needle }) => {
    const lower = needle.toLowerCase();
    const users = await ctx.db.query("users").collect();
    const match = users.find(
      (u) =>
        u.name?.toLowerCase().includes(lower) ||
        u.email?.toLowerCase().includes(lower)
    );
    if (!match) return null;
    return {
      userId: match._id,
      email: match.email ?? null,
      name: match.name ?? null,
    };
  },
});
