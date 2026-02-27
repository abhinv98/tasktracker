import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listDeliverables = query({
  args: { taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let deliverables;
    if (taskId) {
      deliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
    } else {
      deliverables = await ctx.db.query("deliverables").collect();
    }

    const users = await ctx.db.query("users").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();

    const results = await Promise.all(
      deliverables.map(async (d) => {
        const submitter = users.find((u) => u._id === d.submittedBy);
        const reviewer = d.reviewedBy ? users.find((u) => u._id === d.reviewedBy) : null;
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return {
                name: d.fileNames?.[idx] ?? "file",
                url: url ?? "",
              };
            })
          );
          files = files.filter((f) => f.url);
        }

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          reviewerName: reviewer?.name ?? reviewer?.email,
          taskTitle: task?.title ?? "Unknown",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          files,
        };
      })
    );
    return results;
  },
});

export const submitDeliverable = mutation({
  args: {
    taskId: v.id("tasks"),
    message: v.string(),
    link: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
    fileNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { taskId, message, link, fileIds, fileNames }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    const deliverableId = await ctx.db.insert("deliverables", {
      taskId,
      submittedBy: userId,
      message,
      link,
      submittedAt: Date.now(),
      status: "pending",
      ...(fileIds && fileIds.length > 0 ? { fileIds } : {}),
      ...(fileNames && fileNames.length > 0 ? { fileNames } : {}),
    });

    // Notify the assigner
    const user = await ctx.db.get(userId);
    await ctx.db.insert("notifications", {
      recipientId: task.assignedBy,
      type: "deliverable_submitted",
      title: "Deliverable submitted",
      message: `${user?.name ?? "Someone"} submitted a deliverable for "${task.title}"`,
      briefId: task.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    return deliverableId;
  },
});

export const approveDeliverable = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Only admins/managers can approve deliverables");
    }

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    await ctx.db.patch(deliverableId, {
      status: "approved",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: Date.now(),
    });

    // Mark task as done
    const task = await ctx.db.get(deliverable.taskId);
    if (task) {
      await ctx.db.patch(deliverable.taskId, {
        status: "done",
        completedAt: Date.now(),
      });
    }

    // Notify submitter
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_approved",
      title: "Deliverable approved",
      message: `Your deliverable for "${task?.title ?? "a task"}" was approved`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const rejectDeliverable = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.string(),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Only admins/managers can reject deliverables");
    }

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    await ctx.db.patch(deliverableId, {
      status: "rejected",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: Date.now(),
    });

    // Reopen the task
    const task = await ctx.db.get(deliverable.taskId);
    if (task && task.status === "review") {
      await ctx.db.patch(deliverable.taskId, { status: "in-progress" });
    }

    // Notify submitter
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_rejected",
      title: "Changes requested",
      message: `Changes requested on your deliverable for "${task?.title ?? "a task"}": ${note}`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});
