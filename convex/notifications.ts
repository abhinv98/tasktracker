import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createNotification = mutation({
  args: {
    recipientId: v.id("users"),
    type: v.union(
      v.literal("task_assigned"),
      v.literal("task_status_changed"),
      v.literal("brief_assigned"),
      v.literal("deliverable_submitted"),
      v.literal("priority_changed"),
      v.literal("brief_completed"),
      v.literal("team_added"),
      v.literal("comment")
    ),
    title: v.string(),
    message: v.string(),
    briefId: v.optional(v.id("briefs")),
    taskId: v.optional(v.id("tasks")),
    triggeredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      ...args,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const getNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { notifications: [], unreadCount: 0 };
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_time", (q) => q.eq("recipientId", userId))
      .order("desc")
      .take(limit);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientId", userId).eq("read", false)
      )
      .collect();
    return { notifications, unreadCount: unread.length };
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientId", userId).eq("read", false)
      )
      .collect();
    return unread.length;
  },
});

export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const notif = await ctx.db.get(notificationId);
    if (!notif || notif.recipientId !== userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(notificationId, { read: true });
  },
});

export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientId", userId).eq("read", false)
      )
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});
