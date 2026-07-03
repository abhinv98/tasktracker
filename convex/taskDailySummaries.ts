import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listSummaries = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const summaries = await ctx.db
      .query("taskDailySummaries")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();

    const users = await ctx.db.query("users").collect();

    return summaries
      .map((s) => {
        const author = users.find((u) => u._id === s.userId);
        return {
          ...s,
          authorName: author?.name ?? author?.email ?? "Unknown",
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const addSummary = mutation({
  args: {
    taskId: v.id("tasks"),
    date: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, { taskId, date, summary }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    if (task.assigneeId !== userId) {
      throw new Error("Only the task assignee can add daily summaries");
    }

    const existing = await ctx.db
      .query("taskDailySummaries")
      .withIndex("by_task_date", (q) => q.eq("taskId", taskId).eq("date", date))
      .first();
    if (existing) {
      throw new Error("A summary for this date already exists. Please edit it instead.");
    }

    return await ctx.db.insert("taskDailySummaries", {
      taskId,
      userId,
      date,
      summary,
      createdAt: Date.now(),
    });
  },
});

export const updateSummary = mutation({
  args: {
    summaryId: v.id("taskDailySummaries"),
    summary: v.string(),
  },
  handler: async (ctx, { summaryId, summary }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db.get(summaryId);
    if (!existing) throw new Error("Summary not found");
    if (existing.userId !== userId) {
      throw new Error("Only the author can edit this summary");
    }

    await ctx.db.patch(summaryId, { summary });
  },
});

export const deleteSummary = mutation({
  args: { summaryId: v.id("taskDailySummaries") },
  handler: async (ctx, { summaryId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db.get(summaryId);
    if (!existing) throw new Error("Summary not found");

    const user = await ctx.db.get(userId);
    if (existing.userId !== userId && user?.role !== "admin") {
      throw new Error("Not authorized to delete this summary");
    }

    await ctx.db.delete(summaryId);
  },
});
