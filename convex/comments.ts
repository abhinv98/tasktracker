import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const getComments = query({
  args: {
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
  },
  handler: async (ctx, { parentType, parentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) =>
        q.eq("parentType", parentType).eq("parentId", parentId)
      )
      .collect();

    const users = await ctx.db.query("users").collect();

    return comments
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => {
        const author = users.find((u) => u._id === c.userId);
        return {
          ...c,
          authorName: author?.name ?? author?.email ?? "Unknown",
          authorRole: author?.role ?? "employee",
        };
      });
  },
});

export const addComment = mutation({
  args: {
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const commentId = await ctx.db.insert("comments", {
      ...args,
      userId,
      createdAt: Date.now(),
    });

    // Create notifications for relevant people
    const user = await ctx.db.get(userId);
    if (args.parentType === "brief") {
      const brief = await ctx.db.get(args.parentId as Id<"briefs">);
      if (brief && brief.assignedManagerId && brief.assignedManagerId !== userId) {
        await ctx.db.insert("notifications", {
          recipientId: brief.assignedManagerId,
          type: "comment",
          title: "New comment on brief",
          message: `${user?.name ?? "Someone"} commented on "${brief.title}"`,
          briefId: args.parentId as Id<"briefs">,
          triggeredBy: userId,
          read: false,
          createdAt: Date.now(),
        });
      }
    }

    return commentId;
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const comment = await ctx.db.get(commentId);
    if (!comment) throw new Error("Comment not found");
    const user = await ctx.db.get(userId);
    if (comment.userId !== userId && user?.role !== "admin") {
      throw new Error("Not authorized");
    }
    await ctx.db.delete(commentId);
  },
});
