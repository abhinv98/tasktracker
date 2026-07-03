import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, mutation, query } from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/guards";
import { removeUserAndCleanup } from "./users";

/** String refs avoid `api.*` here — prevents TS7022 circular inference (see passwordChange.ts). */
const assertCanCreateRef = makeFunctionReference<
  "query",
  { email: string; brandId: Id<"brands"> },
  null
>("clientUsers:assertAdminAndEmailFree");

const getClientEmailRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  string
>("clientUsers:adminGetClientEmail");

/** Guard behind adminCreateClientUser: caller must be admin, brand must exist, email must be unused. */
export const assertAdminAndEmailFree = query({
  args: { email: v.string(), brandId: v.id("brands") },
  handler: async (ctx, { email, brandId }) => {
    await requireAdmin(ctx);
    const brand = await ctx.db.get(brandId);
    if (!brand) throw new Error("Brand not found");
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing) throw new Error("A user with this email already exists");
    return null;
  },
});

/** Guard behind adminResetClientPassword: caller must be admin, target must be a client account. */
export const adminGetClientEmail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target || target.role !== "client") throw new Error("Client user not found");
    if (!target.email) throw new Error("Client user has no email");
    return target.email;
  },
});

/**
 * Create a portal client login (role "client", bound to one brand).
 * Action because `createAccount` (credential creation) is action-only.
 */
export const adminCreateClientUser = action({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { brandId, name, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Email is required");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");

    await ctx.runQuery(assertCanCreateRef, { email: normalizedEmail, brandId });

    await createAccount<DataModel>(ctx, {
      provider: "password",
      account: { id: normalizedEmail, secret: password },
      profile: {
        name: name.trim() || normalizedEmail,
        email: normalizedEmail,
        role: "client",
        clientBrandId: brandId,
      },
    });

    return { success: true, email: normalizedEmail };
  },
});

/** Admin sets a new password for a client login (no current password needed). */
export const adminResetClientPassword = action({
  args: { userId: v.id("users"), newPassword: v.string() },
  handler: async (ctx, { userId, newPassword }) => {
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }
    const email = await ctx.runQuery(getClientEmailRef, { userId });
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: newPassword },
    });
    return { success: true, email };
  },
});

export const listClientUsers = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_client_brand", (q) => q.eq("clientBrandId", brandId))
      .collect();
    return users
      .filter((u) => u.role === "client")
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        _creationTime: u._creationTime,
      }));
  },
});

/** Delete a client login — kills auth accounts/sessions immediately via shared teardown. */
export const deleteClientUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target || target.role !== "client") throw new Error("Client user not found");
    await removeUserAndCleanup(ctx, userId);
  },
});
