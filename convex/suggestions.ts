import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const SUGGESTION_STATUS = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("planned"),
  v.literal("done"),
  v.literal("declined"),
);

/** Current user's own suggestions (newest first). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("suggestions")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** All suggestions across the company — super admins only. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const currentUser = await ctx.db.get(userId);
    if (!currentUser || !currentUser.isSuperAdmin) return null;

    const rows = await ctx.db.query("suggestions").collect();
    const users = await ctx.db.query("users").collect();

    return rows
      .map((s) => {
        const author = users.find((u) => u._id === s.userId);
        const reviewer = s.reviewedBy
          ? users.find((u) => u._id === s.reviewedBy)
          : null;
        return {
          ...s,
          authorName: author?.name ?? author?.email ?? "Unknown",
          authorEmail: author?.email ?? null,
          authorAvatarUrl: author?.avatarUrl ?? author?.image ?? null,
          authorRole: author?.role ?? null,
          authorIsSuperAdmin: author?.isSuperAdmin ?? false,
          reviewerName: reviewer?.name ?? reviewer?.email ?? null,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Any authenticated user can create a suggestion. */
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, { title, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const trimmedContent = content.trim();
    if (!trimmedContent) throw new Error("Suggestion cannot be empty");
    if (trimmedContent.length > 5000)
      throw new Error("Suggestion is too long (max 5000 characters)");

    const trimmedTitle = title?.trim();
    if (trimmedTitle && trimmedTitle.length > 200)
      throw new Error("Title is too long (max 200 characters)");

    const now = Date.now();
    return await ctx.db.insert("suggestions", {
      userId,
      title: trimmedTitle || undefined,
      content: trimmedContent,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Author can edit their own suggestion. */
export const updateMine = mutation({
  args: {
    suggestionId: v.id("suggestions"),
    title: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, { suggestionId, title, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const suggestion = await ctx.db.get(suggestionId);
    if (!suggestion) throw new Error("Suggestion not found");
    if (suggestion.userId !== userId)
      throw new Error("You can only edit your own suggestions");

    const trimmedContent = content.trim();
    if (!trimmedContent) throw new Error("Suggestion cannot be empty");
    if (trimmedContent.length > 5000)
      throw new Error("Suggestion is too long (max 5000 characters)");

    const trimmedTitle = title?.trim();
    if (trimmedTitle && trimmedTitle.length > 200)
      throw new Error("Title is too long (max 200 characters)");

    await ctx.db.patch(suggestionId, {
      title: trimmedTitle || undefined,
      content: trimmedContent,
      updatedAt: Date.now(),
    });
  },
});

/** Author can delete their own suggestion. Super admins can also delete any suggestion. */
export const remove = mutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const currentUser = await ctx.db.get(userId);
    if (!currentUser) throw new Error("Not authenticated");

    const suggestion = await ctx.db.get(suggestionId);
    if (!suggestion) throw new Error("Suggestion not found");

    const isAuthor = suggestion.userId === userId;
    const isSuperAdmin = !!currentUser.isSuperAdmin;
    if (!isAuthor && !isSuperAdmin)
      throw new Error("You can only delete your own suggestions");

    await ctx.db.delete(suggestionId);
  },
});

/** Super admin: update status and (optionally) attach a response note. */
export const updateStatus = mutation({
  args: {
    suggestionId: v.id("suggestions"),
    status: SUGGESTION_STATUS,
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, { suggestionId, status, adminNote }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const currentUser = await ctx.db.get(userId);
    if (!currentUser || !currentUser.isSuperAdmin)
      throw new Error("Only super admins can update suggestion status");

    const suggestion = await ctx.db.get(suggestionId);
    if (!suggestion) throw new Error("Suggestion not found");

    const trimmedNote = adminNote?.trim();
    if (trimmedNote && trimmedNote.length > 2000)
      throw new Error("Response note is too long (max 2000 characters)");

    await ctx.db.patch(suggestionId, {
      status,
      adminNote: trimmedNote || undefined,
      reviewedBy: userId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
