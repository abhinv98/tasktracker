import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ─── BRAND-BASED CONTENT CALENDAR ──────────────

async function getOrCreateCalendarBrief(
  ctx: any,
  brandId: any,
  userId: string
) {
  const brand = await ctx.db.get(brandId);
  if (!brand) throw new Error("Brand not found");

  const allBriefs = await ctx.db.query("briefs").collect();
  const existing = allBriefs.find(
    (b: any) =>
      b.brandId === brandId &&
      b.briefType === "content_calendar" &&
      b.status !== "archived"
  );
  if (existing) {
    const brandMgrs = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q: any) => q.eq("brandId", brandId))
      .collect();
    if (brandMgrs.length > 0 && existing.assignedManagerId !== brandMgrs[0].managerId) {
      await ctx.db.patch(existing._id, { assignedManagerId: brandMgrs[0].managerId });
    }
    return existing._id;
  }

  const brandMgrs = await ctx.db
    .query("brandManagers")
    .withIndex("by_brand", (q: any) => q.eq("brandId", brandId))
    .collect();
  const managerId = brandMgrs.length > 0 ? brandMgrs[0].managerId : userId;

  const maxPriority = allBriefs.length > 0
    ? Math.max(...allBriefs.map((b: any) => b.globalPriority))
    : 0;

  return await ctx.db.insert("briefs", {
    title: `${brand.name} — Content Calendar`,
    description: `Content calendar for ${brand.name}`,
    status: "active",
    briefType: "content_calendar",
    createdBy: userId,
    assignedManagerId: managerId,
    globalPriority: maxPriority + 1,
    brandId,
  });
}

export const getCalendarBriefForBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const allBriefs = await ctx.db.query("briefs").collect();
    const existing = allBriefs.find(
      (b: any) =>
        b.brandId === brandId &&
        b.briefType === "content_calendar" &&
        b.status !== "archived"
    );
    return existing?._id ?? null;
  },
});

export const listTasksByBrandMonth = query({
  args: {
    brandId: v.id("brands"),
    month: v.string(),
  },
  handler: async (ctx, { brandId, month }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const allBriefs = await ctx.db.query("briefs").collect();
    const ccBrief = allBriefs.find(
      (b: any) =>
        b.brandId === brandId &&
        b.briefType === "content_calendar" &&
        b.status !== "archived"
    );
    if (!ccBrief) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", ccBrief._id))
      .collect();

    const monthTasks = tasks.filter(
      (t) => t.postDate && t.postDate.startsWith(month)
    );

    const users = await ctx.db.query("users").collect();

    return monthTasks
      .sort((a, b) => {
        if (a.postDate && b.postDate) return a.postDate.localeCompare(b.postDate);
        return a.sortOrder - b.sortOrder;
      })
      .map((task) => {
        const assignee = users.find((u) => u._id === task.assigneeId);
        const assignor = users.find((u) => u._id === task.assignedBy);
        return {
          ...task,
          assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
          assigneeDesignation: assignee?.designation ?? "",
          assignorName: assignor?.name ?? assignor?.email ?? "—",
        };
      });
  },
});

export const createEntryForBrand = mutation({
  args: {
    brandId: v.id("brands"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    assignedBy: v.optional(v.id("users")),
    platform: v.string(),
    contentType: v.string(),
    postDate: v.string(),
    deadline: v.optional(v.number()),
    handoffTargetTeamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can create calendar entries");

    const briefId = await getOrCreateCalendarBrief(ctx, args.brandId, userId);
    const assignor = args.assignedBy ?? userId;
    const assignee = args.assigneeId ?? assignor;

    const month = args.postDate.substring(0, 7);
    const sheets = await ctx.db
      .query("contentCalendarSheets")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const sheetExists = sheets.some((s) => s.month === month);
    if (!sheetExists) {
      const maxOrder = sheets.length
        ? Math.max(...sheets.map((s) => s.sortOrder))
        : 0;
      await ctx.db.insert("contentCalendarSheets", {
        briefId,
        month,
        sortOrder: maxOrder + 1,
        createdBy: userId,
        createdAt: Date.now(),
      });
    }

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const taskId = await ctx.db.insert("tasks", {
      briefId,
      title: args.title,
      description: args.description,
      assigneeId: assignee,
      assignedBy: assignor,
      status: "pending",
      sortOrder: maxOrder + 1000,
      duration: "1d",
      durationMinutes: 480,
      deadline: args.deadline,
      platform: args.platform,
      contentType: args.contentType,
      postDate: args.postDate,
      ...(args.assigneeId ? { assignedAt: Date.now() } : {}),
      ...(args.handoffTargetTeamId ? { handoffTargetTeamId: args.handoffTargetTeamId } : {}),
    });

    if (args.assigneeId) {
      await ctx.db.insert("notifications", {
        recipientId: args.assigneeId,
        type: "task_assigned",
        title: "Content calendar task assigned",
        message: `You were assigned: ${args.title}`,
        briefId,
        taskId,
        triggeredBy: assignor,
        read: false,
        createdAt: Date.now(),
      });
    }

    return taskId;
  },
});

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
    if (!user || user.role !== "admin")
      throw new Error("Only admins can manage sheets");

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
    if (!user || user.role !== "admin")
      throw new Error("Only admins can delete sheets");

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

export const updateReferenceLinks = mutation({
  args: {
    taskId: v.id("tasks"),
    referenceLinks: v.array(v.string()),
  },
  handler: async (ctx, { taskId, referenceLinks }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can manage reference links");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(taskId, { referenceLinks });
  },
});

export const createCalendarEntry = mutation({
  args: {
    briefId: v.id("briefs"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    assignedBy: v.optional(v.id("users")),
    platform: v.string(),
    contentType: v.string(),
    postDate: v.string(),
    deadline: v.optional(v.number()),
    creativeCopy: v.optional(v.string()),
    caption: v.optional(v.string()),
    handoffTargetTeamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can create calendar entries");

    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");

    const month = args.postDate.substring(0, 7);
    const sheets = await ctx.db
      .query("contentCalendarSheets")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    const sheetExists = sheets.some((s) => s.month === month);
    if (!sheetExists) throw new Error(`No sheet for month ${month}. Create a sheet tab first.`);

    const assignor = args.assignedBy ?? userId;
    const assignee = args.assigneeId ?? assignor;

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const taskId = await ctx.db.insert("tasks", {
      briefId: args.briefId,
      title: args.title,
      description: args.description,
      assigneeId: assignee,
      assignedBy: assignor,
      status: "pending",
      sortOrder: maxOrder + 1000,
      duration: "1d",
      durationMinutes: 480,
      deadline: args.deadline,
      platform: args.platform,
      contentType: args.contentType,
      postDate: args.postDate,
      ...(args.creativeCopy ? { creativeCopy: args.creativeCopy } : {}),
      ...(args.caption ? { caption: args.caption } : {}),
      ...(args.assigneeId ? { assignedAt: Date.now() } : {}),
      ...(args.handoffTargetTeamId ? { handoffTargetTeamId: args.handoffTargetTeamId } : {}),
    });

    if (args.assigneeId) {
      await ctx.db.insert("notifications", {
        recipientId: args.assigneeId,
        type: "task_assigned",
        title: "Content calendar task assigned",
        message: `You were assigned: ${args.title}`,
        briefId: args.briefId,
        taskId,
        triggeredBy: assignor,
        read: false,
        createdAt: Date.now(),
      });
    }

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
