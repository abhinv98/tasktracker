import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getTimeEntries = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();

    const users = await ctx.db.query("users").collect();

    return entries.map((e) => {
      const user = users.find((u) => u._id === e.userId);
      return {
        ...e,
        userName: user?.name ?? user?.email ?? "Unknown",
      };
    });
  },
});

export const getActiveTimer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Find an entry without stoppedAt
    const active = entries.find((e) => !e.stoppedAt);
    if (!active) return null;

    const task = await ctx.db.get(active.taskId);
    return { ...active, taskTitle: task?.title };
  },
});

export const startTimer = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Stop any active timer first
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const active = entries.find((e) => !e.stoppedAt);
    if (active) {
      const elapsed = Math.round((Date.now() - active.startedAt) / 60000);
      await ctx.db.patch(active._id, {
        stoppedAt: Date.now(),
        durationMinutes: elapsed,
      });
    }

    return await ctx.db.insert("timeEntries", {
      taskId,
      userId,
      startedAt: Date.now(),
      manual: false,
    });
  },
});

export const stopTimer = mutation({
  args: { entryId: v.id("timeEntries") },
  handler: async (ctx, { entryId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.userId !== userId) throw new Error("Not authorized");
    if (entry.stoppedAt) return;

    const elapsed = Math.round((Date.now() - entry.startedAt) / 60000);
    await ctx.db.patch(entryId, {
      stoppedAt: Date.now(),
      durationMinutes: elapsed,
    });
  },
});

export const addManualEntry = mutation({
  args: {
    taskId: v.id("tasks"),
    durationMinutes: v.number(),
  },
  handler: async (ctx, { taskId, durationMinutes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("timeEntries", {
      taskId,
      userId,
      startedAt: Date.now(),
      stoppedAt: Date.now(),
      durationMinutes,
      manual: true,
    });
  },
});

export const getTaskTimeTotal = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();

    let total = 0;
    for (const e of entries) {
      if (e.durationMinutes) {
        total += e.durationMinutes;
      } else if (!e.stoppedAt) {
        total += Math.round((Date.now() - e.startedAt) / 60000);
      }
    }
    return total;
  },
});
