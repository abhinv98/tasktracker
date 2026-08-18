import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mergeUpstreamResourcesIntoTask } from "./lib/taskFlowResources";
import { cascadeDoneToChildren } from "./lib/cascadeTaskStatus";
import { autoApproveDeliverablesForTaskTree } from "./lib/autoApproveDeliverables";
import { recomputeBriefDeadline } from "./lib/recomputeBriefDeadline";
import { tagForOversight } from "./lib/tagForOversight";

function normalizeDeadlineToEndOfDay(deadline: number): number {
  const d = new Date(deadline);
  const uh = d.getUTCHours(), um = d.getUTCMinutes(), us = d.getUTCSeconds();
  // Midnight UTC
  if (uh === 0 && um === 0 && us === 0) {
    d.setUTCHours(23, 59, 59, 999);
    return d.getTime();
  }
  // Midnight IST (UTC+5:30) = 18:30:00 UTC previous days
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

    // HR work is confidential. Everyone else gets the board minus HR's
    // briefs, HR gets HR's briefs and nothing else, super admins get both.
    // This lives here rather than in the page so the rows never go over the
    // wire — a client-side filter is a disclosure with extra steps.
    const briefTeams = await ctx.db.query("briefTeams").collect();
    const teams = await ctx.db.query("teams").collect();
    const hrTeamId = teams.find((t) => t.name === "HR")?._id;
    if (hrTeamId && user.isSuperAdmin !== true) {
      const hrBriefIds = new Set(
        briefTeams.filter((x) => x.teamId === hrTeamId).map((x) => x.briefId)
      );
      briefs = briefs.filter((b) =>
        user.isHR === true ? hrBriefIds.has(b._id) : !hrBriefIds.has(b._id)
      );
    }

    if (args.status) {
      briefs = briefs.filter((b) => b.status === args.status);
    }
    if (args.managerId) {
      briefs = briefs.filter((b) => b.assignedManagerId === args.managerId);
    }

    const managers = await ctx.db.query("users").collect();
    const allTasks = await ctx.db.query("tasks").collect();

    return briefs.map((b) => {
      const manager = managers.find((m) => m._id === b.assignedManagerId);
      const bt = briefTeams.filter((x) => x.briefId === b._id);
      const teamIds = bt.map((x) => x.teamId);
      const teamNames = bt
        .map((x) => teams.find((t) => t._id === x.teamId)?.name)
        .filter(Boolean); 
      const tasksInBrief = allTasks.filter((t) => t.briefId === b._id);
      // Content-calendar entries are stored as a parent task plus
      // `[Copy]`/`[Design]` children. The user-visible "task" is the entry,
      // so progress should count parents only — otherwise 6 entries register
      // as 12 (or 18) in the bar.
      const countableTasks =
        b.briefType === "content_calendar"
          ? tasksInBrief.filter((t) => t.parentTaskId === undefined)
          : tasksInBrief;
      const doneCount = countableTasks.filter((t) => t.status === "done").length;

      // b.deadline is authoritative: recomputeBriefDeadline keeps it rolled up
      // from tasks on every task write, and a hand-set deadline
      // (deadlineIsManual) must win. No read-time re-derivation — that's what
      // made manual deadlines appear not to stick.

      return {
        ...b,
        managerName: manager?.name ?? manager?.email,
        teamIds,
        teamNames,
        taskCount: countableTasks.length,
        doneCount,
        progress:
          countableTasks.length > 0 ? (doneCount / countableTasks.length) * 100 : 0,
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
    const brand = brief.brandId ? await ctx.db.get(brief.brandId) : null;
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
    // Mirror listBriefs: content-calendar progress counts entries (parents)
    // only, not their Copy/Design children.
    const countableTasks =
      brief.briefType === "content_calendar"
        ? tasks.filter((t) => t.parentTaskId === undefined)
        : tasks;
    const doneCount = countableTasks.filter((t) => t.status === "done").length;

    // brief.deadline is authoritative: recomputeBriefDeadline keeps it rolled
    // up from the tasks on every task write, and a deadline set by hand on the
    // brief (deadlineIsManual) is left alone. Do not re-derive it here — that
    // read-time override used to mask manual edits and snap the picker back.

    return {
      ...brief,
      manager,
      brand,
      assignedTeams,
      tasks,
      taskCount: countableTasks.length,
      doneCount,
      progress:
        countableTasks.length > 0 ? (doneCount / countableTasks.length) * 100 : 0,
    };
  },
});

// Guard against accidental double-submission (double-click / Enter+click):
// if this creator just made a brief with the same title, treat the second
// call as a replay and hand back the existing brief.
const DUPLICATE_SUBMIT_WINDOW_MS = 10_000;

async function findRecentDuplicateBrief(
  ctx: { db: { query: (table: "briefs") => any } },
  userId: Id<"users">,
  title: string
): Promise<Id<"briefs"> | null> {
  const recent = await ctx.db.query("briefs").order("desc").take(25);
  const dup = recent.find(
    (b: { createdBy: Id<"users">; title: string; _creationTime: number; _id: Id<"briefs"> }) =>
      b.createdBy === userId &&
      b.title === title &&
      Date.now() - b._creationTime < DUPLICATE_SUBMIT_WINDOW_MS
  );
  return dup ? dup._id : null;
}

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
    // Content calendar fields
    ccMonth: v.optional(v.string()),
    ccCopyTeamId: v.optional(v.id("teams")),
    ccDesignTeamId: v.optional(v.id("teams")),
    ccCopyAssigneeId: v.optional(v.id("users")),
    ccDesignAssigneeId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can create briefs");
    }

    const duplicateId = await findRecentDuplicateBrief(ctx, userId, args.title);
    if (duplicateId) return duplicateId;

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
      ccMonth,
      ccCopyTeamId,
      ccDesignTeamId,
      ccCopyAssigneeId,
      ccDesignAssigneeId,
      ...briefArgs
    } = args;

    // Content calendar briefs are evergreen (rolling month sheets) and the
    // top-level brief deadline is meaningless for them — every entry inside
    // carries its own deadline. Strip it on create so it never sneaks in.
    if (briefArgs.briefType === "content_calendar") {
      briefArgs.deadline = undefined;
    } else if (briefArgs.deadline !== undefined) {
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

    // ── Content Calendar: create entry + sequential team tasks ──
    if (args.briefType === "content_calendar" && args.brandId && ccMonth) {
      // Activate the brief since we have an entry
      await ctx.db.patch(briefId, { status: "active" as const });

      // Ensure month sheet exists
      const sheets = await ctx.db
        .query("contentCalendarSheets")
        .withIndex("by_brief", (q: any) => q.eq("briefId", briefId))
        .collect();
      if (!sheets.some((s: any) => s.month === ccMonth)) {
        const maxSheetOrder = sheets.length
          ? Math.max(...sheets.map((s: any) => s.sortOrder))
          : 0;
        await ctx.db.insert("contentCalendarSheets", {
          briefId,
          month: ccMonth,
          sortOrder: maxSheetOrder + 1,
          createdBy: userId,
          createdAt: Date.now(),
        });
      }

      // Create parent entry task (the calendar card)
      const postDate = `${ccMonth}-01`;
      const parentTaskId = await ctx.db.insert("tasks", {
        briefId,
        title: args.title,
        description: args.description || undefined,
        assigneeId: userId, // admin owns the parent entry
        assignedBy: userId,
        status: "pending",
        sortOrder: 1000,
        duration: "1d",
        durationMinutes: 480,
        platform: "Other",
        contentType: "Post",
        postDate,
        assignedAt: Date.now(),
        ...(ccDesignTeamId ? { handoffTargetTeamId: ccDesignTeamId } : {}),
      });

      await tagForOversight(ctx, {
        taskId: parentTaskId,
        briefId,
        assigneeId: userId,
        assignedBy: userId,
        source: "content_calendar",
      });

      // Create Copy team linked task (step 1)
      if (ccCopyTeamId) {
        const copyAssignee = ccCopyAssigneeId ?? userId;
        const copyTaskId = await ctx.db.insert("tasks", {
          briefId,
          title: `[Copy] ${args.title}`,
          description: args.description || undefined,
          assigneeId: copyAssignee,
          assignedBy: userId,
          status: "pending",
          sortOrder: 1001,
          duration: "1d",
          durationMinutes: 480,
          platform: "Other",
          contentType: "Post",
          postDate,
          parentTaskId,
          assignedAt: Date.now(),
          ...(ccDesignTeamId ? { handoffTargetTeamId: ccDesignTeamId } : {}),
        });

        await tagForOversight(ctx, {
          taskId: copyTaskId,
          briefId,
          assigneeId: copyAssignee,
          assignedBy: userId,
          source: "content_calendar",
        });

        // Link copy team to brief
        await ctx.db.insert("briefTeams", { briefId, teamId: ccCopyTeamId, order: 0 });

        if (ccCopyAssigneeId && ccCopyAssigneeId !== userId) {
          await ctx.db.insert("notifications", {
            recipientId: ccCopyAssigneeId,
            type: "task_assigned",
            title: "Content calendar task assigned",
            message: `You were assigned copy: "${args.title}"`,
            briefId,
            taskId: copyTaskId,
            triggeredBy: userId,
            read: false,
            createdAt: Date.now(),
          });
        }
      }

      // Create Design team linked task (step 2)
      if (ccDesignTeamId) {
        const designAssignee = ccDesignAssigneeId ?? userId;
        const designTaskId = await ctx.db.insert("tasks", {
          briefId,
          title: `[Design] ${args.title}`,
          description: args.description || undefined,
          assigneeId: designAssignee,
          assignedBy: userId,
          status: "pending",
          sortOrder: 1002,
          duration: "1d",
          durationMinutes: 480,
          platform: "Other",
          contentType: "Post",
          postDate,
          parentTaskId,
          assignedAt: Date.now(),
        });

        await tagForOversight(ctx, {
          taskId: designTaskId,
          briefId,
          assigneeId: designAssignee,
          assignedBy: userId,
          source: "content_calendar",
        });

        // Link design team to brief
        await ctx.db.insert("briefTeams", { briefId, teamId: ccDesignTeamId, order: 1 });

        if (ccDesignAssigneeId && ccDesignAssigneeId !== userId) {
          await ctx.db.insert("notifications", {
            recipientId: ccDesignAssigneeId,
            type: "task_assigned",
            title: "Content calendar task assigned",
            message: `You were assigned design: "${args.title}"`,
            briefId,
            taskId: designTaskId,
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

      await tagForOversight(ctx, {
        taskId,
        briefId,
        assigneeId: taskAssigneeId,
        assignedBy: userId,
        source: "individual_task",
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

/**
 * Unified Individual Task creation. Replaces the old "Single Task" + "For Calendar"
 * split. Creates either:
 *   (a) A single_task brief with ONE task        — 1 team, no CC opt-in
 *   (b) A single_task brief with SEQUENTIAL tasks chained via handoffTargetTeamId
 *        — 2+ teams, no CC opt-in. brief.deadline = overallDeadline.
 *   (c) A calendar entry (parent task + Copy/Design children) under the brand's
 *        auto-found / auto-created content_calendar brief — CC opt-in.
 *        Teams are inserted as Copy → Design via handoffTargetTeamId.
 */
export const createIndividualTaskBrief = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    assignedManagerId: v.optional(v.id("users")),
    overallDeadline: v.optional(v.number()),
    clientFacing: v.optional(v.boolean()),
    briefType: v.optional(
      v.union(
        v.literal("developmental"),
        v.literal("designing"),
        v.literal("video_editing"),
        v.literal("copywriting")
      )
    ),
    creativesRequired: v.optional(v.number()),
    teams: v.array(
      v.object({
        teamId: v.id("teams"),
        assigneeId: v.id("users"),
        deadline: v.optional(v.number()),
      })
    ),
    contentCalendar: v.optional(
      v.object({
        month: v.optional(v.string()),
        goLiveDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can create briefs");
    }

    if (args.teams.length === 0) {
      throw new Error("At least one team assignment is required");
    }

    const now = Date.now();
    const useCalendar = !!args.contentCalendar && !!args.brandId;

    // Normalize deadlines
    const normalizedOverall = args.overallDeadline
      ? normalizeDeadlineToEndOfDay(args.overallDeadline)
      : undefined;
    const normalizedTeams = args.teams.map((t) => ({
      ...t,
      deadline: t.deadline ? normalizeDeadlineToEndOfDay(t.deadline) : undefined,
    }));

    const creativesRequired =
      args.creativesRequired !== undefined && args.creativesRequired >= 1
        ? Math.min(99, Math.floor(args.creativesRequired))
        : undefined;

    // ─── Branch A/B: single_task brief (no CC) ───
    if (!useCalendar) {
      const duplicateId = await findRecentDuplicateBrief(ctx, userId, args.title);
      if (duplicateId) return duplicateId;

      let assignedManagerId = args.assignedManagerId;
      if (!assignedManagerId && args.brandId) {
        const brandMgrs = await ctx.db
          .query("brandManagers")
          .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
          .collect();
        if (brandMgrs.length > 0) assignedManagerId = brandMgrs[0].managerId;
      }

      const count = await ctx.db.query("briefs").collect();
      const globalPriority = count.length + 1;

      const briefId = await ctx.db.insert("briefs", {
        title: args.title,
        description: args.description ?? "",
        status: "active",
        briefType: args.briefType ?? "single_task",
        createdBy: userId,
        globalPriority,
        ...(args.brandId ? { brandId: args.brandId } : {}),
        ...(assignedManagerId ? { assignedManagerId } : {}),
        ...(normalizedOverall !== undefined ? { deadline: normalizedOverall } : {}),
        ...(creativesRequired !== undefined ? { creativesRequired } : {}),
      });

      await ctx.db.insert("activityLog", {
        briefId,
        userId,
        action: "created_brief",
        details: JSON.stringify({ title: args.title }),
        timestamp: now,
      });

      // Insert briefTeams
      for (let i = 0; i < normalizedTeams.length; i++) {
        await ctx.db.insert("briefTeams", {
          briefId,
          teamId: normalizedTeams[i].teamId,
          order: i,
        });
      }

      // Notify team leads
      const teamsData = await Promise.all(
        normalizedTeams.map((t) => ctx.db.get(t.teamId))
      );
      for (const team of teamsData) {
        if (team?.leadId && team.leadId !== userId) {
          await ctx.db.insert("notifications", {
            recipientId: team.leadId,
            type: "team_added",
            title: "Team added to brief",
            message: `Your team ${team.name} was added to a brief "${args.title}"`,
            briefId,
            triggeredBy: userId,
            read: false,
            createdAt: now,
          });
        }
      }

      // Create sequential tasks chained via handoffTargetTeamId
      for (let i = 0; i < normalizedTeams.length; i++) {
        const t = normalizedTeams[i];
        const nextTeamId = i < normalizedTeams.length - 1 ? normalizedTeams[i + 1].teamId : undefined;
        // Task deadline priority: per-member > overall (fallback)
        const taskDeadline = t.deadline ?? normalizedOverall;

        const taskId = await ctx.db.insert("tasks", {
          briefId,
          title:
            normalizedTeams.length > 1
              ? `${args.title} - Step ${i + 1}`
              : args.title,
          description: args.description,
          assigneeId: t.assigneeId,
          assignedBy: userId,
          status: "pending",
          sortOrder: 1000 + i,
          ...(taskDeadline !== undefined ? { deadline: taskDeadline } : {}),
          ...(args.clientFacing ? { clientFacing: true } : {}),
          ...(nextTeamId ? { handoffTargetTeamId: nextTeamId } : {}),
          assignedAt: now,
        });

        await tagForOversight(ctx, {
          taskId,
          briefId,
          assigneeId: t.assigneeId,
          assignedBy: userId,
          source: "individual_task",
        });

        if (t.assigneeId !== userId) {
          await ctx.db.insert("notifications", {
            recipientId: t.assigneeId,
            type: "task_assigned",
            title: "Task assigned",
            message: `You were assigned "${args.title}"`,
            briefId,
            taskId,
            triggeredBy: userId,
            read: false,
            createdAt: now,
          });
        }
      }

      // Roll the freshly-inserted per-team task deadlines up into the brief's
      // top-level deadline so the "ultimate" deadline reflects the last node.
      await recomputeBriefDeadline(ctx, briefId);

      return briefId;
    }

    // ─── Branch C: Content Calendar entry under brand's CC brief ───
    if (!args.brandId) {
      throw new Error("Brand is required for content calendar entries");
    }
    const brand = await ctx.db.get(args.brandId);
    if (!brand) throw new Error("Brand not found");

    // Find or create the content calendar brief for this brand
    const allBriefs = await ctx.db.query("briefs").collect();
    let ccBrief = allBriefs.find(
      (b) =>
        b.brandId === args.brandId &&
        b.briefType === "content_calendar" &&
        b.status !== "archived"
    );
    let ccBriefId: Id<"briefs">;
    if (ccBrief) {
      ccBriefId = ccBrief._id;
    } else {
      const brandMgrs = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
      const ccManagerId =
        args.assignedManagerId ??
        (brandMgrs.length > 0 ? brandMgrs[0].managerId : undefined);
      const maxPriority =
        allBriefs.length > 0
          ? Math.max(...allBriefs.map((b) => b.globalPriority))
          : 0;
      ccBriefId = await ctx.db.insert("briefs", {
        title: `${brand.name} - Content Calendar`,
        description: `Content calendar for ${brand.name}`,
        status: "active",
        briefType: "content_calendar",
        createdBy: userId,
        ...(ccManagerId ? { assignedManagerId: ccManagerId } : {}),
        globalPriority: maxPriority + 1,
        brandId: args.brandId,
      });
      await ctx.db.insert("activityLog", {
        briefId: ccBriefId,
        userId,
        action: "created_brief",
        details: JSON.stringify({ title: `${brand.name} - Content Calendar`, auto: true }),
        timestamp: now,
      });
    }

    // Ensure sheet for month
    const month = args.contentCalendar?.month;
    if (month) {
      const sheets = await ctx.db
        .query("contentCalendarSheets")
        .withIndex("by_brief", (q) => q.eq("briefId", ccBriefId))
        .collect();
      if (!sheets.some((s) => s.month === month)) {
        const maxSheetOrder = sheets.length
          ? Math.max(...sheets.map((s) => s.sortOrder))
          : 0;
        await ctx.db.insert("contentCalendarSheets", {
          briefId: ccBriefId,
          month,
          sortOrder: maxSheetOrder + 1,
          createdBy: userId,
          createdAt: now,
        });
      }
    }

    const postDate =
      args.contentCalendar?.goLiveDate ??
      (month ? `${month}-01` : undefined);

    // Link all teams to the CC brief (deduped, preserving order)
    const existingBriefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_brief", (q) => q.eq("briefId", ccBriefId))
      .collect();
    const existingTeamIds = new Set(existingBriefTeams.map((bt) => bt.teamId));
    let nextOrder = existingBriefTeams.length
      ? Math.max(...existingBriefTeams.map((bt) => bt.order ?? 0)) + 1
      : 0;
    for (const t of normalizedTeams) {
      if (!existingTeamIds.has(t.teamId)) {
        await ctx.db.insert("briefTeams", {
          briefId: ccBriefId,
          teamId: t.teamId,
          order: nextOrder++,
        });
      }
    }

    // Parent entry task (admin owns it)
    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", ccBriefId))
      .collect();
    const maxTaskOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    // The CC brief is find-or-create, so a double-submit shows up as a
    // duplicate parent entry task rather than a duplicate brief. Replay-guard
    // on the parent task instead.
    const duplicateEntry = existingTasks.find(
      (t) =>
        t.parentTaskId === undefined &&
        t.title === args.title &&
        t.assigneeId === userId &&
        Date.now() - t._creationTime < DUPLICATE_SUBMIT_WINDOW_MS
    );
    if (duplicateEntry) return ccBriefId;

    // Calendar tasks attribute their assignor to the brand manager when
    // possible — every calendar task is "from" the manager. Resolve the
    // manager from the CC brief (created above with ccManagerId set) or
    // the args, and fall back to the calling admin only when no manager
    // can be found.
    const ccBriefRecord = await ctx.db.get(ccBriefId);
    const calendarAssignor =
      ccBriefRecord?.assignedManagerId ?? args.assignedManagerId ?? userId;

    const firstHandoff =
      normalizedTeams.length > 1 ? normalizedTeams[1].teamId : undefined;
    const parentTaskId = await ctx.db.insert("tasks", {
      briefId: ccBriefId,
      title: args.title,
      description: args.description,
      assigneeId: userId,
      assignedBy: calendarAssignor,
      status: "pending",
      sortOrder: maxTaskOrder + 1000,
      duration: "1d",
      durationMinutes: 480,
      platform: "Other",
      contentType: "Post",
      ...(postDate ? { postDate } : {}),
      ...(normalizedOverall !== undefined ? { deadline: normalizedOverall } : {}),
      ...(firstHandoff ? { handoffTargetTeamId: firstHandoff } : {}),
      assignedAt: now,
    });

    await tagForOversight(ctx, {
      taskId: parentTaskId,
      briefId: ccBriefId,
      assigneeId: userId,
      assignedBy: calendarAssignor,
      source: "content_calendar",
    });

    // Child tasks per team, chained Copy → Design via handoffTargetTeamId
    for (let i = 0; i < normalizedTeams.length; i++) {
      const t = normalizedTeams[i];
      const nextTeamId =
        i < normalizedTeams.length - 1 ? normalizedTeams[i + 1].teamId : undefined;
      const taskDeadline = t.deadline ?? normalizedOverall;
      const teamRecord = await ctx.db.get(t.teamId);
      const teamLabel = teamRecord?.name ?? `Team ${i + 1}`;

      const childId = await ctx.db.insert("tasks", {
        briefId: ccBriefId,
        title: `[${teamLabel}] ${args.title}`,
        description: args.description,
        assigneeId: t.assigneeId,
        assignedBy: calendarAssignor,
        status: "pending",
        sortOrder: maxTaskOrder + 1001 + i,
        duration: "1d",
        durationMinutes: 480,
        platform: "Other",
        contentType: "Post",
        parentTaskId,
        ...(postDate ? { postDate } : {}),
        ...(taskDeadline !== undefined ? { deadline: taskDeadline } : {}),
        ...(nextTeamId ? { handoffTargetTeamId: nextTeamId } : {}),
        ...(args.clientFacing ? { clientFacing: true } : {}),
        assignedAt: now,
      });

      await tagForOversight(ctx, {
        taskId: childId,
        briefId: ccBriefId,
        assigneeId: t.assigneeId,
        assignedBy: calendarAssignor,
        source: "content_calendar",
      });

      if (t.assigneeId !== userId) {
        await ctx.db.insert("notifications", {
          recipientId: t.assigneeId,
          type: "task_assigned",
          title: "Content calendar task assigned",
          message: `You were assigned "${args.title}"`,
          briefId: ccBriefId,
          taskId: childId,
          triggeredBy: userId,
          read: false,
          createdAt: now,
        });
      }
    }

    await ctx.db.insert("activityLog", {
      briefId: ccBriefId,
      taskId: parentTaskId,
      userId,
      action: "created_task",
      details: JSON.stringify({ title: args.title, linkedCalendar: true }),
      timestamp: now,
    });

    return ccBriefId;
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
    // Content calendar briefs never carry a top-level deadline. If the
    // caller is changing briefType to content_calendar, also clear any
    // previously set deadline. If briefType is already content_calendar,
    // ignore deadline edits silently so old call sites do not error.
    const willBeContentCalendar =
      fields.briefType === "content_calendar" ||
      (fields.briefType === undefined && brief.briefType === "content_calendar");

    if (willBeContentCalendar) {
      if (fields.briefType === "content_calendar" && brief.deadline !== undefined) {
        updates.deadline = undefined;
        updates.deadlineIsManual = undefined;
      }
      // drop any incoming deadline edit for content calendar briefs
    } else if (fields.deadline !== undefined) {
      updates.deadline = normalizeDeadlineToEndOfDay(fields.deadline);
      // A hand-set brief deadline outranks the task rollup from here on.
      // single_task briefs are exempt: their deadline mirrors the lone task
      // both ways, so the rollup must stay live for them.
      if (brief.briefType !== "single_task") {
        updates.deadlineIsManual = true;
      }
    }
    if (fields.briefType !== undefined) updates.briefType = fields.briefType;
    if (fields.creativesRequired !== undefined) {
      const n = fields.creativesRequired;
      updates.creativesRequired =
        n >= 1 ? Math.min(99, Math.floor(n)) : undefined;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(briefId, updates);

      if ("deadline" in updates) {
        const newDeadline = updates.deadline as number | undefined;
        const tasksInBrief = await ctx.db
          .query("tasks")
          .withIndex("by_brief", (q) => q.eq("briefId", briefId))
          .collect();

        if (brief.briefType === "single_task") {
          // Symmetric sync for single_task briefs: mirror the brief's deadline
          // onto the lone task so task-level views (task modal, task cards)
          // don't go stale.
          for (const t of tasksInBrief) {
            if (t.deadline !== newDeadline) {
              await ctx.db.patch(t._id, { deadline: newDeadline });
            }
          }
        } else if (newDeadline !== undefined) {
          // Multi-task briefs: the brief deadline is a ceiling. Nothing inside
          // may land after the brief itself, so pull late tasks back to it.
          // Tasks due earlier keep their own dates — the internal sequence is
          // the whole point of a multi-task brief.
          for (const t of tasksInBrief) {
            if (t.deadline !== undefined && t.deadline > newDeadline) {
              await ctx.db.patch(t._id, { deadline: newDeadline });
            }
          }
        }
      }

      // Brief manually flipped to "completed": cascade down so every task
      // (and its descendants) lands in "done" too. Without this, the brief
      // shows Completed in the list but Brief Details + employee Dashboard
      // keep rendering tasks as review/in-progress (and worklog hides them
      // because it filters by brief.status), producing the inconsistency
      // reported when a brief is closed out from the dropdown.
      const briefIsBeingCompleted =
        fields.status === "completed" && brief.status !== "completed";
      if (briefIsBeingCompleted) {
        const tasksInBrief = await ctx.db
          .query("tasks")
          .withIndex("by_brief", (q) => q.eq("briefId", briefId))
          .collect();
        const now = Date.now();
        for (const t of tasksInBrief) {
          if (t.status !== "done") {
            await ctx.db.patch(t._id, {
              status: "done",
              completedAt: now,
            });
            if (t.assigneeId !== userId) {
              await ctx.db.insert("notifications", {
                recipientId: t.assigneeId,
                type: "task_status_changed",
                title: "Task auto-completed",
                message: `"${t.title}" was marked done because the brief was marked completed.`,
                briefId: t.briefId,
                taskId: t._id,
                triggeredBy: userId,
                read: false,
                createdAt: now,
              });
            }
            await ctx.db.insert("activityLog", {
              briefId: t.briefId,
              taskId: t._id,
              userId,
              action: "auto_completed_via_brief",
              details: JSON.stringify({ reason: "brief_marked_completed" }),
              timestamp: now,
            });
          }
          await cascadeDoneToChildren(ctx, t._id, userId, "brief_marked_completed");
          if (user?.role === "admin") {
            await autoApproveDeliverablesForTaskTree(ctx, t._id, userId);
          }
        }
      }

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
    sourceHandle: v.optional(v.union(v.literal("bottom"), v.literal("right"))),
  },
  handler: async (ctx, { briefId, sourceTaskId, targetTaskId, sourceHandle }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    if (!user || (user.role !== "admin" && brief.assignedManagerId !== userId)) {
      throw new Error("Not authorized");
    }
    // Prevent self-connections
    if (sourceTaskId === targetTaskId) throw new Error("Cannot connect a task to itself");

    const existing = await ctx.db
      .query("taskConnections")
      .withIndex("by_source", (q) => q.eq("sourceTaskId", sourceTaskId))
      .collect();
    const dup = existing.find((c) => c.targetTaskId === targetTaskId);
    if (dup) {
      if (sourceHandle !== undefined && dup.sourceHandle !== sourceHandle) {
        await ctx.db.patch(dup._id, { sourceHandle });
      }
      await mergeUpstreamResourcesIntoTask(ctx, targetTaskId, sourceTaskId);
      return;
    }

    await ctx.db.insert("taskConnections", {
      briefId,
      sourceTaskId,
      targetTaskId,
      ...(sourceHandle !== undefined ? { sourceHandle } : {}),
      createdBy: userId,
      createdAt: Date.now(),
    });
    await mergeUpstreamResourcesIntoTask(ctx, targetTaskId, sourceTaskId);
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
