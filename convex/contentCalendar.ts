import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { cascadeDeleteTask } from "./lib/cascadeDeleteTask";
import { syncBriefStatusFromTasks } from "./lib/syncBriefStatus";
import { tagForOversight } from "./lib/tagForOversight";

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
/** A brand's live content-calendar brief, through the briefType+brand index
 *  (these lookups used to scan the whole briefs table on every calendar view). */
export async function findCalendarBrief(ctx: any, brandId: any) {
  const rows = await ctx.db
    .query("briefs")
    .withIndex("by_type_brand", (q: any) =>
      q.eq("briefType", "content_calendar").eq("brandId", brandId)
    )
    .collect();
  return rows.find((b: any) => b.status !== "archived") ?? null;
}

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

export async function getOrCreateCalendarBrief(
  ctx: any,
  brandId: any,
  userId: string
) {
  const brand = await ctx.db.get(brandId);
  if (!brand) throw new Error("Brand not found");
  // On hold, the brand's calendar brief is archived; creating a fresh one
  // would leave two calendars once the brand is resumed.
  if (brand.onHold) {
    throw new Error("This brand is on hold. Resume it from the brand page first.");
  }

  const existing = await findCalendarBrief(ctx, brandId);
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

  const top = await ctx.db.query("briefs").withIndex("by_priority").order("desc").first();
  const maxPriority = top?.globalPriority ?? 0;

  return await ctx.db.insert("briefs", {
    title: `${brand.name} - Content Calendar`,
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
/** Linked team tasks carry their entry's postDate (for "open in calendar"
 *  and month filters). Move the ones still on the entry's old date with it. */
export async function moveEntryChildrenPostDate(
  ctx: any,
  entry: { _id: any; postDate?: string },
  newPostDate: string
) {
  if (!entry.postDate || entry.postDate === newPostDate) return;
  const children = await ctx.db
    .query("tasks")
    .withIndex("by_parent", (q: any) => q.eq("parentTaskId", entry._id))
    .collect();
  for (const c of children) {
    if (c.postDate === entry.postDate) await ctx.db.patch(c._id, { postDate: newPostDate });
  }
}

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

export const getCalendarBriefForBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (!(await canViewBrandCalendar(ctx, userId, brandId))) return null;

    const existing = await findCalendarBrief(ctx, brandId);
    return existing?._id ?? null;
  },
});

/**
 * Read-side gate used by every calendar query. Admins see all calendars;
 * employees only see brands where they have ever been assigned a task in
 * that brand's content-calendar brief. Returns true to allow.
 */
async function canViewBrandCalendar(
  ctx: any,
  userId: any,
  brandId: any
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;
  if (user.role === "admin") return true;

  // Find the brand's CC brief (if any) and check the employee has at least
  // one task on it.
  const ccBrief = await findCalendarBrief(ctx, brandId);
  if (!ccBrief) return false;

  const myTask = await ctx.db
    .query("tasks")
    .withIndex("by_assignee", (q: any) => q.eq("assigneeId", userId))
    .filter((q: any) => q.eq(q.field("briefId"), ccBrief._id))
    .first();
  return myTask != null;
}

/** `canViewBrandCalendar` for queries keyed by a calendar brief id. */
async function canViewCalendarBrief(ctx: any, userId: any, briefId: any) {
  const brief = await ctx.db.get(briefId);
  return !!brief?.brandId && (await canViewBrandCalendar(ctx, userId, brief.brandId));
}

/**
 * Brand IDs whose content calendar the current user is allowed to view.
 *
 * - Admins (incl. super-admins): every brand that has a non-archived
 *   content-calendar brief.
 * - Employees: every such brand where they have ever been assigned a task
 *   inside that brand's content-calendar brief. Access is sticky — once an
 *   employee has been assigned a calendar task on a brand, they keep
 *   read-only access to that brand's calendar indefinitely, including
 *   months where they have no assignment and tasks that are now done.
 */
export const getMyAccessibleCalendarBrandIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const ccBriefs = (
      await ctx.db
        .query("briefs")
        .withIndex("by_type_brand", (q) => q.eq("briefType", "content_calendar"))
        .collect()
    ).filter((b) => b.status !== "archived");
    if (ccBriefs.length === 0) return [];

    if (user.role === "admin") {
      const ids = new Set<string>();
      for (const b of ccBriefs) {
        if (b.brandId) ids.add(b.brandId as unknown as string);
      }
      return [...ids];
    }

    const ccBriefIds = new Set(
      ccBriefs.map((b) => b._id as unknown as string)
    );
    const brandByBrief = new Map<string, string>();
    for (const b of ccBriefs) {
      if (b.brandId) {
        brandByBrief.set(
          b._id as unknown as string,
          b.brandId as unknown as string
        );
      }
    }

    // Tasks the employee has been (or is) assigned to. Status doesn't
    // matter — "involved once → keeps access".
    const myTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();

    const brandIds = new Set<string>();
    for (const t of myTasks) {
      const briefIdStr = t.briefId as unknown as string;
      if (!ccBriefIds.has(briefIdStr)) continue;
      const brandId = brandByBrief.get(briefIdStr);
      if (brandId) brandIds.add(brandId);
    }
    return [...brandIds];
  },
});

/** Display info for the brands above. `brands.listBrands` returns nothing to
 *  employees, so the calendar's brand picker needs its own scoped list. */
export const listMyCalendarBrands = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const ccBriefs = (
      await ctx.db
        .query("briefs")
        .withIndex("by_type_brand", (q) => q.eq("briefType", "content_calendar"))
        .collect()
    ).filter((b) => b.status !== "archived");
    if (ccBriefs.length === 0) return [];

    const brandIds = new Set<string>();
    if (user.role === "admin") {
      for (const b of ccBriefs) {
        if (b.brandId) brandIds.add(b.brandId as unknown as string);
      }
    } else {
      const brandByBrief = new Map<string, string>();
      for (const b of ccBriefs) {
        if (b.brandId) {
          brandByBrief.set(
            b._id as unknown as string,
            b.brandId as unknown as string
          );
        }
      }
      const myTasks = await ctx.db
        .query("tasks")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
        .collect();
      for (const t of myTasks) {
        const brandId = brandByBrief.get(t.briefId as unknown as string);
        if (brandId) brandIds.add(brandId);
      }
    }
    if (brandIds.size === 0) return [];

    const brands = await ctx.db.query("brands").collect();
    const mine = brands
      .filter((b) => brandIds.has(b._id as unknown as string))
      .sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(
      mine.map(async (b) => ({
        _id: b._id,
        name: b.name,
        color: b.color,
        logoUrl: b.logoId ? await ctx.storage.getUrl(b.logoId) : null,
      }))
    );
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
    if (!(await canViewBrandCalendar(ctx, userId, brandId))) return [];

    const ccBrief = await findCalendarBrief(ctx, brandId);
    if (!ccBrief) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", ccBrief._id))
      .collect();

    // Staged entries live on the staging shelf, not the grid.
    const monthTasks = tasks.filter(
      (t) =>
        t.postDate && t.postDate.startsWith(month) && !t.parentTaskId && !t.stagedAt
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
          assignorName: assignor?.name ?? assignor?.email ?? "-",
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
          designCreativesRequired:
            designTask?.creativesRequired ?? null,
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

/** Fetch a list of calendar entry tasks by id, regardless of which month
 *  they fall under. Powers the Holding Tray so tasks parked while viewing
 *  one month still resolve and render after navigating to another month. */
export const listEntriesByIds = query({
  args: { ids: v.array(v.id("tasks")) },
  handler: async (ctx, { ids }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];
    if (ids.length === 0) return [];

    const fetched = await Promise.all(ids.map((id) => ctx.db.get(id)));
    const present = fetched.filter(
      (t): t is NonNullable<typeof t> => !!t
    );
    if (present.length === 0) return [];

    // Only these entries' briefs, not the whole table.
    const briefs = await Promise.all(
      [...new Set(present.map((t) => t.briefId))].map((id) => ctx.db.get(id))
    );
    const briefMap = new Map(briefs.filter((b) => b !== null).map((b) => [b!._id, b!]));
    const brands = await ctx.db.query("brands").collect();
    const brandMap = new Map(brands.map((b) => [b._id, b]));
    const users = await ctx.db.query("users").collect();

    return present
      .filter((t) => {
        const b = briefMap.get(t.briefId);
        return b && b.briefType === "content_calendar";
      })
      .map((t) => {
        const brief = briefMap.get(t.briefId);
        const brand = brief?.brandId ? brandMap.get(brief.brandId) : null;
        const assignee = users.find((u) => u._id === t.assigneeId);
        return {
          ...t,
          briefId: t.briefId,
          brandId: brief?.brandId ?? null,
          brandName: brand?.name ?? "No Brand",
          brandColor: brand?.color ?? "#6b7280",
          assigneeName:
            assignee?.name ?? assignee?.email ?? "Unknown",
        };
      });
  },
});

