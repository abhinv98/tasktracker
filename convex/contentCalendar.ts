import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { cascadeDeleteTask } from "./lib/cascadeDeleteTask";
import { syncBriefStatusFromTasks } from "./lib/syncBriefStatus";

// Calendar entries were authored under two schemes:
//   • Modern: parent task = Copy, `[Copy]` / `[Design]` children, sometimes
//     admin-owned parent + named children.
//   • Legacy: parent = Design assignee, linked child = Copy assignee. The
//     legacy child's title was inconsistent — `[Content Calendar · brand]
//     Copy: title`, `[Content Calendar · brand] copy`, plain `copy`, even
//     typos like `copyy` — so the title alone is not a reliable signal.
// Team membership is the dependable signal: copy people sit on a team
// named like "Copy Team" and designers on "Design Team". `roleByUser` is
// precomputed by the caller (userTeams → team name → role) and consulted
// first; the title-prefix patterns are a fallback when team data is missing.
function roleFromTeamNames(names: ReadonlyArray<string>): "copy" | "design" | null {
  for (const n of names) {
    const low = n.toLowerCase();
    if (low.includes("copy")) return "copy";
    if (low.includes("design")) return "design";
  }
  return null;
}
function classifyCalendarEntry(
  parent: { _id: any; title?: string; assigneeId?: any; assignedBy?: any },
  children: Array<{ _id: any; title?: string; assigneeId?: any }>,
  roleByUser?: Map<any, "copy" | "design" | null>
): {
  schema: "legacy" | "modern";
  copyTaskId: any | null;
  designTaskId: any | null;
} {
  // 1. Team-membership detection (most reliable).
  if (roleByUser) {
    const parentRole = parent.assigneeId
      ? roleByUser.get(parent.assigneeId) ?? null
      : null;
    let copyTaskId: any = parentRole === "copy" ? parent._id : null;
    let designTaskId: any = parentRole === "design" ? parent._id : null;
    for (const c of children) {
      const r = c.assigneeId ? roleByUser.get(c.assigneeId) ?? null : null;
      if (r === "copy" && !copyTaskId) copyTaskId = c._id;
      else if (r === "design" && !designTaskId) designTaskId = c._id;
    }
    if (copyTaskId || designTaskId) {
      return {
        schema: parentRole === "design" ? "legacy" : "modern",
        copyTaskId,
        designTaskId,
      };
    }
  }

  // 2. Title-prefix detection ([Copy] / [Design]).
  const explicitCopy = children.find((c) => /^\s*\[copy\]/i.test(c.title ?? ""));
  const explicitDesign = children.find((c) => /^\s*\[design\]/i.test(c.title ?? ""));
  if (explicitCopy || explicitDesign) {
    const parentIsAdminOwned =
      parent.assigneeId !== undefined && parent.assigneeId === parent.assignedBy;
    return {
      schema: "modern",
      copyTaskId: explicitCopy?._id ?? (parentIsAdminOwned ? null : parent._id),
      designTaskId: explicitDesign?._id ?? null,
    };
  }

  // 3. Legacy `[Content Calendar · …] Copy: …` title pattern.
  const legacyCopy = children.find((c) =>
    /^\s*\[content calendar[^\]]*\]\s+copy:?\s*/i.test(c.title ?? "")
  );
  if (legacyCopy) {
    return {
      schema: "legacy",
      copyTaskId: legacyCopy._id,
      designTaskId: parent._id,
    };
  }

  // 4. Fallback: parent = Copy (if real assignee), first child = Design.
  const parentHasRealAssignee =
    parent.assigneeId !== undefined && parent.assigneeId !== parent.assignedBy;
  return {
    schema: "modern",
    copyTaskId: parentHasRealAssignee ? parent._id : null,
    designTaskId: children[0]?._id ?? null,
  };
}

