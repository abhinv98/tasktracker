import { internalAction } from "../_generated/server";
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
