import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function normalizeDeadlineToEndOfDay(deadline: number): number {
  const d = new Date(deadline);
  const uh = d.getUTCHours(), um = d.getUTCMinutes(), us = d.getUTCSeconds();
  // Midnight UTC
  if (uh === 0 && um === 0 && us === 0) {
    d.setUTCHours(23, 59, 59, 999);
    return d.getTime();
  }
  // Midnight IST (UTC+5:30) = 18:30:00 UTC previous day
  if (uh === 18 && um === 30 && us === 0) {
    // Move to 23:59:59 IST same day = 18:29:59 UTC next day
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(18, 29, 59, 999);
    return d.getTime();
  }
  return deadline;
}

export const listBriefs = query({
  args: {
    status: v.optional(v.string()),
    managerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    let briefs = await ctx.db.query("briefs").collect();
    if (user.role === "employee") {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
        .collect();
      const briefIds = [...new Set(tasks.map((t) => t.briefId))];
      const allBriefs = await ctx.db.query("briefs").collect();
      briefs = allBriefs.filter((b) => briefIds.includes(b._id));
    }

    if (args.status) {
      briefs = briefs.filter((b) => b.status === args.status);
    }
    if (args.managerId) {
      briefs = briefs.filter((b) => b.assignedManagerId === args.managerId);
    }

    const managers = await ctx.db.query("users").collect();
    const briefTeams = await ctx.db.query("briefTeams").collect();
    const teams = await ctx.db.query("teams").collect();
    const allTasks = await ctx.db.query("tasks").collect();

    return briefs.map((b) => {
      const manager = managers.find((m) => m._id === b.assignedManagerId);
      const bt = briefTeams.filter((x) => x.briefId === b._id);
      const teamNames = bt
        .map((x) => teams.find((t) => t._id === x.teamId)?.name)
        .filter(Boolean); 
      const tasksInBrief = allTasks.filter((t) => t.briefId === b._id);
      const doneCount = tasksInBrief.filter((t) => t.status === "done").length;

      // For single_task briefs, use the task's deadline (which may have been extended)
      let effectiveDeadline = b.deadline;
      if (b.briefType === "single_task" && tasksInBrief.length > 0) {
        const taskDeadline = tasksInBrief[0].deadline;
        if (taskDeadline !== undefined) {
          effectiveDeadline = taskDeadline;
        }
      }

      return {
        ...b,
        deadline: effectiveDeadline,
        managerName: manager?.name ?? manager?.email,
        teamNames,
        taskCount: tasksInBrief.length,
        doneCount,
        progress:
          tasksInBrief.length > 0 ? (doneCount / tasksInBrief.length) * 100 : 0,
      };
    });
  },
});

export const getBrief = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const brief = await ctx.db.get(briefId);
    if (!brief) return null;
    const manager = brief.assignedManagerId
      ? await ctx.db.get(brief.assignedManagerId)
      : null;
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const teams = await ctx.db.query("teams").collect();
    const assignedTeams = briefTeams
      .map((bt) => teams.find((t) => t._id === bt.teamId))
      .filter(Boolean);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const doneCount = tasks.filter((t) => t.status === "done").length;
    return {
      ...brief,
      manager,
      assignedTeams,
      tasks,
      taskCount: tasks.length,
      doneCount,
      progress: tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0,
    };
  },
});