// Build a userId → role map using each user's userTeams membership. Caches
// nothing — invoked once per query handler.
async function buildRoleByUserMap(ctx: any): Promise<Map<any, "copy" | "design" | null>> {
  const userTeams = await ctx.db.query("userTeams").collect();
  const teams = await ctx.db.query("teams").collect();
  const teamNameById = new Map<any, string>(
    teams.map((t: any) => [t._id, t.name as string])
  );
  const namesByUser = new Map<any, string[]>();
  for (const ut of userTeams) {
    const name = teamNameById.get(ut.teamId);
    if (!name) continue;
    const list = namesByUser.get(ut.userId) ?? [];
    list.push(name);
    namesByUser.set(ut.userId, list);
  }
  const out = new Map<any, "copy" | "design" | null>();
  for (const [uid, names] of namesByUser) out.set(uid, roleFromTeamNames(names));
  return out;
}

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

/** Ensure a month sheet exists for this brief (YYYY-MM). Used by create entry mutations. */
export async function ensureSheetForMonth(
  ctx: any,
  briefId: any,
  month: string,
  userId: string
): Promise<void> {
  const sheets = await ctx.db
    .query("contentCalendarSheets")
    .withIndex("by_brief", (q: any) => q.eq("briefId", briefId))
    .collect();
  if (sheets.some((s: any) => s.month === month)) return;
  const maxOrder = sheets.length
    ? Math.max(...sheets.map((s: any) => s.sortOrder))
    : 0;
  await ctx.db.insert("contentCalendarSheets", {
    briefId,
    month,
    sortOrder: maxOrder + 1,
    createdBy: userId,
    createdAt: Date.now(),
  });
}

/**
 * Returns count of content calendar tasks that are pending (not done/review)
 * for the current month — used for the sidebar notification badge.
 * Scoped per brand manager: only counts tasks from brands they manage.
 * Super admins see counts from all brands.
 */
