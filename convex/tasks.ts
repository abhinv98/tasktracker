import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listTasksForBrief = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const users = await ctx.db.query("users").collect();
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const userTeams = await ctx.db.query("userTeams").collect();
    const teams = await ctx.db.query("teams").collect();

    const briefTeamIds = briefTeams.map((bt) => bt.teamId);
    const byTeam: Record<string, { task: (typeof tasks)[0]; assignee: (typeof users)[0] }[]> = {};
    for (const task of tasks) {
      const assignee = users.find((u) => u._id === task.assigneeId);
      const ut = userTeams.find(
        (x) =>
          x.userId === task.assigneeId && briefTeamIds.includes(x.teamId)
      );
      const teamId = ut ? ut.teamId : null;
      const teamName = teamId
        ? (teams.find((t) => t._id === teamId)?.name ?? "Unassigned")
        : "Unassigned";
      if (!byTeam[teamName]) byTeam[teamName] = [];
      byTeam[teamName].push({ task, assignee: assignee! });
    }

    return { tasks, byTeam, users };
  },
});

export const listTasksForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", userId))
      .collect();
    const briefs = await ctx.db.query("briefs").collect();
    return tasks
      .filter((t) => {
        const brief = briefs.find((b) => b._id === t.briefId);
        return brief && brief.status !== "archived";
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => {
        const brief = briefs.find((b) => b._id === t.briefId);
        return { ...t, briefName: brief?.title };
      });
  },
});

export const getTaskDetail = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return null;
    const brief = await ctx.db.get(task.briefId);
    const assignee = await ctx.db.get(task.assigneeId);
    const assignedBy = await ctx.db.get(task.assignedBy);
    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    return { task, brief, assignee, assignedBy, deliverables };
  },
});

