import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Accounts for outside reviewers (Google's OAuth app review). Run from the CLI:
 *
 *   npx convex run migrations/reviewerAccount:createInvite '{"email":"…","name":"…"}'
 *
 * returns a token; the account owner opens
 * https://tasktracker.ecultify.com/sign-up?invite=<token> and sets the
 * password there, so the password never passes through anyone else. Signing
 * up with this invite gives the account users.isReviewer, which every
 * internal function treats as signed out (lib/internalAuth, lib/guards).
 */
export const createInvite = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Not an email address");
    const users = await ctx.db.query("users").collect();
    if (users.some((u) => u.email?.toLowerCase() === normalized)) {
      throw new Error("An account with this email already exists");
    }
    const inviter = users.find((u) => u.isSuperAdmin === true);
    if (!inviter) throw new Error("No super admin to record as the inviter");
    // Sign-up applies the first unused invite for an email: replace older ones.
    for (const old of await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .collect()) {
      if (!old.used) await ctx.db.delete(old._id);
    }
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.insert("invites", {
      email: normalized,
      name,
      role: "employee",
      isReviewer: true,
      token,
      createdBy: inviter._id,
      createdAt: Date.now(),
      used: false,
    });
    return { token };
  },
});

/** A throwaway reviewer user with no login, to check what a reviewer sees by
 *  running functions as it (`npx convex run … --identity`). Delete it after. */
export const createProbe = internalMutation({
  args: {},
  handler: async (ctx) =>
    await ctx.db.insert("users", {
      name: "Reviewer probe",
      email: "reviewer-probe@invalid.example",
      role: "employee",
      isReviewer: true,
    }),
});

export const deleteProbe = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user?.email !== "reviewer-probe@invalid.example") throw new Error("Not the probe user");
    await ctx.db.delete(userId);
  },
});
