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

// Unified query: fetch ALL comments for a brief + all its tasks, merged by time
export const getCommentsForBrief = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Get all tasks belonging to this brief
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const taskMap = new Map(tasks.map((t) => [t._id, t.title]));

    // Get brief-level comments
    const briefComments = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) =>
        q.eq("parentType", "brief").eq("parentId", briefId)
      )
      .collect();

    // Get task-level comments for all tasks in this brief
    const taskCommentArrays = await Promise.all(
      tasks.map((t) =>
        ctx.db
          .query("comments")
          .withIndex("by_parent", (q) =>
            q.eq("parentType", "task").eq("parentId", t._id)
          )
          .collect()
      )
    );
    const taskComments = taskCommentArrays.flat();

    // Merge all comments
    const allComments = [...briefComments, ...taskComments];
    const users = await ctx.db.query("users").collect();

    return allComments
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => {
        const author = users.find((u) => u._id === c.userId);
        const taskName =
          c.parentType === "task" ? (taskMap.get(c.parentId as Id<"tasks">) ?? null) : null;
        return {
          ...c,
          authorName: author?.name ?? author?.email ?? "Unknown",
          authorRole: author?.role ?? "employee",
          taskName,
          taskId: c.parentType === "task" ? c.parentId : null,
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

    const user = await ctx.db.get(userId);
    const userName = user?.name ?? "Someone";

    // Parse @[user:userId:Name] mentions and notify mentioned users
    const mentionRegex = /@\[user:([^:]+):[^\]]*\]/g;
    let match;
    const mentionedUserIds = new Set<string>();
    while ((match = mentionRegex.exec(args.content)) !== null) {
      mentionedUserIds.add(match[1]);
    }

    // Resolve brief context for notifications
    let briefId: Id<"briefs"> | undefined;
    let briefTitle = "";
    if (args.parentType === "brief") {
      briefId = args.parentId as Id<"briefs">;
      const brief = await ctx.db.get(briefId);
      briefTitle = brief?.title ?? "";
    } else if (args.parentType === "task") {
      const task = await ctx.db.get(args.parentId as Id<"tasks">);
      if (task) {
        briefId = task.briefId;
        const brief = await ctx.db.get(task.briefId);
        briefTitle = brief?.title ?? "";
      }
    }

    // Notify mentioned users
    for (const mentionedId of mentionedUserIds) {
      if (mentionedId === userId) continue; // don't notify yourself
      await ctx.db.insert("notifications", {
        recipientId: mentionedId as Id<"users">,
        type: "comment",
        title: "You were mentioned",
        message: `${userName} mentioned you in "${briefTitle}"`,
        ...(briefId ? { briefId } : {}),
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    // Also notify brief manager if it's a brief-level comment and they weren't already mentioned
    if (args.parentType === "brief" && briefId) {
      const brief = await ctx.db.get(briefId);
      if (
        brief?.assignedManagerId &&
        brief.assignedManagerId !== userId &&
        !mentionedUserIds.has(brief.assignedManagerId)
      ) {
        await ctx.db.insert("notifications", {
          recipientId: brief.assignedManagerId,
          type: "comment",
          title: "New comment on brief",
          message: `${userName} commented on "${briefTitle}"`,
          briefId,
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
