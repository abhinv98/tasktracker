import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Helpers ─────────────────────────────────
function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function overlaps(
  a: { startTime: number; endTime: number },
  b: { startTime: number; endTime: number }
) {
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

// ─── Queries ─────────────────────────────────

export const getScheduleForDate = query({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return [];
    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();

    // Enrich with brief/task info
    const briefs = await ctx.db.query("briefs").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const briefTeams = await ctx.db.query("briefTeams").collect();
    const teams = await ctx.db.query("teams").collect();

    return blocks
      .sort((a, b) => a.startTime - b.startTime)
      .map((block) => {
        const brief = block.briefId ? briefs.find((b) => b._id === block.briefId) : null;
        const task = block.taskId ? tasks.find((t) => t._id === block.taskId) : null;
        let teamColor: string | null = null;
        if (block.briefId) {
          const bt = briefTeams.find((x) => x.briefId === block.briefId);
          if (bt) {
            const team = teams.find((t) => t._id === bt.teamId);
            teamColor = team?.color ?? null;
          }
        }
        return {
          ...block,
          briefTitle: brief?.title ?? null,
          taskStatus: task?.status ?? null,
          taskSortOrder: task?.sortOrder ?? null,
          teamColor,
        };
      });
  },
});

export const getScheduleForWeek = query({
  args: { userId: v.id("users"), weekStart: v.string() },
  handler: async (ctx, { userId, weekStart }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return {};

    // Generate 7 dates
    const start = new Date(weekStart + "T00:00:00");
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const result: Record<string, Array<{
      _id: string;
      title: string;
      startTime: number;
      endTime: number;
      type: string;
      color?: string;
      completed?: boolean;
    }>> = {};

    for (const date of dates) {
      const blocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
        .collect();
      result[date] = blocks
        .sort((a, b) => a.startTime - b.startTime)
        .map((b) => ({
          _id: b._id,
          title: b.title,
          startTime: b.startTime,
          endTime: b.endTime,
          type: b.type,
          color: b.color,
          completed: b.completed,
        }));
    }
    return result;
  },
});

export const getEmployeesWithSchedule = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return [];
    const user = await ctx.db.get(authId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) return [];

    const employees = await ctx.db.query("users").collect();
    const allBlocks = await ctx.db.query("scheduleBlocks").collect();
    const dayBlocks = allBlocks.filter((b) => b.date === date);

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return employees
      .filter((e) => e.role === "employee" || e.role === "manager")
      .map((emp) => {
        const empBlocks = dayBlocks.filter((b) => b.userId === emp._id);
        const totalMinutes = empBlocks.reduce((s, b) => s + (b.endTime - b.startTime), 0);
        const isBusy = empBlocks.some(
          (b) => b.startTime <= currentMinutes && b.endTime > currentMinutes
        );
        return {
          _id: emp._id,
          name: emp.name ?? emp.email ?? "Unknown",
          role: emp.role ?? "employee",
          blockCount: empBlocks.length,
          totalHours: +(totalMinutes / 60).toFixed(1),
          isBusy,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getUnscheduledTasks = query({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return [];

    // Get user's assigned tasks (non-done, non-archived briefs)
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", userId))
      .collect();
    const briefs = await ctx.db.query("briefs").collect();

    const activeTasks = tasks.filter((t) => {
      if (t.status === "done") return false;
      const brief = briefs.find((b) => b._id === t.briefId);
      return brief && brief.status !== "archived";
    });

    // Get blocks on this date for this user
    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
    const scheduledTaskIds = new Set(blocks.filter((b) => b.taskId).map((b) => b.taskId!));

    return activeTasks
      .filter((t) => !scheduledTaskIds.has(t._id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => {
        const brief = briefs.find((b) => b._id === t.briefId);
        return {
          _id: t._id,
          title: t.title,
          briefId: t.briefId,
          briefName: brief?.title ?? "",
          duration: t.duration,
          durationMinutes: t.durationMinutes,
          status: t.status,
          sortOrder: t.sortOrder,
        };
      });
  },
});

export const getDailySummary = query({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return null;

    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();

    const sorted = blocks.sort((a, b) => a.startTime - b.startTime);
    let briefMinutes = 0;
    let personalMinutes = 0;
    let longestGap = 0;
    let longestStretch = 0;

    for (const b of sorted) {
      const dur = b.endTime - b.startTime;
      if (b.type === "brief_task") briefMinutes += dur;
      else personalMinutes += dur;
    }

    // Compute gaps and stretches
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        const gap = sorted[i].startTime - sorted[i - 1].endTime;
        if (gap > longestGap) longestGap = gap;
      }
      // Stretch: consecutive blocks with no gap
      let stretch = sorted[i].endTime - sorted[i].startTime;
      let j = i + 1;
      while (j < sorted.length && sorted[j].startTime <= sorted[j - 1].endTime) {
        stretch = sorted[j].endTime - sorted[i].startTime;
        j++;
      }
      if (stretch > longestStretch) longestStretch = stretch;
    }

    const totalMinutes = briefMinutes + personalMinutes;
    return {
      totalHours: +(totalMinutes / 60).toFixed(1),
      briefHours: +(briefMinutes / 60).toFixed(1),
      personalHours: +(personalMinutes / 60).toFixed(1),
      blockCount: blocks.length,
      longestGapMinutes: longestGap,
      longestStretchMinutes: longestStretch,
      utilizationPct: Math.round((totalMinutes / 540) * 100), // 9h workday (11 AM - 8 PM) = 540 min
    };
  },
});