export const createBrief = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    assignedManagerId: v.optional(v.id("users")),
    deadline: v.optional(v.number()),
    brandId: v.optional(v.id("brands")),
    briefType: v.optional(
      v.union(
        v.literal("developmental"),
        v.literal("designing"),
        v.literal("video_editing"),
        v.literal("content_calendar"),
        v.literal("copywriting"),
        v.literal("single_task")
      )
    ),
    // Single task brief: inline task fields
    taskTitle: v.optional(v.string()),
    taskDescription: v.optional(v.string()),
    taskAssigneeId: v.optional(v.id("users")),
    taskDuration: v.optional(v.string()),
    taskDurationMinutes: v.optional(v.number()),
    taskClientFacing: v.optional(v.boolean()),
    teamIds: v.optional(v.array(v.id("teams"))),
    creativesRequired: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can create briefs");
    }

    const count = await ctx.db.query("briefs").collect();
    const globalPriority = count.length + 1;

    let assignedManagerId = args.assignedManagerId;
    if (!assignedManagerId && args.brandId) {
      const brandMgrs = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
      if (brandMgrs.length > 0) assignedManagerId = brandMgrs[0].managerId;
    }

    const {
      taskTitle,
      taskDescription,
      taskAssigneeId,
      taskDuration,
      taskDurationMinutes,
      taskClientFacing,
      teamIds,
      creativesRequired: creativesRequiredArg,
      ...briefArgs
    } = args;

    if (briefArgs.deadline !== undefined) {
      briefArgs.deadline = normalizeDeadlineToEndOfDay(briefArgs.deadline);
    }

    const creativesRequired =
      creativesRequiredArg !== undefined && creativesRequiredArg >= 1
        ? Math.min(99, Math.floor(creativesRequiredArg))
        : undefined;

    const briefId = await ctx.db.insert("briefs", {
      ...briefArgs,
      ...(assignedManagerId ? { assignedManagerId } : {}),
      ...(creativesRequired !== undefined ? { creativesRequired } : {}),
      status: args.briefType === "single_task" ? "active" : "draft",
      createdBy: userId,
      globalPriority,
    });

    await ctx.db.insert("activityLog", {
      briefId,
      userId,
      action: "created_brief",
      details: JSON.stringify({ title: args.title }),
      timestamp: Date.now(),
    });

    if (teamIds && teamIds.length > 0) {
      for (const teamId of teamIds) {
        await ctx.db.insert("briefTeams", { briefId, teamId });
      }
      const teams = await Promise.all(teamIds.map((id) => ctx.db.get(id)));
      for (const team of teams) {
        if (team?.leadId && team.leadId !== userId) {
          await ctx.db.insert("notifications", {
            recipientId: team.leadId,
            type: "team_added",
            title: "Team added to brief",
            message: `Your team ${team.name} was added to a brief "${args.title}"`,
            briefId,
            triggeredBy: userId,
            read: false,
            createdAt: Date.now(),
          });
        }
      }
    }

    if (args.briefType === "single_task" && taskAssigneeId) {
      const taskDeadline = briefArgs.deadline;
      const taskId = await ctx.db.insert("tasks", {
        briefId,
        title: taskTitle || args.title,
        description: taskDescription,
        assigneeId: taskAssigneeId,
        assignedBy: userId,
        status: "pending",
        sortOrder: 1000,
        ...(taskDuration ? { duration: taskDuration } : {}),
        ...(taskDurationMinutes ? { durationMinutes: taskDurationMinutes } : {}),
        ...(taskDeadline ? { deadline: taskDeadline } : {}),
        assignedAt: Date.now(),
        ...(taskClientFacing ? { clientFacing: true } : {}),
      });

      await ctx.db.insert("notifications", {
        recipientId: taskAssigneeId,
        type: "task_assigned",
        title: "Task assigned",
        message: `You were assigned "${taskTitle || args.title}"`,
        briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    return briefId;
  },
});

