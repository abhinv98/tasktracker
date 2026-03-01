import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── SHEET MANAGEMENT ───────────────────────────

export const listSheets = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("contentCalendarSheets")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect()
      .then((sheets) => sheets.sort((a, b) => a.sortOrder - b.sortOrder));
  },
});

export const createSheet = mutation({
  args: {
    briefId: v.id("briefs"),
    month: v.string(),
  },
  handler: async (ctx, { briefId, month }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can manage sheets");

    const existing = await ctx.db
      .query("contentCalendarSheets")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();

    const duplicate = existing.find((s) => s.month === month);
    if (duplicate) throw new Error(`Sheet for ${month} already exists`);

    const maxOrder = existing.length
      ? Math.max(...existing.map((s) => s.sortOrder))
      : 0;

    return await ctx.db.insert("contentCalendarSheets", {
      briefId,
      month,
      sortOrder: maxOrder + 1,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteSheet = mutation({
  args: { sheetId: v.id("contentCalendarSheets") },
  handler: async (ctx, { sheetId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can delete sheets");

    const sheet = await ctx.db.get(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", sheet.briefId))
      .collect();

    const monthTasks = tasks.filter(
      (t) => t.postDate && t.postDate.startsWith(sheet.month)
    );
    for (const task of monthTasks) {
      await ctx.db.delete(task._id);
    }

    await ctx.db.delete(sheetId);
  },
});

// ─── CONTENT CALENDAR TASK QUERIES ──────────────

export const listTasksForSheet = query({
  args: {
    briefId: v.id("briefs"),
    month: v.string(),
  },
  handler: async (ctx, { briefId, month }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();

    const monthTasks = tasks.filter(
      (t) => t.postDate && t.postDate.startsWith(month)
    );

    const users = await ctx.db.query("users").collect();

    const attachmentCounts: Record<string, number> = {};
    for (const task of monthTasks) {
      const atts = await ctx.db
        .query("attachments")
        .withIndex("by_parent", (q) =>
          q.eq("parentType", "task").eq("parentId", task._id)
        )
        .collect();
      attachmentCounts[task._id] = atts.length;
    }

    return monthTasks
      .sort((a, b) => {
        if (a.postDate && b.postDate) return a.postDate.localeCompare(b.postDate);
        return a.sortOrder - b.sortOrder;
      })
      .map((task) => {
        const assignee = users.find((u) => u._id === task.assigneeId);
        return {
          ...task,
          assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
          assigneeDesignation: assignee?.designation ?? "",
          attachmentCount: attachmentCounts[task._id] ?? 0,
        };
      });
  },
});

export const createCalendarEntry = mutation({
  args: {
    briefId: v.id("briefs"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.id("users"),
    platform: v.string(),
    contentType: v.string(),
    postDate: v.string(),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can create calendar entries");

    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");

    const month = args.postDate.substring(0, 7);
    const sheets = await ctx.db
      .query("contentCalendarSheets")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    const sheetExists = sheets.some((s) => s.month === month);
    if (!sheetExists) throw new Error(`No sheet for month ${month}. Create a sheet tab first.`);

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", args.assigneeId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const taskId = await ctx.db.insert("tasks", {
      briefId: args.briefId,
      title: args.title,
      description: args.description,
      assigneeId: args.assigneeId,
      assignedBy: userId,
      status: "pending",
      sortOrder: maxOrder + 1000,
      duration: "1d",
      durationMinutes: 480,
      deadline: args.deadline,
      platform: args.platform,
      contentType: args.contentType,
      postDate: args.postDate,
    });

    await ctx.db.insert("notifications", {
      recipientId: args.assigneeId,
      type: "task_assigned",
      title: "Content calendar task assigned",
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
      details: JSON.stringify({
        title: args.title,
        platform: args.platform,
        postDate: args.postDate,
      }),
      timestamp: Date.now(),
    });

    return taskId;
  },
});
