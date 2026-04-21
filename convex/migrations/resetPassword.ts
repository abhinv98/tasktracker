import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { modifyAccountCredentials } from "@convex-dev/auth/server";

export const run = internalAction({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { email, newPassword }) => {
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: newPassword },
    });
    return { success: true, email };
  },
});

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

/**
 * One-off: find user with "kaushal" in name/email and set password.
 * Run: npx convex run migrations/resetPassword:runKaushal
 */
export const runKaushal = internalAction({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.runQuery(
      internal.migrations.resetPassword.findUserByNameContains,
      { needle: "kaushal" }
    );
    if (!user) {
      throw new Error('No user found with name or email containing "kaushal"');
    }
    if (!user.email) {
      throw new Error("Matched user has no email; cannot set password provider");
    }
    const newPassword = "Kaushal@1234";
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: user.email, secret: newPassword },
    });
    return {
      success: true as const,
      userId: user.userId,
      email: user.email,
      name: user.name,
    };
  },
});