export const getPendingCalendarTaskCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const user = await ctx.db.get(userId);
    if (!user) return 0;

    const isSuperAdmin = (user as any).isSuperAdmin === true;

    // Get brand IDs this user manages
    let managedBrandIds: Set<string>;
    if (isSuperAdmin) {
      // Super admins see all brands
      managedBrandIds = new Set(
        (await ctx.db.query("brands").collect()).map((b) => b._id)
      );
    } else {
      const bms = await ctx.db
        .query("brandManagers")
        .withIndex("by_manager", (q) => q.eq("managerId", userId))
        .collect();
      managedBrandIds = new Set(bms.map((bm) => bm.brandId));
    }

    if (managedBrandIds.size === 0) return 0;

    const allBriefs = await ctx.db.query("briefs").collect();
    const ccBriefs = allBriefs.filter(
      (b: any) =>
        b.briefType === "content_calendar" &&
        b.status !== "archived" &&
        b.brandId &&
        managedBrandIds.has(b.brandId)
    );
    if (ccBriefs.length === 0) return 0;

    let count = 0;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    for (const brief of ccBriefs) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      count += tasks.filter(
        (t) =>
          t.postDate &&
          t.postDate.startsWith(currentMonth) &&
          t.status === "pending" &&
          !t.parentTaskId
      ).length;
    }

    return count;
  },
});

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
      (t) => t.postDate && t.postDate.startsWith(month) && !t.parentTaskId
    );

    const users = await ctx.db.query("users").collect();
    const roleByUser = await buildRoleByUserMap(ctx);

    // Fetch all child/linked tasks for these entries in one pass
    const allChildTasks = tasks.filter((t) => t.parentTaskId);

    return monthTasks
      .sort((a, b) => {
        if (a.postDate && b.postDate) return a.postDate.localeCompare(b.postDate);
        return a.sortOrder - b.sortOrder;
      })
      .map((task) => {
        const assignee = users.find((u) => u._id === task.assigneeId);
        const assignor = users.find((u) => u._id === task.assignedBy);
        const childTasks = allChildTasks.filter((ct) => ct.parentTaskId === task._id);
        const linkedChild = childTasks.length > 0 ? childTasks[0] : null;
        const linkedAssignee = linkedChild ? users.find((u) => u._id === linkedChild.assigneeId) : null;

        const classification = classifyCalendarEntry(task, childTasks, roleByUser);
        const lookupTask = (tid: any) =>
          tid === task._id ? task : childTasks.find((ct) => ct._id === tid) ?? null;
        const copyTask = classification.copyTaskId ? lookupTask(classification.copyTaskId) : null;
        const designTask = classification.designTaskId ? lookupTask(classification.designTaskId) : null;
        const copyUser = copyTask ? users.find((u) => u._id === copyTask.assigneeId) : null;
        const designUser = designTask ? users.find((u) => u._id === designTask.assigneeId) : null;
        const copyHasRealAssignee =
          !!copyTask && copyTask.assigneeId !== undefined && copyTask.assigneeId !== copyTask.assignedBy;
        const designHasRealAssignee =
          !!designTask && designTask.assigneeId !== undefined && designTask.assigneeId !== designTask.assignedBy;

        return {
          ...task,
          assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
          assigneeDesignation: assignee?.designation ?? "",
          assignorName: assignor?.name ?? assignor?.email ?? "—",
          linkedAssigneeName: linkedAssignee ? (linkedAssignee.name ?? linkedAssignee.email ?? "Unknown") : "",
          linkedAssigneeDesignation: linkedAssignee?.designation ?? "",
          entrySchema: classification.schema,
          copyTaskId: classification.copyTaskId ?? null,
          designTaskId: classification.designTaskId ?? null,
          copyAssigneeName:
            copyHasRealAssignee && copyUser ? (copyUser.name ?? copyUser.email ?? "Unknown") : "",
          copyAssigneeDesignation: copyHasRealAssignee ? (copyUser?.designation ?? "") : "",
          designAssigneeName:
            designHasRealAssignee && designUser ? (designUser.name ?? designUser.email ?? "Unknown") : "",
          designAssigneeDesignation: designHasRealAssignee ? (designUser?.designation ?? "") : "",
          linkedTasks: childTasks.map((ct) => ({
            _id: ct._id,
            status: ct.status,
            deadline: ct.deadline ?? null,
            postDate: ct.postDate ?? null,
          })),
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
    await ensureSheetForMonth(ctx, briefId, month, userId);

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

/**
 * Creates a content calendar entry (design assignee as main owner)
 * plus an optional linked copy task — all in one mutation.
 * Used by the "Single Task → For Calendar" form.
 */
export const createCalendarEntryWithCopyTask = mutation({
  args: {
    brandId: v.id("brands"),
    title: v.string(),
    description: v.optional(v.string()),
    month: v.string(), // "YYYY-MM"
    goLiveDate: v.string(), // "YYYY-MM-DD" – the postDate
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    // Design (main entry assignee)
    designAssigneeId: v.id("users"),
    designDeadline: v.optional(v.number()),
    // Copy (linked task)
    copyAssigneeId: v.optional(v.id("users")),
    copyDeadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can create calendar entries");

    const briefId = await getOrCreateCalendarBrief(ctx, args.brandId, userId);
    await ensureSheetForMonth(ctx, briefId, args.month, userId);

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const platform = args.platform ?? "Other";
    const contentType = args.contentType ?? "Post";

    // 1. Create parent entry (design assignee is the main owner)
    const parentTaskId = await ctx.db.insert("tasks", {
      briefId,
      title: args.title,
      description: args.description,
      assigneeId: args.designAssigneeId,
      assignedBy: userId,
      status: "pending",
      sortOrder: maxOrder + 1000,
      duration: "1d",
      durationMinutes: 480,
      platform,
      contentType,
      postDate: args.goLiveDate,
      assignedAt: Date.now(),
      ...(args.designDeadline ? { deadline: args.designDeadline } : {}),
    });

    if (args.designAssigneeId !== userId) {
      await ctx.db.insert("notifications", {
        recipientId: args.designAssigneeId,
        type: "task_assigned",
        title: "Content calendar task assigned",
        message: `You were assigned: ${args.title}`,
        briefId,
        taskId: parentTaskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    // 2. Create linked copy task if copy assignee is provided
    if (args.copyAssigneeId) {
      let brandName = "Brand";
      const brand = await ctx.db.get(args.brandId);
      if (brand?.name) brandName = brand.name;

      const copyTitle = `[Content Calendar · ${brandName}] Copy: ${args.title}`;
      const copyTaskId = await ctx.db.insert("tasks", {
        briefId,
        title: copyTitle,
        description: `Linked to calendar entry: ${args.title}`,
        assigneeId: args.copyAssigneeId,
        assignedBy: userId,
        status: "pending",
        sortOrder: maxOrder + 1001,
        duration: "1d",
        durationMinutes: 480,
        platform,
        contentType,
        postDate: args.goLiveDate,
        parentTaskId,
        assignedAt: Date.now(),
        ...(args.copyDeadline ? { deadline: args.copyDeadline } : {}),
      });

      await ctx.db.insert("notifications", {
        recipientId: args.copyAssigneeId,
        type: "task_assigned",
        title: "Content calendar task assigned",
        message: `You were assigned copy: ${args.title}`,
        briefId,
        taskId: copyTaskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });

      await ctx.db.insert("activityLog", {
        briefId,
        taskId: copyTaskId,
        userId,
        action: "created_task",
        details: JSON.stringify({
          title: copyTitle,
          parentTaskId,
          linkedCalendar: true,
        }),
        timestamp: Date.now(),
      });
    }

    await ctx.db.insert("activityLog", {
      briefId,
      taskId: parentTaskId,
      userId,
      action: "created_task",
      details: JSON.stringify({
        title: args.title,
        calendarEntryFromSingleTask: true,
      }),
      timestamp: Date.now(),
    });

    return parentTaskId;
  },
});

// ─── BREAK DAYS ─────────────────────────────────

export const listBreakDays = query({
  args: {
    briefId: v.id("briefs"),
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, { briefId, month }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("contentCalendarBreakDays")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    return all
      .filter((bd) => bd.date.startsWith(month))
      .map((bd) => bd.date);
  },
});

export const toggleBreakDay = mutation({
  args: {
    briefId: v.id("briefs"),
    date: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, { briefId, date }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can manage break days");

    const existing = await ctx.db
      .query("contentCalendarBreakDays")
      .withIndex("by_brief_date", (q) =>
        q.eq("briefId", briefId).eq("date", date)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { added: false };
    } else {
      await ctx.db.insert("contentCalendarBreakDays", {
        briefId,
        date,
        createdBy: userId,
        createdAt: Date.now(),
      });
      return { added: true };
    }
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

    // Only delete PARENT calendar entries (no parentTaskId) whose postDate
    // is inside this month. The cascade helper then sweeps every linked
    // child (Copy/Design helpers) regardless of their own postDate, so we
    // never leave orphan rows behind even if a child's postDate was edited
    // to a different month.
    const monthParents = tasks.filter(
      (t) =>
        !t.parentTaskId &&
        t.postDate &&
        t.postDate.startsWith(sheet.month)
    );

    for (const task of monthParents) {
      await cascadeDeleteTask(ctx, task._id);
    }

    await ctx.db.delete(sheetId);

    await syncBriefStatusFromTasks(ctx, sheet.briefId);
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
      (t) => t.postDate && t.postDate.startsWith(month) && !t.parentTaskId
    );

    const users = await ctx.db.query("users").collect();
    const roleByUser = await buildRoleByUserMap(ctx);

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

    // Fetch all child/linked tasks for these entries in one pass
    const allBriefTasks = tasks.filter((t) => t.parentTaskId);

    return monthTasks
      .sort((a, b) => {
        if (a.postDate && b.postDate) return a.postDate.localeCompare(b.postDate);
        return a.sortOrder - b.sortOrder;
      })
      .map((task) => {
        const assignee = users.find((u) => u._id === task.assigneeId);
        const childTasks = allBriefTasks.filter((ct) => ct.parentTaskId === task._id);
        const linkedChild = childTasks.length > 0 ? childTasks[0] : null;
        const linkedAssignee = linkedChild ? users.find((u) => u._id === linkedChild.assigneeId) : null;

        // Resolve who is actually the Copy person vs Design person for this
        // entry. Legacy entries (parent = design, copy child) flip the modern
        // mapping; classifier prefers team membership over title prefixes.
        const classification = classifyCalendarEntry(task, childTasks, roleByUser);
        const lookupTask = (tid: any) =>
          tid === task._id ? task : childTasks.find((ct) => ct._id === tid) ?? null;
        const copyTask = classification.copyTaskId ? lookupTask(classification.copyTaskId) : null;
        const designTask = classification.designTaskId ? lookupTask(classification.designTaskId) : null;
        const copyUser = copyTask ? users.find((u) => u._id === copyTask.assigneeId) : null;
        const designUser = designTask ? users.find((u) => u._id === designTask.assigneeId) : null;
        const copyHasRealAssignee =
          !!copyTask && copyTask.assigneeId !== undefined && copyTask.assigneeId !== copyTask.assignedBy;
        const designHasRealAssignee =
          !!designTask && designTask.assigneeId !== undefined && designTask.assigneeId !== designTask.assignedBy;

        return {
          ...task,
          assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
          assigneeDesignation: assignee?.designation ?? "",
          attachmentCount: attachmentCounts[task._id] ?? 0,
          // Legacy `linkedAssignee*` fields kept for any external consumers.
          linkedAssigneeName: linkedAssignee ? (linkedAssignee.name ?? linkedAssignee.email ?? "Unknown") : "",
          linkedAssigneeDesignation: linkedAssignee?.designation ?? "",
          // Semantic role fields used by the calendar table + sidebar.
          entrySchema: classification.schema,
          copyTaskId: classification.copyTaskId ?? null,
          designTaskId: classification.designTaskId ?? null,
          copyAssigneeName:
            copyHasRealAssignee && copyUser ? (copyUser.name ?? copyUser.email ?? "Unknown") : "",
          copyAssigneeDesignation: copyHasRealAssignee ? (copyUser?.designation ?? "") : "",
          designAssigneeName:
            designHasRealAssignee && designUser ? (designUser.name ?? designUser.email ?? "Unknown") : "",
          designAssigneeDesignation: designHasRealAssignee ? (designUser?.designation ?? "") : "",
          linkedTasks: childTasks.map((ct) => ({
            _id: ct._id,
            status: ct.status,
            deadline: ct.deadline ?? null,
            postDate: ct.postDate ?? null,
          })),
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
    await ensureSheetForMonth(ctx, args.briefId, month, userId);

    // Calendar tasks default their assignor to the brief's brand manager —
    // matches the policy that every calendar task is "from" the manager.
    // Falls back to the caller when the brief has no manager set.
    const assignor = args.assignedBy ?? brief.assignedManagerId ?? userId;
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

/**
 * Create a child task linked to a content calendar entry (e.g. Copy team work).
 * Title is prefixed with Content Calendar + brand tags; inherits post date / platform from parent when omitted.
 */
export const createLinkedCalendarTask = mutation({
  args: {
    briefId: v.id("briefs"),
    parentTaskId: v.id("tasks"),
    assigneeId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.number()),
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    postDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can assign linked calendar tasks");
    }

    const brief = await ctx.db.get(args.briefId);
    if (!brief || brief.briefType !== "content_calendar") {
      throw new Error("Brief is not a content calendar");
    }

    const parent = await ctx.db.get(args.parentTaskId);
    if (!parent || parent.briefId !== args.briefId) {
      throw new Error("Parent entry not found for this brief");
    }

    let brandName = "Brand";
    if (brief.brandId) {
      const brand = await ctx.db.get(brief.brandId);
      if (brand?.name) brandName = brand.name;
    }

    const tagPrefix = `[Content Calendar · ${brandName}]`;
    const fullTitle = args.title.trim().startsWith("[")
      ? args.title.trim()
      : `${tagPrefix} ${args.title.trim()}`;

    const postDate = args.postDate ?? parent.postDate;
    const platform = args.platform ?? parent.platform ?? "Other";
    const contentType = args.contentType ?? parent.contentType ?? "Post";

    if (postDate) {
      const month = postDate.substring(0, 7);
      await ensureSheetForMonth(ctx, args.briefId, month, userId);
    }

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    // Calendar tasks attribute their assignor to the brief's brand manager
    // by default — every calendar task is "from" the manager. Fall back to
    // the caller when the brief has no manager set.
    const assignor = brief.assignedManagerId ?? userId;

    const taskId = await ctx.db.insert("tasks", {
      briefId: args.briefId,
      title: fullTitle,
      description:
        args.description ??
        `Linked to calendar entry: ${parent.title}\n\nTags: Content Calendar, ${brandName}`,
      assigneeId: args.assigneeId,
      assignedBy: assignor,
      status: "pending",
      sortOrder: maxOrder + 1000,
      duration: "1d",
      durationMinutes: 480,
      parentTaskId: args.parentTaskId,
      platform,
      contentType,
      ...(postDate ? { postDate } : {}),
      ...(args.deadline !== undefined ? { deadline: args.deadline } : {}),
      assignedAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      recipientId: args.assigneeId,
      type: "task_assigned",
      title: "Content calendar task assigned",
      message: `You were assigned: ${fullTitle}`,
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
        title: fullTitle,
        parentTaskId: args.parentTaskId,
        linkedCalendar: true,
      }),
      timestamp: Date.now(),
    });

    return taskId;
  },
});

/** Tasks created via Assign Task (linked to a calendar entry). */
export const listLinkedTasksForEntry = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, { parentTaskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const parent = await ctx.db.get(parentTaskId);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", parentTaskId))
      .collect();

    const users = await ctx.db.query("users").collect();
    const teams = await ctx.db.query("teams").collect();
    const roleByUser = await buildRoleByUserMap(ctx);

    // Resolve a team for each child task. Title prefix `[Team Name]` (set by
    // createLinkedCalendarTask / createIndividualTaskBrief) is the cheapest
    // signal; fall back to the assignee's primary userTeams row.
    const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));

    // Classify so legacy entries surface "Copy" / "Design" labels on the
    // right tasks regardless of which side the assignee sits on.
    const classification = parent
      ? classifyCalendarEntry(parent as any, tasks as any, roleByUser)
      : { schema: "modern" as const, copyTaskId: null, designTaskId: null };

    const enriched = await Promise.all(
      tasks.map(async (task) => {
        const assignee = users.find((u) => u._id === task.assigneeId);

        let teamId: typeof teams[number]["_id"] | undefined;
        let teamName: string | undefined;

        const prefixMatch = task.title.match(/^\[([^\]]+)\]/);
        if (prefixMatch) {
          const raw = prefixMatch[1].trim();
          // Discard generic envelope prefixes like "Content Calendar · Brand"
          // so we fall through to the team lookup for legacy linked tasks.
          if (!/content calendar/i.test(raw)) {
            const hit = teamByName.get(raw.toLowerCase());
            if (hit) {
              teamId = hit._id;
              teamName = hit.name;
            }
          }
        }

        if (!teamId && task.assigneeId) {
          const userTeams = await ctx.db
            .query("userTeams")
            .withIndex("by_user", (q) => q.eq("userId", task.assigneeId))
            .collect();
          if (userTeams.length > 0) {
            const t = teams.find((tm) => tm._id === userTeams[0].teamId);
            if (t) {
              teamId = t._id;
              teamName = t.name;
            }
          }
        }

        // Semantic role for this child relative to the entry's scheme. The
        // sidebar role-card builder uses this to label legacy children "Copy"
        // (instead of inheriting the misleading team name) and to flip the
        // parent label to "Design" when the linked child is the Copy task.
        let role: "copy" | "design" | "other" = "other";
        if (classification.copyTaskId === task._id) role = "copy";
        else if (classification.designTaskId === task._id) role = "design";

        return {
          ...task,
          assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
          assigneeDesignation: assignee?.designation ?? "",
          teamId: teamId ?? null,
          teamName: teamName ?? null,
          role,
        };
      })
    );

    return enriched.map((t) => ({
      ...t,
      entrySchema: classification.schema,
      parentRole:
        classification.copyTaskId === parentTaskId
          ? ("copy" as const)
          : classification.designTaskId === parentTaskId
            ? ("design" as const)
            : ("other" as const),
    }));
  },
});
