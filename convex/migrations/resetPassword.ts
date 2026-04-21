import { internalAction } from "../_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { modifyAccountCredentials } from "@convex-dev/auth/server";

/** String ref avoids `internal.*` in this file — prevents TS7022 circular inference on Vercel/strict builds. */
const findUserByNameContainsRef = makeFunctionReference<
  "query",
  { needle: string },
  { userId: Id<"users">; email: string | null; name: string | null } | null
>("migrations/resetPasswordLookup:findUserByNameContains");

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

/**
 * One-off: find user with "kaushal" in name/email and set password.
 * Run: npx convex run migrations/resetPassword:runKaushal
 */
export const runKaushal = internalAction({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.runQuery(findUserByNameContainsRef, {
      needle: "kaushal",
    });
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
