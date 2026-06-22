import { getAuthUserId } from "@convex-dev/auth/server";
import {
  retrieveAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

/** String ref avoids `api.*` here — prevents TS7022 circular inference (this action is reachable from `api`, and resolving the query's type through `api` would loop). */
const adminGetUserEmailRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  string
>("users:adminGetUserEmail");

/**
 * Super-admin password reset from the dashboard.
 *
 * Unlike `changePassword`, this does NOT require the target's current password —
 * it's for super admins resetting accounts whose owners are locked out. The
 * `adminGetUserEmail` query enforces the super-admin check before we touch
 * credentials.
 */
export const adminResetPassword = action({
  args: {
    userId: v.id("users"),
    newPassword: v.string(),
  },
  handler: async (ctx, { userId, newPassword }) => {
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    const email = await ctx.runQuery(adminGetUserEmailRef, { userId });

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: newPassword },
    });

    return { success: true, email };
  },
});

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.email) throw new Error("User email not found");

    const retrieved = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: user.email, secret: currentPassword },
    });

    if (!retrieved) {
      throw new Error("Current password is incorrect");
    }

    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: user.email, secret: newPassword },
    });
  },
});
