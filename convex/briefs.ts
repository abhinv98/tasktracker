import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    if (user.role === "manager") {
      const assignedBriefs = await ctx.db
        .query("briefs")
        .withIndex("by_manager", (q) => q.eq("assignedManagerId", userId))
        .collect();
      const allBriefs = await ctx.db.query("briefs").collect();
      const createdBriefs = allBriefs.filter((b) => b.createdBy === userId);
      const briefMap = new Map<string, typeof assignedBriefs[number]>();
      for (const b of [...assignedBriefs, ...createdBriefs]) briefMap.set(b._id, b);
      briefs = [...briefMap.values()];
    } else if (user.role === "employee") {
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
      return {
        ...b,
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Only admins and managers can create briefs");
    }

    const count = await ctx.db.query("briefs").collect();
    const globalPriority = count.length + 1;

    // Auto-assign manager as the brief's manager when they create it
    const assignedManagerId = args.assignedManagerId ?? (user.role === "manager" ? userId : undefined);

    const briefId = await ctx.db.insert("briefs", {
      ...args,
      ...(assignedManagerId ? { assignedManagerId } : {}),
      status: "draft",
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
  },
  handler: async (ctx, { briefId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    const user = await ctx.db.get(userId);

    if (user?.role === "manager" && brief.assignedManagerId !== userId) {
      throw new Error("Not assigned to this brief");
    }
    if (user?.role === "employee") {
      throw new Error("Employees cannot update briefs");
    }

    const updates: Record<string, unknown> = {};
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.status !== undefined) updates.status = fields.status;
    if (fields.assignedManagerId !== undefined)
      updates.assignedManagerId = fields.assignedManagerId;
    if (fields.deadline !== undefined) updates.deadline = fields.deadline;

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
    for (const e of existing) {
      await ctx.db.delete(e._id);
    }
    for (const teamId of teamIds) {
      await ctx.db.insert("briefTeams", { briefId, teamId });
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
    return briefTeams
      .map((bt) => teams.find((t) => t._id === bt.teamId))
      .filter(Boolean);
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
        team: (typeof teams)[0];
        members: { user: (typeof users)[0]; taskCount: number; totalHours: number }[];
      }[],
    };

    for (const bt of briefTeams) {
      const team = teams.find((t) => t._id === bt.teamId);
      if (!team) continue;
      const memberIds = userTeams
        .filter((ut) => ut.teamId === team._id)
        .map((ut) => ut.userId);
      const members = memberIds.map((userId) => {
        const user = users.find((u) => u._id === userId);
        const userTasks = tasks.filter((t) => t.assigneeId === userId);
        const totalMinutes = userTasks.reduce((s, t) => s + t.durationMinutes, 0);
        return {
          user: user!,
          taskCount: userTasks.length,
          totalHours: totalMinutes / 60,
        };
      });
      result.teams.push({ team, members });
    }

    return result;
  },
});

export const getArchivedBriefs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
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