export const getDailyNote = query({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return null;
    const notes = await ctx.db
      .query("dailyNotes")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
    return notes[0] ?? null;
  },
});

// ─── Mutations ───────────────────────────────

export const createBlock = mutation({
  args: {
    userId: v.optional(v.id("users")),
    date: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    type: v.union(v.literal("brief_task"), v.literal("personal")),
    taskId: v.optional(v.id("tasks")),
    briefId: v.optional(v.id("briefs")),
    title: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");
    const authUser = await ctx.db.get(authId);

    const targetUserId = args.userId ?? authId;

    // Auth: employee can only create for self
    if (targetUserId !== authId && authUser?.role === "employee") {
      throw new Error("Employees can only create their own schedule blocks");
    }

    // Validation
    if (args.endTime <= args.startTime) throw new Error("End time must be after start time");
    if (args.startTime < 0 || args.endTime > 1440) throw new Error("Time must be between 00:00 and 24:00");

    // Overlap check
    const existing = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_user_date", (q) => q.eq("userId", targetUserId).eq("date", args.date))
      .collect();

    for (const block of existing) {
      if (overlaps({ startTime: args.startTime, endTime: args.endTime }, block)) {
        throw new Error(
          `Conflicts with "${block.title}" (${formatMinutes(block.startTime)} - ${formatMinutes(block.endTime)})`
        );
      }
    }

    return await ctx.db.insert("scheduleBlocks", {
      userId: targetUserId,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      type: args.type,
      taskId: args.taskId,
      briefId: args.briefId,
      title: args.title,
      description: args.description,
      color: args.color,
      createdAt: Date.now(),
    });
  },
});

