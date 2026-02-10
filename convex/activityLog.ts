import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const logActivity = mutation({
  args: {
    briefId: v.id("briefs"),
    taskId: v.optional(v.id("tasks")),
    userId: v.id("users"),
    action: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, { briefId, taskId, userId, action, details }) => {
    return await ctx.db.insert("activityLog", {
      briefId,
      taskId,
      userId,
      action,
      details,
      timestamp: Date.now(),
    });
  },
});

export const getBriefTimeline = query({
  args: { briefId: v.id("briefs"), limit: v.optional(v.number()) },
  handler: async (ctx, { briefId, limit = 50 }) => {
    const logs = await ctx.db
      .query("activityLog")
      .withIndex("by_brief_time", (q) => q.eq("briefId", briefId))
      .order("desc")
      .take(limit);
    const users = await ctx.db.query("users").collect();
    return logs.map((log) => {
      const user = users.find((u) => u._id === log.userId);
      return {
        ...log,
        userName: user?.name ?? user?.email ?? "Unknown",
      };
    });
  },
});
