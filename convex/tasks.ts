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
    duration: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    deadline: v.optional(v.number()),
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    postDate: v.optional(v.string()),
    clientFacing: v.optional(v.boolean()),
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
    assignedBy: v.optional(v.id("users")),
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
    if (fields.assignedBy !== undefined) updates.assignedBy = fields.assignedBy;
    if (fields.platform !== undefined) updates.platform = fields.platform;
    if (fields.contentType !== undefined) updates.contentType = fields.contentType;
    if (fields.postDate !== undefined) updates.postDate = fields.postDate;

    if (fields.assigneeId !== undefined && fields.assigneeId !== task.assigneeId) {
      updates.assigneeId = fields.assigneeId;
      updates.assignedAt = Date.now();
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
      task.assigneeId === userId || user?.role === "admin";
    if (!canUpdate) throw new Error("Not authorized");

    if (newStatus === "done" && user?.role !== "admin") {
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
    const isAdmin = user?.role === "admin";
    if (!isSelf && !isAdmin) {
      throw new Error("Not authorized to reorder");
    }

    for (let i = 0; i < orderedTaskIds.length; i++) {
      await ctx.db.patch(orderedTaskIds[i], { sortOrder: (i + 1) * 1000 });
    }

    if (!isSelf && isAdmin) {
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
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can delete tasks");
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
        task.assigneeId === userId || user?.role === "admin";
      if (!canUpdate) continue;

      if (newStatus === "done" && user?.role !== "admin") {
        continue;
      }

      await ctx.db.patch(taskId, {
        status: newStatus,
        ...(newStatus === "done" ? { completedAt: Date.now() } : {}),
      });
    }
  },
});

// ─── SUB-TASKS ────────────────────────────────
export const createSubTask = mutation({
  args: {
    parentTaskId: v.id("tasks"),
    assigneeId: v.id("users"),
    description: v.string(),
    duration: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const parentTask = await ctx.db.get(args.parentTaskId);
    if (!parentTask) throw new Error("Parent task not found");

    // Verify current user is a team lead of the assignee's team
    const assigneeTeams = await ctx.db
      .query("userTeams")
      .withIndex("by_user", (q) => q.eq("userId", args.assigneeId))
      .collect();
    const teams = await Promise.all(assigneeTeams.map((ut) => ctx.db.get(ut.teamId)));
    const isTeamLead = teams.some((t) => t && t.leadId === userId);

    const user = await ctx.db.get(userId);
    if (!isTeamLead && user?.role !== "admin") {
      throw new Error("Only team leads or admins can create sub-tasks");
    }

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", args.assigneeId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const taskId = await ctx.db.insert("tasks", {
      briefId: parentTask.briefId,
      title: `${parentTask.title} — Sub-task`,
      description: args.description,
      assigneeId: args.assigneeId,
      assignedBy: userId,
      status: "pending",
      sortOrder: maxOrder + 1000,
      ...(args.duration ? { duration: args.duration } : {}),
      ...(args.durationMinutes ? { durationMinutes: args.durationMinutes } : {}),
      ...(args.deadline ? { deadline: args.deadline } : {}),
      parentTaskId: args.parentTaskId,
    });

    await ctx.db.insert("notifications", {
      recipientId: args.assigneeId,
      type: "task_assigned",
      title: "Sub-task assigned",
      message: `You were added as a helper on "${parentTask.title}"`,
      briefId: parentTask.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    return taskId;
  },
});

export const getSubTasks = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, { parentTaskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const subTasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", parentTaskId))
      .collect();

    const users = await ctx.db.query("users").collect();
    return subTasks.map((t) => {
      const assignee = users.find((u) => u._id === t.assigneeId);
      return {
        ...t,
        assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
      };
    });
  },
});

export const createEmployeeTask = mutation({
  args: {
    briefId: v.id("briefs"),
    title: v.string(),
    description: v.optional(v.string()),
    assignorId: v.id("users"),
    duration: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "employee") {
      throw new Error("Only employees can create additional tasks");
    }

    const assignor = await ctx.db.get(args.assignorId);
    if (!assignor || assignor.role !== "admin") {
      throw new Error("Assignor must be an admin");
    }

    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", userId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const taskId = await ctx.db.insert("tasks", {
      briefId: args.briefId,
      title: args.title,
      description: args.description,
      assigneeId: userId,
      assignedBy: args.assignorId,
      status: "pending",
      sortOrder: maxOrder + 1000,
      ...(args.duration ? { duration: args.duration } : {}),
      ...(args.durationMinutes ? { durationMinutes: args.durationMinutes } : {}),
      ...(args.deadline ? { deadline: args.deadline } : {}),
      assignedAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      recipientId: args.assignorId,
      type: "task_assigned",
      title: "Employee added a task",
      message: `${user.name ?? user.email} added a task "${args.title}" under "${brief.title}"`,
      briefId: args.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    return taskId;
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

// ─── OVERDUE HALT FLOW ────────────────────────────

export const getOverdueHaltStatus = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "employee") return null;

    const now = Date.now();
    const myTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();

    const overdueTasks = myTasks.filter(
      (t) => t.deadline && t.deadline < now && t.status !== "done" && t.overdueAcknowledged !== true
    );

    if (overdueTasks.length === 0) return null;

    const briefs = await Promise.all(overdueTasks.map((t) => ctx.db.get(t.briefId)));
    const users = await ctx.db.query("users").collect();

    const results = overdueTasks.map((task, i) => {
      const brief = briefs[i];
      const manager = brief?.assignedManagerId
        ? users.find((u) => u._id === brief.assignedManagerId)
        : null;
      return {
        _id: task._id,
        title: task.title,
        deadline: task.deadline!,
        briefTitle: brief?.title ?? "Unknown",
        briefId: task.briefId,
        managerName: manager?.name ?? manager?.email ?? "Brand Manager",
        managerId: brief?.assignedManagerId ?? null,
      };
    });

    return results;
  },
});