export const updateBrief = mutation({
  args: {
    briefId: v.id("briefs"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    assignedManagerId: v.optional(v.id("users")),
    deadline: v.optional(v.number()),
    briefType: v.optional(
      v.union(
        v.literal("developmental"),
        v.literal("designing"),
        v.literal("video_editing"),
        v.literal("content_calendar"),
        v.literal("copywriting"),
        v.literal("single_task")
      )
    ),
    creativesRequired: v.optional(v.number()),
  },
  handler: async (ctx, { briefId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    const user = await ctx.db.get(userId);

    if (user?.role === "employee") {
      throw new Error("Employees cannot update briefs");
    }

    const updates: Record<string, unknown> = {};
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.status !== undefined) updates.status = fields.status;
    if (fields.assignedManagerId !== undefined)
      updates.assignedManagerId = fields.assignedManagerId;
    if (fields.deadline !== undefined) updates.deadline = normalizeDeadlineToEndOfDay(fields.deadline);
    if (fields.briefType !== undefined) updates.briefType = fields.briefType;
    if (fields.creativesRequired !== undefined) {
      const n = fields.creativesRequired;
      updates.creativesRequired =
        n >= 1 ? Math.min(99, Math.floor(n)) : undefined;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(briefId, updates);
      await ctx.db.insert("activityLog", {
        briefId,
        userId,
        action: "updated_brief",
        details: JSON.stringify(updates),
        timestamp: Date.now(),
      });
    }
  },
});

export const assignManagerToBrief = mutation({
  args: {
    briefId: v.id("briefs"),
    managerId: v.id("users"),
  },
  handler: async (ctx, { briefId, managerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can assign managers");
    }
    await ctx.db.patch(briefId, { assignedManagerId: managerId });
    await ctx.db.insert("activityLog", {
      briefId,
      userId,
      action: "assigned_manager",
      details: JSON.stringify({ managerId }),
      timestamp: Date.now(),
    });
    await ctx.db.insert("notifications", {
      recipientId: managerId,
      type: "brief_assigned",
      title: "Brief assigned",
      message: "You have been assigned to a new brief",
      briefId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const assignTeamsToBrief = mutation({
  args: {
    briefId: v.id("briefs"),
    teamIds: v.array(v.id("teams")),
  },
  handler: async (ctx, { briefId, teamIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }

    const existing = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    // Build a map of current orders to preserve them
    const existingOrderMap = new Map(existing.map((e) => [e.teamId as string, e.order]));
    for (const e of existing) {
      await ctx.db.delete(e._id);
    }
    let nextOrder = Math.max(0, ...existing.map((e) => (e.order ?? -1) + 1));
    for (const teamId of teamIds) {
      const order = existingOrderMap.get(teamId as string) ?? nextOrder++;
      await ctx.db.insert("briefTeams", { briefId, teamId, order });
    }

    const teams = await ctx.db.query("teams").collect();
    for (const teamId of teamIds) {
      const team = teams.find((t) => t._id === teamId);
      if (team?.leadId) {
        await ctx.db.insert("notifications", {
          recipientId: team.leadId,
          type: "team_added",
          title: "Team added to brief",
          message: `Your team ${team.name} was added to a brief`,
          briefId,
          triggeredBy: userId,
          read: false,
          createdAt: Date.now(),
        });
      }
    }

    await ctx.db.insert("activityLog", {
      briefId,
      userId,
      action: "assigned_teams",
      details: JSON.stringify({ teamIds }),
      timestamp: Date.now(),
    });
  },
});

export const removeTeamFromBrief = mutation({
  args: { briefId: v.id("briefs"), teamId: v.id("teams") },
  handler: async (ctx, { briefId, teamId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    const links = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const link = links.find((l) => l.teamId === teamId);
    if (link) {
      await ctx.db.delete(link._id);
    }
  },
});

export const archiveBrief = mutation({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(briefId, {
      status: "archived",
      archivedAt: Date.now(),
      archivedBy: userId,
    });
    await ctx.db.insert("activityLog", {
      briefId,
      userId,
      action: "archived",
      timestamp: Date.now(),
    });
  },
});

export const deleteBrief = mutation({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can delete briefs");
    }
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");

    // Delete all tasks in this brief
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    for (const task of tasks) {
      // Delete deliverables for each task
      const deliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const d of deliverables) {
        await ctx.db.delete(d._id);
      }
      await ctx.db.delete(task._id);
    }

    // Delete brief-team links
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    for (const bt of briefTeams) {
      await ctx.db.delete(bt._id);
    }

    // Delete task connections
    const connections = await ctx.db
      .query("taskConnections")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    for (const c of connections) {
      await ctx.db.delete(c._id);
    }

    // Delete activity log entries
    const logs = await ctx.db
      .query("activityLog")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    // Delete notifications referencing this brief
    const notifs = await ctx.db.query("notifications").collect();
    for (const n of notifs) {
      if (n.briefId === briefId) {
        await ctx.db.delete(n._id);
      }
    }

    await ctx.db.delete(briefId);
  },
});

export const restoreBrief = mutation({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can restore briefs");
    }
    await ctx.db.patch(briefId, {
      status: "draft",
      archivedAt: undefined,
      archivedBy: undefined,
    });
    await ctx.db.insert("activityLog", {
      briefId,
      userId,
      action: "restored",
      timestamp: Date.now(),
    });
  },
});

export const getTeamsForBrief = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const teams = await ctx.db.query("teams").collect();
    const sorted = briefTeams.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const result: (typeof teams[number] & { order: number })[] = [];
    for (const bt of sorted) {
      const team = teams.find((t) => t._id === bt.teamId);
      if (team) result.push({ ...team, order: bt.order ?? 0 } as any);
    }
    return result;
  },
});