// ─── STAGING SHELF ─────────────────────────────
// Server-backed replacement for the old localStorage holding tray. Staged
// entries keep their postDate (so un-staging restores the original day) and
// are simply excluded from the month grid while stagedAt is set.

/** Shift a "YYYY-MM-DD" string by N days. UTC-noon anchor avoids TZ drift. */
function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** Days in a "YYYY-MM" month. */
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

async function requireCalendarAdmin(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin")
    throw new Error("Only admins can modify the calendar");
  return userId;
}

/**
 * Write-side gate. Mirrors `canViewBrandCalendar`: admins everywhere, and
 * employees on any content-calendar brief they have ever been assigned a
 * task in. Involvement grants edit, not just read — deletion stays
 * admin-only (see `requireCalendarAdmin` call sites).
 */
export async function canEditCalendarBrief(
  ctx: any,
  userId: any,
  briefId: any
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;
  if (user.role === "admin") return true;
  const brief = await ctx.db.get(briefId);
  if (!brief || brief.briefType !== "content_calendar") return false;
  if (brief.status === "archived") return false;
  const mine = await ctx.db
    .query("tasks")
    .withIndex("by_brief_assignee", (q: any) =>
      q.eq("briefId", briefId).eq("assigneeId", userId)
    )
    .first();
  return mine != null;
}

async function requireCalendarEditor(ctx: any, briefId: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  if (!(await canEditCalendarBrief(ctx, userId, briefId)))
    throw new Error("You don't have access to this content calendar");
  return userId;
}

/** Brand-level variant: resolves the brand's calendar brief first. */
async function requireCalendarEditorForBrand(ctx: any, brandId: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (user?.role === "admin") return userId;
  if (!(await canViewBrandCalendar(ctx, userId, brandId)))
    throw new Error("You don't have access to this content calendar");
  return userId;
}

/** All staged entries of a brand's content calendar, newest-staged first. */
export const listStagedEntries = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (!(await canViewBrandCalendar(ctx, userId, brandId))) return [];

    const ccBrief = await findCalendarBrief(ctx, brandId);
    if (!ccBrief) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", ccBrief._id))
      .collect();
    const staged = tasks.filter((t) => t.stagedAt && !t.parentTaskId);
    if (staged.length === 0) return [];

    const users = await ctx.db.query("users").collect();
    return staged
      .sort((a, b) => (b.stagedAt ?? 0) - (a.stagedAt ?? 0))
      .map((t) => {
        const assignee = users.find((u) => u._id === t.assigneeId);
        return {
          ...t,
          assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
        };
      });
  },
});