export const resumeOverdueTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins/managers can resume tasks");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(taskId, { overdueAcknowledged: true });

    await ctx.db.insert("notifications", {
      recipientId: task.assigneeId,
      type: "task_status_changed",
      title: "Tasks resumed",
      message: `Your tasks have been resumed by ${user.name ?? user.email ?? "a manager"} after overdue review for "${task.title}"`,
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
      action: "resumed_overdue",
      details: JSON.stringify({ assigneeId: task.assigneeId }),
      timestamp: Date.now(),
    });
  },
});

export const extendTaskDeadline = mutation({
  args: {
    taskId: v.id("tasks"),
    newDeadline: v.number(),
  },
  handler: async (ctx, { taskId, newDeadline }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins/managers can extend deadlines");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    const originalDeadline = task.originalDeadline ?? task.deadline;

    await ctx.db.patch(taskId, {
      deadline: newDeadline,
      deadlineExtended: true,
      originalDeadline,
      overdueAcknowledged: true,
    });

    await ctx.db.insert("notifications", {
      recipientId: task.assigneeId,
      type: "deadline_extended",
      title: "Deadline extended",
      message: `The deadline for "${task.title}" has been extended to ${new Date(newDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })} ${new Date(newDeadline).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })}`,
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
      action: "extended_deadline",
      details: JSON.stringify({ originalDeadline, newDeadline }),
      timestamp: Date.now(),
    });
  },
});

export const listOverdueTasksForManager = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const now = Date.now();
    const allTasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const users = await ctx.db.query("users").collect();

    // Find brands this manager is assigned to
    const myBrandAssignments = await ctx.db
      .query("brandManagers")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .collect();
    const myBrandIds = new Set(myBrandAssignments.map((bm) => bm.brandId));

    // Filter to briefs where this user is the assignedManager or is a brand manager for the brief's brand
    const myBriefIds = new Set(
      briefs
        .filter((b) => b.assignedManagerId === userId || (b.brandId && myBrandIds.has(b.brandId)))
        .map((b) => b._id)
    );

    const overdueTasks = allTasks.filter(
      (t) => t.deadline && t.deadline < now && t.status !== "done" && t.overdueAcknowledged !== true && myBriefIds.has(t.briefId)
    );

    // Also check briefs with deadlines that have NO tasks assigned yet
    const overdueBriefsNoTasks = briefs.filter((b) => {
      if (!myBriefIds.has(b._id)) return false;
      if (!b.deadline || b.deadline >= now) return false;
      if (b.status === "completed" || b.status === "archived") return false;
      const briefTasks = allTasks.filter((t) => t.briefId === b._id);
      return briefTasks.length === 0;
    });

    const taskResults = overdueTasks.map((task) => {
      const brief = briefs.find((b) => b._id === task.briefId);
      const assignee = users.find((u) => u._id === task.assigneeId);
      return {
        _id: task._id,
        title: task.title,
        deadline: task.deadline!,
        briefTitle: brief?.title ?? "Unknown",
        briefId: task.briefId,
        brandId: brief?.brandId,
        assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
        assigneeId: task.assigneeId,
        deadlineExtended: task.deadlineExtended ?? false,
        originalDeadline: task.originalDeadline,
        alertType: "overdue" as const,
      };
    });

    const briefResults = overdueBriefsNoTasks.map((brief) => ({
      _id: brief._id,
      title: brief.title,
      deadline: brief.deadline!,
      briefTitle: brief.title,
      briefId: brief._id,
      brandId: brief.brandId,
      assigneeName: "Unassigned",
      assigneeId: null as string | null,
      deadlineExtended: false,
      originalDeadline: undefined as number | undefined,
      alertType: "unassigned" as const,
    }));

    return [...taskResults, ...briefResults];
  },
});

export const contactManagerForOverdue = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const user = await ctx.db.get(userId);
    const brief = await ctx.db.get(task.briefId);

    const managerId = brief?.assignedManagerId;
    if (!managerId) throw new Error("No brand manager found for this task");

    await ctx.db.insert("notifications", {
      recipientId: managerId,
      type: "overdue_contact",
      title: "Overdue task - Employee contact",
      message: `${user?.name ?? user?.email ?? "An employee"} is requesting a review for overdue task "${task.title}" in "${brief?.title ?? "a brief"}"`,
      briefId: task.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});