export const getBriefGraphData = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const brief = await ctx.db.get(briefId);
    if (!brief) return null;
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const teams = await ctx.db.query("teams").collect();
    const userTeams = await ctx.db.query("userTeams").collect();
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const users = await ctx.db.query("users").collect();

    const result = {
      brief,
      teams: [] as {
        team: (typeof teams)[0] & { order?: number };
        members: { user: (typeof users)[0]; taskCount: number; totalHours: number }[];
      }[],
    };

    const sortedBriefTeams = [...briefTeams].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const bt of sortedBriefTeams) {
      const team = teams.find((t) => t._id === bt.teamId);
      if (!team) continue;
      const memberIds = userTeams
        .filter((ut) => ut.teamId === team._id)
        .map((ut) => ut.userId);
      const members = memberIds.map((userId) => {
        const user = users.find((u) => u._id === userId);
        const userTasks = tasks.filter((t) => t.assigneeId === userId);
        const totalMinutes = userTasks.reduce((s, t) => s + (t.durationMinutes ?? 0), 0);
        return {
          user: user!,
          taskCount: userTasks.length,
          totalHours: totalMinutes / 60,
        };
      });
      result.teams.push({ team: { ...team, order: bt.order ?? 0 }, members });
    }

    return result;
  },
});

export const listBriefsForEmployee = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const myTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    const briefIds = [...new Set(myTasks.map((t) => t.briefId))];

    const briefs = await Promise.all(briefIds.map((id) => ctx.db.get(id)));
    return briefs
      .filter((b): b is NonNullable<typeof b> => !!b && b.status !== "archived")
      .map((b) => ({ _id: b._id, title: b.title }));
  },
});

// ─── TEAM ORDERING ──────────────────────────────────
export const updateTeamOrder = mutation({
  args: {
    briefId: v.id("briefs"),
    teamOrders: v.array(v.object({ teamId: v.id("teams"), order: v.number() })),
  },
  handler: async (ctx, { briefId, teamOrders }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    for (const { teamId, order } of teamOrders) {
      const bt = briefTeams.find((bt) => bt.teamId === teamId);
      if (bt) await ctx.db.patch(bt._id, { order });
    }
  },
});

// ─── TASK CONNECTIONS (sequential flow) ─────────────
export const listTaskConnections = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    return await ctx.db
      .query("taskConnections")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
  },
});

export const addTaskConnection = mutation({
  args: {
    briefId: v.id("briefs"),
    sourceTaskId: v.id("tasks"),
    targetTaskId: v.id("tasks"),
  },
  handler: async (ctx, { briefId, sourceTaskId, targetTaskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    // Prevent duplicate connections
    const existing = await ctx.db
      .query("taskConnections")
      .withIndex("by_source", (q) => q.eq("sourceTaskId", sourceTaskId))
      .collect();
    if (existing.some((c) => c.targetTaskId === targetTaskId)) {
      return; // already connected
    }
    // Prevent self-connections
    if (sourceTaskId === targetTaskId) throw new Error("Cannot connect a task to itself");
    await ctx.db.insert("taskConnections", {
      briefId,
      sourceTaskId,
      targetTaskId,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const removeTaskConnection = mutation({
  args: { connectionId: v.id("taskConnections") },
  handler: async (ctx, { connectionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const connection = await ctx.db.get(connectionId);
    if (!connection) throw new Error("Connection not found");
    const user = await ctx.db.get(userId);
    const brief = await ctx.db.get(connection.briefId);
    if (!user || (user.role !== "admin" && brief?.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    await ctx.db.delete(connectionId);
  },
});

export const getArchivedBriefs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      return [];
    }
    const briefs = await ctx.db
      .query("briefs")
      .withIndex("by_status", (q) => q.eq("status", "archived"))
      .collect();
    const managers = await ctx.db.query("users").collect();
    const allTasks = await ctx.db.query("tasks").collect();
    return briefs.map((b) => {
      const manager = managers.find((m) => m._id === b.archivedBy);
      const tasks = allTasks.filter((t) => t.briefId === b._id);
      const doneCount = tasks.filter((t) => t.status === "done").length;
      return {
        ...b,
        archivedByName: manager?.name ?? manager?.email,
        taskCount: tasks.length,
        doneCount,
      };
    });
  },
});