export const createTask = mutation({
  args: {
    briefId: v.id("briefs"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.id("users"),
    duration: v.string(),
    durationMinutes: v.number(),
    deadline: v.optional(v.number()),
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    postDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized to create tasks");
    }

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", args.assigneeId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;
    const sortOrder = maxOrder + 1000;

    const taskId = await ctx.db.insert("tasks", {
      ...args,
      assignedBy: userId,
      status: "pending",
      sortOrder,
    });

    await ctx.db.insert("notifications", {
      recipientId: args.assigneeId,
      type: "task_assigned",
      title: "Task assigned",
      message: `You were assigned: ${args.title}`,
      briefId: args.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    await ctx.db.insert("activityLog", {
      briefId: args.briefId,
      taskId,
      userId,
      action: "created_task",
      details: JSON.stringify({ title: args.title, assigneeId: args.assigneeId }),
      timestamp: Date.now(),
    });

    return taskId;
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    duration: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    deadline: v.optional(v.number()),
    clearDeadline: v.optional(v.boolean()),
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    postDate: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, clearDeadline, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief?.assignedManagerId !== userId)) {
      throw new Error("Only admins or assigned managers can edit tasks");
    }

    const updates: Record<string, unknown> = {};
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.duration !== undefined) updates.duration = fields.duration;
    if (fields.durationMinutes !== undefined) updates.durationMinutes = fields.durationMinutes;
    if (fields.deadline !== undefined) updates.deadline = fields.deadline;
    if (clearDeadline) updates.deadline = undefined;
    if (fields.platform !== undefined) updates.platform = fields.platform;
    if (fields.contentType !== undefined) updates.contentType = fields.contentType;
    if (fields.postDate !== undefined) updates.postDate = fields.postDate;

    if (fields.assigneeId !== undefined && fields.assigneeId !== task.assigneeId) {
      updates.assigneeId = fields.assigneeId;
      await ctx.db.insert("notifications", {
        recipientId: task.assigneeId,
        type: "task_status_changed",
        title: "Task reassigned",
        message: `Task "${task.title}" was reassigned`,
        briefId: task.briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("notifications", {
        recipientId: fields.assigneeId,
        type: "task_assigned",
        title: "Task assigned",
        message: `You were assigned: ${fields.title ?? task.title}`,
        briefId: task.briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(taskId, updates);
      await ctx.db.insert("activityLog", {
        briefId: task.briefId,
        taskId,
        userId,
        action: "updated_task",
        details: JSON.stringify(Object.keys(updates)),
        timestamp: Date.now(),
      });
    }
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    newStatus: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("review"),
      v.literal("done")
    ),
  },
  handler: async (ctx, { taskId, newStatus }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);
    const user = await ctx.db.get(userId);

    const canUpdate =
      task.assigneeId === userId ||
      user?.role === "admin" ||
      (user?.role === "manager" && brief?.assignedManagerId === userId);
    if (!canUpdate) throw new Error("Not authorized");

    if (newStatus === "done" && user?.role !== "admin" && user?.role !== "manager") {
      throw new Error("Employees cannot mark tasks as done. Submit a deliverable for review.");
    }

    await ctx.db.patch(taskId, {
      status: newStatus,
      ...(newStatus === "done" ? { completedAt: Date.now() } : {}),
    });

    if (task.assignedBy !== userId) {
      await ctx.db.insert("notifications", {
        recipientId: task.assignedBy,
        type: "task_status_changed",
        title: "Task status changed",
        message: `${task.title} → ${newStatus}`,
        briefId: task.briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", task.briefId))
      .collect();
    const allDone = allTasks.every((t) => t._id === taskId ? newStatus === "done" : t.status === "done");
    if (allDone && brief) {
      await ctx.db.patch(task.briefId, { status: "review" });
    }

    await ctx.db.insert("activityLog", {
      briefId: task.briefId,
      taskId,
      userId,
      action: "changed_status",
      details: JSON.stringify({ status: newStatus }),
      timestamp: Date.now(),
    });
  },
});

export const reorderTasks = mutation({
  args: {
    userId: v.id("users"),
    orderedTaskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, { userId, orderedTaskIds }) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Not authenticated");
    const user = await ctx.db.get(currentUserId);
    const isSelf = currentUserId === userId;
    const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
    if (!isSelf && !isAdminOrManager) {
      throw new Error("Not authorized to reorder");
    }

    for (let i = 0; i < orderedTaskIds.length; i++) {
      await ctx.db.patch(orderedTaskIds[i], { sortOrder: (i + 1) * 1000 });
    }

    if (!isSelf && isAdminOrManager) {
      await ctx.db.insert("notifications", {
        recipientId: userId,
        type: "priority_changed",
        title: "Task priorities updated",
        message: "Your task priorities have been reordered",
        triggeredBy: currentUserId,
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

export const reassignTask = mutation({
  args: {
    taskId: v.id("tasks"),
    newAssigneeId: v.id("users"),
  },
  handler: async (ctx, { taskId, newAssigneeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief?.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }

    const oldAssignee = task.assigneeId;
    await ctx.db.patch(taskId, { assigneeId: newAssigneeId });

    await ctx.db.insert("notifications", {
      recipientId: oldAssignee,
      type: "task_status_changed",
      title: "Task removed",
      message: `Task "${task.title}" was reassigned`,
      briefId: task.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      recipientId: newAssigneeId,
      type: "task_assigned",
      title: "Task assigned",
      message: `You were assigned: ${task.title}`,
      briefId: task.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    await ctx.db.insert("activityLog", {
      briefId: task.briefId,
      taskId,
      userId,
      action: "reassigned_task",
      details: JSON.stringify({ from: oldAssignee, to: newAssigneeId }),
      timestamp: Date.now(),
    });
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief?.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    await ctx.db.delete(taskId);
    await ctx.db.insert("activityLog", {
      briefId: task.briefId,
      taskId,
      userId,
      action: "deleted_task",
      timestamp: Date.now(),
    });
  },
});

export const bulkUpdateStatus = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    newStatus: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("review"),
      v.literal("done")
    ),
  },
  handler: async (ctx, { taskIds, newStatus }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);

    for (const taskId of taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) continue;
      const brief = await ctx.db.get(task.briefId);
      const canUpdate =
        task.assigneeId === userId ||
        user?.role === "admin" ||
        (user?.role === "manager" && brief?.assignedManagerId === userId);
      if (!canUpdate) continue;

      if (newStatus === "done" && user?.role !== "admin" && user?.role !== "manager") {
        continue;
      }

      await ctx.db.patch(taskId, {
        status: newStatus,
        ...(newStatus === "done" ? { completedAt: Date.now() } : {}),
      });
    }
  },
});

export const updateTaskBlockers = mutation({
  args: {
    taskId: v.id("tasks"),
    blockedBy: v.array(v.id("tasks")),
  },
  handler: async (ctx, { taskId, blockedBy }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief?.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(taskId, { blockedBy: blockedBy.length > 0 ? blockedBy : undefined });
  },
});
