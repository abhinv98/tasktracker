import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getDeliverablesForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    return await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
  },
});

export const submitDeliverable = mutation({
  args: {
    taskId: v.id("tasks"),
    link: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, { taskId, link, message }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    if (task.assigneeId !== userId) {
      throw new Error("Only the assignee can submit deliverables");
    }

    await ctx.db.insert("deliverables", {
      taskId,
      submittedBy: userId,
      link,
      message,
      submittedAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      recipientId: task.assignedBy,
      type: "deliverable_submitted",
      title: "Deliverable submitted",
      message: `${task.title}: ${message}`,
      briefId: task.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});