/** Park one or more grid entries on the staging shelf. */
export const stageEntries = mutation({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, { taskIds }) => {
    if (taskIds.length === 0) return;
    const first = await ctx.db.get(taskIds[0]);
    if (!first) throw new Error("Entry not found");
    const userId = await requireCalendarEditor(ctx, first.briefId);
    const now = Date.now();
    for (const taskId of taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task || task.stagedAt) continue;
      if (task.briefId !== first.briefId) throw new Error("All entries must belong to the same calendar");
      await ctx.db.patch(taskId, { stagedAt: now, stagedBy: userId });
    }
  },
});

/** Take an entry off the shelf. With postDate: place it on that day; without:
 *  restore it to its original day (postDate was never cleared). */
export const unstageEntry = mutation({
  args: { taskId: v.id("tasks"), postDate: v.optional(v.string()) },
  handler: async (ctx, { taskId, postDate }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Entry not found");
    const userId = await requireCalendarEditor(ctx, task.briefId);
    if (postDate) {
      await ensureSheetForMonth(ctx, task.briefId, postDate.substring(0, 7), userId);
      await moveEntryChildrenPostDate(ctx, task, postDate);
    }
    await ctx.db.patch(taskId, {
      stagedAt: undefined,
      stagedBy: undefined,
      ...(postDate ? { postDate } : {}),
    });
  },
});

/** Bulk reschedule: shift by ±N days, or anchor the earliest entry on
 *  newStartDate and preserve the gaps between entries. */
export const bulkShiftDates = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    deltaDays: v.optional(v.number()),
    newStartDate: v.optional(v.string()),
  },
  handler: async (ctx, { taskIds, deltaDays, newStartDate }) => {
    const tasks = (
      await Promise.all(taskIds.map((id) => ctx.db.get(id)))
    ).filter((t): t is NonNullable<typeof t> => !!t && !!t.postDate);
    if (tasks.length === 0) return;
    const userId = await requireCalendarEditor(ctx, tasks[0].briefId);
    for (const task of tasks) {
      if (task.briefId !== tasks[0].briefId) throw new Error("All entries must belong to the same calendar");
    }

    let delta: number;
    if (deltaDays !== undefined) {
      delta = Math.trunc(deltaDays);
    } else if (newStartDate) {
      const earliest = tasks
        .map((t) => t.postDate!)
        .sort((a, b) => a.localeCompare(b))[0];
      const [y1, m1, d1] = earliest.split("-").map(Number);
      const [y2, m2, d2] = newStartDate.split("-").map(Number);
      delta = Math.round(
        (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000
      );
    } else {
      throw new Error("Provide deltaDays or newStartDate");
    }
    if (delta === 0) return;

    const monthsTouched = new Set<string>();
    for (const task of tasks) {
      const next = shiftDateString(task.postDate!, delta);
      await moveEntryChildrenPostDate(ctx, task, next);
      await ctx.db.patch(task._id, { postDate: next });
      monthsTouched.add(next.substring(0, 7));
    }
    for (const month of monthsTouched) {
      await ensureSheetForMonth(ctx, tasks[0].briefId, month, userId);
    }
  },
});

/** Move entries to another month, keeping day-of-month (clamped to its end). */
export const bulkMoveToMonth = mutation({
  args: { taskIds: v.array(v.id("tasks")), month: v.string() },
  handler: async (ctx, { taskIds, month }) => {
    if (taskIds.length === 0) return;
    const first = await ctx.db.get(taskIds[0]);
    if (!first) throw new Error("Entry not found");
    const userId = await requireCalendarEditor(ctx, first.briefId);
    const maxDay = daysInMonth(month);
    let briefId: any = null;
    for (const taskId of taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task || !task.postDate) continue;
      if (task.briefId !== first.briefId) throw new Error("All entries must belong to the same calendar");
      const day = Math.min(Number(task.postDate.slice(8, 10)), maxDay);
      const next = `${month}-${String(day).padStart(2, "0")}`;
      await moveEntryChildrenPostDate(ctx, task, next);
      await ctx.db.patch(taskId, { postDate: next });
      briefId = task.briefId;
    }
    if (briefId) await ensureSheetForMonth(ctx, briefId, month, userId);
  },
});