export const updateBlock = mutation({
  args: {
    blockId: v.id("scheduleBlocks"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, { blockId, ...fields }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");
    const block = await ctx.db.get(blockId);
    if (!block) throw new Error("Block not found");
    const authUser = await ctx.db.get(authId);
    if (block.userId !== authId && authUser?.role === "employee") {
      throw new Error("Not authorized");
    }

    const newStart = fields.startTime ?? block.startTime;
    const newEnd = fields.endTime ?? block.endTime;
    if (newEnd <= newStart) throw new Error("End time must be after start time");

    // Overlap check (exclude self)
    if (fields.startTime !== undefined || fields.endTime !== undefined) {
      const existing = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_user_date", (q) => q.eq("userId", block.userId).eq("date", block.date))
        .collect();
      for (const other of existing) {
        if (other._id === blockId) continue;
        if (overlaps({ startTime: newStart, endTime: newEnd }, other)) {
          throw new Error(
            `Conflicts with "${other.title}" (${formatMinutes(other.startTime)} - ${formatMinutes(other.endTime)})`
          );
        }
      }
    }

    const updates: Record<string, unknown> = {};
    if (fields.startTime !== undefined) updates.startTime = fields.startTime;
    if (fields.endTime !== undefined) updates.endTime = fields.endTime;
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.color !== undefined) updates.color = fields.color;
    if (fields.completed !== undefined) updates.completed = fields.completed;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(blockId, updates);
    }
  },
});

export const deleteBlock = mutation({
  args: { blockId: v.id("scheduleBlocks") },
  handler: async (ctx, { blockId }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");
    const block = await ctx.db.get(blockId);
    if (!block) throw new Error("Block not found");
    const authUser = await ctx.db.get(authId);
    if (block.userId !== authId && authUser?.role !== "admin") {
      throw new Error("Not authorized");
    }
    await ctx.db.delete(blockId);
  },
});

export const copyDay = mutation({
  args: {
    userId: v.id("users"),
    sourceDate: v.string(),
    targetDate: v.string(),
  },
  handler: async (ctx, { userId, sourceDate, targetDate }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");
    const authUser = await ctx.db.get(authId);
    if (userId !== authId && authUser?.role === "employee") {
      throw new Error("Not authorized");
    }

    const sourceBlocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", sourceDate))
      .collect();

    // Check which tasks are done
    let skipped = 0;
    let copied = 0;
    for (const block of sourceBlocks) {
      if (block.taskId) {
        const task = await ctx.db.get(block.taskId);
        if (task?.status === "done") {
          skipped++;
          continue;
        }
      }

      // Check for overlap on target date
      const targetBlocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", targetDate))
        .collect();

      const hasConflict = targetBlocks.some((tb) =>
        overlaps({ startTime: block.startTime, endTime: block.endTime }, tb)
      );
      if (hasConflict) continue;

      await ctx.db.insert("scheduleBlocks", {
        userId,
        date: targetDate,
        startTime: block.startTime,
        endTime: block.endTime,
        type: block.type,
        taskId: block.taskId,
        briefId: block.briefId,
        title: block.title,
        description: block.description,
        color: block.color,
        createdAt: Date.now(),
      });
      copied++;
    }
    return { copied, skipped };
  },
});

export const saveDailyNote = mutation({
  args: { date: v.string(), content: v.string() },
  handler: async (ctx, { date, content }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("dailyNotes")
      .withIndex("by_user_date", (q) => q.eq("userId", authId).eq("date", date))
      .collect();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { content, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("dailyNotes", {
        userId: authId,
        date,
        content,
        updatedAt: Date.now(),
      });
    }
  },
});

export const reorderTaskPriority = mutation({
  args: {
    taskId: v.id("tasks"),
    newSortOrder: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, newSortOrder, reason }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");
    const authUser = await ctx.db.get(authId);
    if (!authUser || (authUser.role !== "admin" && authUser.role !== "manager")) {
      throw new Error("Only admins and managers can adjust priority");
    }

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(taskId, { sortOrder: newSortOrder });

    // Notify the employee
    const managerName = authUser.name ?? authUser.email ?? "A manager";
    const reasonText = reason ? ` — "${reason}"` : "";
    await ctx.db.insert("notifications", {
      recipientId: task.assigneeId,
      type: "priority_changed",
      title: "Task priority adjusted",
      message: `${managerName} adjusted priority on "${task.title}"${reasonText}`,
      briefId: task.briefId,
      taskId,
      triggeredBy: authId,
      read: false,
      createdAt: Date.now(),
    });
  },
});
