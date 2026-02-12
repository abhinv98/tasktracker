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

    const results = [];
    for (const c of comments.sort((a, b) => a.createdAt - b.createdAt)) {
      const author = users.find((u) => u._id === c.userId);
      let attachmentUrl: string | null = null;
      if (c.attachmentId) {
        attachmentUrl = await ctx.storage.getUrl(c.attachmentId);
      }
      results.push({
        ...c,
        authorName: author?.name ?? author?.email ?? "Unknown",
        authorRole: author?.role ?? "employee",
        attachmentUrl,
      });
    }
    return results;
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

    const results = [];
    for (const c of allComments.sort((a, b) => a.createdAt - b.createdAt)) {
      const author = users.find((u) => u._id === c.userId);
      const taskName =
        c.parentType === "task" ? (taskMap.get(c.parentId as Id<"tasks">) ?? null) : null;
      let attachmentUrl: string | null = null;
      if (c.attachmentId) {
        attachmentUrl = await ctx.storage.getUrl(c.attachmentId);
      }
      results.push({
        ...c,
        authorName: author?.name ?? author?.email ?? "Unknown",
        authorRole: author?.role ?? "employee",
        taskName,
        taskId: c.parentType === "task" ? c.parentId : null,
        attachmentUrl,
      });
    }
    return results;
  },
});

export const addComment = mutation({
  args: {
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
    content: v.string(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const commentId = await ctx.db.insert("comments", {
      parentType: args.parentType,
      parentId: args.parentId,
      content: args.content,
      userId,
      createdAt: Date.now(),
      ...(args.attachmentId ? { attachmentId: args.attachmentId } : {}),
      ...(args.attachmentName ? { attachmentName: args.attachmentName } : {}),
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

// ─── UNREAD COUNTS ───────────────────────────

export const getUnreadCounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return {};

    const receipts = await ctx.db
      .query("commentReadReceipts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const receiptMap = new Map(receipts.map((r) => [r.briefId, r.lastReadAt]));

    // Get all briefs user has access to
    const user = await ctx.db.get(userId);
    let briefs = await ctx.db.query("briefs").collect();
    if (user?.role === "manager") {
      briefs = briefs.filter((b) => b.assignedManagerId === userId);
    } else if (user?.role === "employee") {
      const tasks = await ctx.db.query("tasks").withIndex("by_assignee", (q) => q.eq("assigneeId", userId)).collect();
      const briefIds = new Set(tasks.map((t) => t.briefId));
      briefs = briefs.filter((b) => briefIds.has(b._id));
    }

    const counts: Record<string, number> = {};
    for (const brief of briefs) {
      if (brief.status === "archived") continue;
      const lastRead = receiptMap.get(brief._id) ?? 0;
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) => q.eq("parentType", "brief").eq("parentId", brief._id))
        .collect();
      const unread = comments.filter((c) => c.createdAt > lastRead && c.userId !== userId).length;
      if (unread > 0) counts[brief._id] = unread;
    }
    return counts;
  },
});

export const markBriefRead = mutation({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("commentReadReceipts")
      .withIndex("by_user_brief", (q) => q.eq("userId", userId).eq("briefId", briefId))
      .collect();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { lastReadAt: Date.now() });
    } else {
      await ctx.db.insert("commentReadReceipts", {
        userId,
        briefId,
        lastReadAt: Date.now(),
      });
    }
  },
});

// ─── PINNED MESSAGES ─────────────────────────

export const pinComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Only admins and managers can pin messages");
    }
    await ctx.db.patch(commentId, { pinned: true, pinnedBy: userId });
  },
});

export const unpinComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Only admins and managers can unpin messages");
    }
    await ctx.db.patch(commentId, { pinned: false, pinnedBy: undefined });
  },
});

// ─── REACTIONS ───────────────────────────────

export const toggleReaction = mutation({
  args: {
    commentId: v.id("comments"),
    emoji: v.string(),
  },
  handler: async (ctx, { commentId, emoji }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("commentReactions")
      .withIndex("by_user_comment", (q) => q.eq("userId", userId).eq("commentId", commentId))
      .collect();

    const match = existing.find((r) => r.emoji === emoji);
    if (match) {
      await ctx.db.delete(match._id);
    } else {
      await ctx.db.insert("commentReactions", { commentId, userId, emoji });
    }
  },
});

export const getReactionsForComments = query({
  args: { commentIds: v.array(v.id("comments")) },
  handler: async (ctx, { commentIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return {};

    const result: Record<string, Array<{ emoji: string; count: number; myReaction: boolean }>> = {};
    for (const commentId of commentIds) {
      const reactions = await ctx.db
        .query("commentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", commentId))
        .collect();

      // Group by emoji
      const emojiMap: Record<string, { count: number; myReaction: boolean }> = {};
      for (const r of reactions) {
        if (!emojiMap[r.emoji]) emojiMap[r.emoji] = { count: 0, myReaction: false };
        emojiMap[r.emoji].count++;
        if (r.userId === userId) emojiMap[r.emoji].myReaction = true;
      }
      const entries = Object.entries(emojiMap).map(([emoji, data]) => ({ emoji, ...data }));
      if (entries.length > 0) result[commentId] = entries;
    }
    return result;
  },
});

// ─── TYPING INDICATORS ──────────────────────

export const setTyping = mutation({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_user_brief", (q) => q.eq("userId", userId).eq("briefId", briefId))
      .collect();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { lastTypedAt: Date.now() });
    } else {
      await ctx.db.insert("typingIndicators", { userId, briefId, lastTypedAt: Date.now() });
    }
  },
});

export const getTypingUsers = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const cutoff = Date.now() - 4000; // 4 seconds
    const indicators = await ctx.db
      .query("typingIndicators")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();

    const active = indicators.filter((i) => i.lastTypedAt > cutoff && i.userId !== userId);
    const users = await ctx.db.query("users").collect();

    return active.map((i) => {
      const user = users.find((u) => u._id === i.userId);
      return { userId: i.userId, name: user?.name ?? user?.email ?? "Someone" };
    });
  },
});