/** Copy a calendar entry to another date (sheets-style copy-paste). Children
 *  and deliverable/progress state are intentionally not copied. */
export const duplicateEntry = mutation({
  args: { taskId: v.id("tasks"), postDate: v.string() },
  handler: async (ctx, { taskId, postDate }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Entry not found");
    const userId = await requireCalendarEditor(ctx, task.briefId);

    await ensureSheetForMonth(ctx, task.briefId, postDate.substring(0, 7), userId);

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", task.briefId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;

    const replay = existingTasks.find(
      (t) =>
        !t.parentTaskId &&
        t.title === task.title &&
        t.postDate === postDate &&
        Date.now() - t._creationTime < 10_000
    );
    if (replay) return replay._id;

    // Keep an unassigned placeholder (assignee === assignedBy) unassigned.
    const isPlaceholder = task.assigneeId === task.assignedBy;
    const assignedBy = isPlaceholder ? task.assignedBy : userId;
    const newId = await ctx.db.insert("tasks", {
      briefId: task.briefId,
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeId,
      assignedBy,
      ...(isPlaceholder ? {} : { assignedAt: Date.now() }),
      status: "pending",
      sortOrder: maxOrder + 1000,
      duration: task.duration,
      durationMinutes: task.durationMinutes,
      platform: task.platform,
      contentType: task.contentType,
      postDate,
      ...(task.tag ? { tag: task.tag } : {}),
      ...(task.creativesRequired !== undefined
        ? { creativesRequired: task.creativesRequired }
        : {}),
      ...(task.handoffTargetTeamId
        ? { handoffTargetTeamId: task.handoffTargetTeamId }
        : {}),
    });

    await tagForOversight(ctx, {
      taskId: newId,
      briefId: task.briefId,
      assigneeId: task.assigneeId,
      assignedBy,
      source: "content_calendar",
    });

    if (!isPlaceholder) {
      await ctx.db.insert("notifications", {
        recipientId: task.assigneeId,
        type: "task_assigned",
        title: "Content calendar task assigned",
        message: `You were assigned: ${task.title}`,
        briefId: task.briefId,
        taskId: newId,
        triggeredBy: assignedBy,
        read: false,
        createdAt: Date.now(),
      });
    }

    return newId;
  },
});

/** A slow save tempts a second click on "Add Entry"; the second request
 *  must not become a second entry. Same calendar + title + go-live date
 *  within 30s is treated as the same submission. */
const ENTRY_REPLAY_WINDOW_MS = 30_000;
function findReplayedEntry(
  existingTasks: Array<{ _id: any; parentTaskId?: any; title: string; postDate?: string; _creationTime: number }>,
  title: string,
  postDate: string
) {
  const now = Date.now();
  return existingTasks.find(
    (t) =>
      !t.parentTaskId &&
      t.title.trim() === title.trim() &&
      t.postDate === postDate &&
      now - t._creationTime < ENTRY_REPLAY_WINDOW_MS
  );
}

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
    const userId = await requireCalendarEditorForBrand(ctx, args.brandId);

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
    const replay = findReplayedEntry(existingTasks, args.title, args.postDate);
    if (replay) return replay._id;

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

    await tagForOversight(ctx, {
      taskId,
      briefId,
      assigneeId: assignee,
      assignedBy: assignor,
      source: "content_calendar",
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
    const userId = await requireCalendarEditorForBrand(ctx, args.brandId);

    const briefId = await getOrCreateCalendarBrief(ctx, args.brandId, userId);
    await ensureSheetForMonth(ctx, briefId, args.month, userId);

    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();
    const maxOrder = existingTasks.length
      ? Math.max(...existingTasks.map((t) => t.sortOrder))
      : 0;
    const replay = findReplayedEntry(existingTasks, args.title, args.goLiveDate);
    if (replay) return replay._id;

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

    await tagForOversight(ctx, {
      taskId: parentTaskId,
      briefId,
      assigneeId: args.designAssigneeId,
      assignedBy: userId,
      source: "content_calendar",
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
        description: args.description ?? `Linked to calendar entry: ${args.title}`,
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

      await tagForOversight(ctx, {
        taskId: copyTaskId,
        briefId,
        assigneeId: args.copyAssigneeId,
        assignedBy: userId,
        source: "content_calendar",
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
    const brief = await ctx.db.get(briefId);
    if (!brief?.brandId) return [];
    if (!(await canViewBrandCalendar(ctx, userId, brief.brandId))) return [];

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
    const userId = await requireCalendarEditor(ctx, briefId);

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
    if (!(await canViewCalendarBrief(ctx, userId, briefId))) return [];
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
    const userId = await requireCalendarEditor(ctx, briefId);

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
        !t.stagedAt &&
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
    if (!(await canViewCalendarBrief(ctx, userId, briefId))) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();

    // Staged (shelved) entries live in the staging tray, not the grid.
    const monthTasks = tasks.filter(
      (t) => t.postDate && t.postDate.startsWith(month) && !t.parentTaskId && !t.stagedAt
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
          designCreativesRequired:
            designTask?.creativesRequired ?? null,
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
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    await requireCalendarEditor(ctx, task.briefId);

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
    const userId = await requireCalendarEditor(ctx, args.briefId);

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
    const replay = findReplayedEntry(existingTasks, args.title, args.postDate);
    if (replay) return replay._id;

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

    await tagForOversight(ctx, {
      taskId,
      briefId: args.briefId,
      assigneeId: assignee,
      assignedBy: assignor,
      source: "content_calendar",
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
/** Resolve which team a calendar task belongs to: the `[Team Name]` title
 *  prefix (set on creation) wins; fall back to the assignee's first
 *  userTeams membership. Mirrors the logic in listLinkedTasksForEntry. */
export async function resolveCalendarTaskTeam(
  ctx: any,
  task: { title: string; assigneeId?: any },
  teams: Array<{ _id: any; name: string }>
): Promise<any | null> {
  const prefixMatch = task.title.match(/^\[([^\]]+)\]/);
  if (prefixMatch) {
    const raw = prefixMatch[1].trim();
    if (!/content calendar/i.test(raw)) {
      // `[Design]` / `[Copy]` prefixes name "Design Team" / "Copy Team".
      const key = raw.toLowerCase();
      const hit =
        teams.find((t) => t.name.toLowerCase() === key) ??
        teams.find((t) => t.name.toLowerCase() === `${key} team`);
      if (hit) return hit._id;
    }
  }
  if (task.assigneeId) {
    const userTeams = await ctx.db
      .query("userTeams")
      .withIndex("by_user", (q: any) => q.eq("userId", task.assigneeId))
      .collect();
    if (userTeams.length > 0) return userTeams[0].teamId;
  }
  return null;
}

/** The sequential chain of work on a calendar entry, in creation order:
 *  the parent entry first (when it carries a real assignee), then every
 *  linked child. Task N hands off to task N+1's team on approval. */
async function calendarEntryChain(ctx: any, entryTaskId: any) {
  const parent = await ctx.db.get(entryTaskId);
  if (!parent) return [];
  const children = await ctx.db
    .query("tasks")
    .withIndex("by_parent", (q: any) => q.eq("parentTaskId", entryTaskId))
    .collect();
  children.sort((a: any, b: any) => a._creationTime - b._creationTime);
  const parentHasRealAssignee =
    !!parent.assigneeId && parent.assigneeId !== parent.assignedBy;
  if (parentHasRealAssignee) return [parent, ...children];
  return children.length > 0 ? children : [parent];
}

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
    /** Team this task belongs to — wires it into the entry's sequential
     *  handoff chain (previous task hands off to this team on approval). */
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const userId = await requireCalendarEditor(ctx, args.briefId);

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

    // Sequential chain: whoever is currently last in line hands off to the
    // new task's team once their deliverable is approved.
    const chainBefore = await calendarEntryChain(ctx, args.parentTaskId);

    // One task per team (or person) per entry: a second one duplicates the
    // assignee's work and turns the handoff chain into a loop.
    // (The chain already leaves out an admin-owned placeholder parent, except
    // when it is the only member.)
    const linked = chainBefore.filter(
      (t: any) => t._id !== args.parentTaskId || parent.assigneeId !== parent.assignedBy
    );
    if (linked.some((t: any) => t.assigneeId === args.assigneeId)) {
      throw new Error("This person already has a task on this entry");
    }
    if (args.teamId) {
      const teams = await ctx.db.query("teams").collect();
      for (const t of linked) {
        if ((await resolveCalendarTaskTeam(ctx, t, teams)) === args.teamId) {
          throw new Error("This team already has a task on this entry");
        }
      }
    }

    const taskId = await ctx.db.insert("tasks", {
      briefId: args.briefId,
      title: fullTitle,
      // Team tasks carry the entry's brief so assignees see it on their
      // dashboard; updateTask keeps them in sync when the entry is edited.
      description:
        args.description ??
        parent.description ??
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

    if (args.teamId) {
      const prev = chainBefore[chainBefore.length - 1];
      if (prev && prev._id !== taskId && prev.handoffTargetTeamId !== args.teamId) {
        await ctx.db.patch(prev._id, { handoffTargetTeamId: args.teamId });
      }
    }

    await tagForOversight(ctx, {
      taskId,
      briefId: args.briefId,
      assigneeId: args.assigneeId,
      assignedBy: assignor,
      source: "content_calendar",
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

/** Delete a linked team task and re-link the sequential chain around it:
 *  the task that handed off to the deleted task's team now hands off to
 *  whatever the deleted task pointed at. */
export const removeLinkedCalendarTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await requireCalendarAdmin(ctx);
    void userId;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    if (!task.parentTaskId) throw new Error("Not a linked calendar task");

    const teams = await ctx.db.query("teams").collect();
    const myTeam = await resolveCalendarTaskTeam(ctx, task, teams);

    if (myTeam) {
      // Whoever pointed at my team should now point past me.
      const chain = await calendarEntryChain(ctx, task.parentTaskId);
      for (const member of chain) {
        if (member._id === taskId) continue;
        if (member.handoffTargetTeamId === myTeam) {
          await ctx.db.patch(member._id, {
            handoffTargetTeamId: task.handoffTargetTeamId ?? undefined,
          });
        }
      }
    }

    await cascadeDeleteTask(ctx, taskId);
  },
});

/** Tasks created via Assign Task (linked to a calendar entry). */
export const listLinkedTasksForEntry = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, { parentTaskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const parent = await ctx.db.get(parentTaskId);
    if (!parent || !(await canViewCalendarBrief(ctx, userId, parent.briefId))) return [];
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", parentTaskId))
      .collect();

    const users = await ctx.db.query("users").collect();
    const teams = await ctx.db.query("teams").collect();
    const roleByUser = await buildRoleByUserMap(ctx);

    // Classify so legacy entries surface "Copy" / "Design" labels on the
    // right tasks regardless of which side the assignee sits on.
    const classification = classifyCalendarEntry(parent as any, tasks as any, roleByUser);

    const enriched = await Promise.all(
      tasks.map(async (task) => {
        const assignee = users.find((u) => u._id === task.assigneeId);

        const teamId = await resolveCalendarTaskTeam(ctx, task, teams);
        const teamName = teams.find((t) => t._id === teamId)?.name;

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
