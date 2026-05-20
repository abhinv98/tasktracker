import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ── Manager Worklog ────────────────────────────────────────────
// A brand/account manager logs, per brand per day, what they did.
// Self-authored. Readable back by their team lead (teams.leadId of a
// team the manager belongs to) and by super-admins. A plain admin who
// is neither sees nothing.

async function requireAdmin(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin")
    throw new Error("Only managers can use the worklog");
  return { userId: userId as Id<"users">, user };
}

/** True if `viewerId` may read `managerId`'s worklog. */
async function canSupervise(
  ctx: any,
  viewerId: Id<"users">,
  managerId: Id<"users">
): Promise<boolean> {
  if (viewerId === managerId) return true;
  const viewer = await ctx.db.get(viewerId);
  if (!viewer) return false;
  if (viewer.isSuperAdmin === true) return true;
  const ledTeams = await ctx.db
    .query("teams")
    .withIndex("by_lead", (q: any) => q.eq("leadId", viewerId))
    .collect();
  if (ledTeams.length === 0) return false;
  const ledTeamIds = new Set(ledTeams.map((t: any) => t._id));
  const managerTeams = await ctx.db
    .query("userTeams")
    .withIndex("by_user", (q: any) => q.eq("userId", managerId))
    .collect();
  return managerTeams.some((ut: any) => ledTeamIds.has(ut.teamId));
}

function dayBounds(date: string) {
  return {
    start: new Date(date + "T00:00:00").getTime(),
    end: new Date(date + "T23:59:59.999").getTime(),
  };
}

// YYYY-MM-DD for a timestamp. Used for timezone-tolerant day matching:
// MoM meetingDate is stored from the browser's local midnight, so a raw
// UTC epoch window on the server can miss "same day" MoMs for non-UTC
// users. Matching on the calendar-date string of meetingDate/createdAt
// (the day it was actually logged) is robust.
function ymd(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

const WORKLOG_BRIEF_TITLE = "Manager Worklog Tasks";

/** Find (or create) the per-(brand, manager) holder brief for auto-tasks
 *  generated from this manager's worklog entries. One brief per pair. */
async function getOrCreateWorklogBrief(
  ctx: any,
  brandId: Id<"brands">,
  userId: Id<"users">
): Promise<Id<"briefs">> {
  const existing = await ctx.db
    .query("briefs")
    .withIndex("by_manager", (q: any) => q.eq("assignedManagerId", userId))
    .collect();
  const match = existing.find(
    (b: any) => b.brandId === brandId && b.title === WORKLOG_BRIEF_TITLE
  );
  if (match) return match._id as Id<"briefs">;

  const all = await ctx.db.query("briefs").collect();
  return await ctx.db.insert("briefs", {
    title: WORKLOG_BRIEF_TITLE,
    description:
      "Auto-created. Holds tasks generated from this manager's daily worklog.",
    status: "active" as const,
    createdBy: userId,
    assignedManagerId: userId,
    brandId,
    globalPriority: all.length + 1,
  });
}

function worklogTaskTitle(content: string): string {
  const firstLine = (content || "").split("\n")[0].trim();
  if (!firstLine) return "Worklog task";
  return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
}

// ── Author side (self only) ────────────────────────────────────

export const myManagedBrands = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const links = await ctx.db
      .query("brandManagers")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .collect();
    const allBrands = await ctx.db.query("brands").collect();
    const managedIds = new Set(links.map((l) => l.brandId));
    // Super-admins manage everything; otherwise restrict to managed brands.
    const brands = user.isSuperAdmin
      ? allBrands
      : allBrands.filter((b) => managedIds.has(b._id));
    return brands
      .map((b) => ({ _id: b._id, name: b.name, color: b.color }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listMine = query({
  args: { date: v.optional(v.string()), brandId: v.optional(v.id("brands")) },
  handler: async (ctx, { date, brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    let entries = await ctx.db
      .query("managerWorklog")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();
    if (date) entries = entries.filter((e) => e.date === date);
    if (brandId) entries = entries.filter((e) => e.brandId === brandId);

    const brands = await ctx.db.query("brands").collect();
    return entries
      .map((e) => ({
        ...e,
        brandName: brands.find((b) => b._id === e.brandId)?.name ?? "—",
        brandColor: brands.find((b) => b._id === e.brandId)?.color ?? "#6b7280",
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },
});

export const addEntry = mutation({
  args: {
    brandId: v.id("brands"),
    date: v.string(),
    content: v.string(),
    hoursSpent: v.optional(v.number()),
    taskRefs: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const now = Date.now();

    // Auto-create a mirror task so the worklog entry shows up in My Tasks
    // and counts wherever a regular task counts. Self-assigned (assignee =
    // assignedBy = the manager) so it never enters anyone else's queue.
    const briefId = await getOrCreateWorklogBrief(ctx, args.brandId, userId);
    const sibTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", userId))
      .collect();
    const maxOrder = sibTasks.length
      ? Math.max(...sibTasks.map((t) => t.sortOrder))
      : 0;
    const linkedTaskId = await ctx.db.insert("tasks", {
      briefId,
      title: worklogTaskTitle(args.content),
      description: args.content,
      assigneeId: userId,
      assignedBy: userId,
      status: "pending" as const,
      sortOrder: maxOrder + 1000,
      assignedAt: now,
    });

    return await ctx.db.insert("managerWorklog", {
      ...args,
      userId,
      done: false,
      linkedTaskId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Check off / uncheck a worklog entry. Mirrors the state onto the linked
 *  task so it disappears from "open" tasks counts when checked. */
export const toggleDone = mutation({
  args: { entryId: v.id("managerWorklog") },
  handler: async (ctx, { entryId }) => {
    const { userId } = await requireAdmin(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.userId !== userId)
      throw new Error("Worklog entry not found");
    const now = Date.now();
    const nextDone = !entry.done;
    await ctx.db.patch(entryId, { done: nextDone, updatedAt: now });
    if (entry.linkedTaskId) {
      const task = await ctx.db.get(entry.linkedTaskId);
      if (task) {
        await ctx.db.patch(entry.linkedTaskId, {
          status: nextDone ? ("done" as const) : ("pending" as const),
          completedAt: nextDone ? now : undefined,
        });
      }
    }
  },
});

export const updateEntry = mutation({
  args: {
    entryId: v.id("managerWorklog"),
    brandId: v.optional(v.id("brands")),
    date: v.optional(v.string()),
    content: v.optional(v.string()),
    hoursSpent: v.optional(v.number()),
    taskRefs: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, { entryId, ...fields }) => {
    const { userId } = await requireAdmin(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.userId !== userId)
      throw new Error("Worklog entry not found");
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.brandId !== undefined) updates.brandId = fields.brandId;
    if (fields.date !== undefined) updates.date = fields.date;
    if (fields.content !== undefined) updates.content = fields.content;
    if (fields.hoursSpent !== undefined) updates.hoursSpent = fields.hoursSpent;
    if (fields.taskRefs !== undefined) updates.taskRefs = fields.taskRefs;
    await ctx.db.patch(entryId, updates);

    // Keep the mirror task in sync with content/brand edits.
    if (entry.linkedTaskId && (fields.content !== undefined || fields.brandId !== undefined)) {
      const taskUpdates: Record<string, unknown> = {};
      if (fields.content !== undefined) {
        taskUpdates.title = worklogTaskTitle(fields.content);
        taskUpdates.description = fields.content;
      }
      if (fields.brandId !== undefined && fields.brandId !== entry.brandId) {
        // Brand changed — move the task under the new brand's worklog brief.
        const newBriefId = await getOrCreateWorklogBrief(
          ctx,
          fields.brandId,
          userId
        );
        taskUpdates.briefId = newBriefId;
      }
      if (Object.keys(taskUpdates).length > 0) {
        await ctx.db.patch(entry.linkedTaskId, taskUpdates);
      }
    }
  },
});

export const deleteEntry = mutation({
  args: { entryId: v.id("managerWorklog") },
  handler: async (ctx, { entryId }) => {
    const { userId } = await requireAdmin(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.userId !== userId)
      throw new Error("Worklog entry not found");
    // Cascade-delete the mirror task so no orphan task lingers.
    if (entry.linkedTaskId) {
      const task = await ctx.db.get(entry.linkedTaskId);
      if (task) await ctx.db.delete(entry.linkedTaskId);
    }
    await ctx.db.delete(entryId);
  },
});

// ── Supervisor side (team lead / super-admin) ──────────────────

export const listSupervisableManagers = query({
  args: {},
  handler: async (ctx) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return [];
    const viewer = await ctx.db.get(viewerId);
    if (!viewer) return [];

    const allUsers = await ctx.db.query("users").collect();
    const managers = allUsers.filter((u) => u.role === "admin");

    if (viewer.isSuperAdmin === true) {
      return managers
        .map((u) => ({
          _id: u._id,
          name: u.name ?? u.email ?? "Unknown",
          email: u.email,
          avatarUrl: u.avatarUrl,
          isSuperAdmin: u.isSuperAdmin,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const ledTeams = await ctx.db
      .query("teams")
      .withIndex("by_lead", (q) => q.eq("leadId", viewerId))
      .collect();
    if (ledTeams.length === 0) return [];
    const ledTeamIds = new Set(ledTeams.map((t) => t._id));
    const allUserTeams = await ctx.db.query("userTeams").collect();
    const visibleIds = new Set(
      allUserTeams
        .filter((ut) => ledTeamIds.has(ut.teamId))
        .map((ut) => ut.userId)
    );
    return managers
      .filter((u) => visibleIds.has(u._id))
      .map((u) => ({
        _id: u._id,
        name: u.name ?? u.email ?? "Unknown",
        email: u.email,
        avatarUrl: u.avatarUrl,
        isSuperAdmin: u.isSuperAdmin,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getManagerWorklogDay = query({
  args: { managerId: v.id("users"), date: v.string() },
  handler: async (ctx, { managerId, date }) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return null;
    if (!(await canSupervise(ctx, viewerId, managerId))) return null;

    const manager = await ctx.db.get(managerId);
    if (!manager) return null;

    const { start, end } = dayBounds(date);

    const entries = await ctx.db
      .query("managerWorklog")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", managerId).eq("date", date)
      )
      .collect();

    const allBrands = await ctx.db.query("brands").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const briefMap = new Map(allBriefs.map((b) => [b._id, b]));
    const brandMap = new Map(allBrands.map((b) => [b._id, b]));

    // Tasks this manager handled (assigned-by or assigned-to) with activity
    // that day: completed today, deadline today, or assigned today.
    const allTasks = await ctx.db.query("tasks").collect();
    const handled = allTasks.filter(
      (t) => t.assignedBy === managerId || t.assigneeId === managerId
    );
    const tasksToday = handled
      .filter((t) => {
        const completedOn =
          t.completedAt &&
          new Date(t.completedAt).toISOString().split("T")[0] === date;
        const deadlineOn =
          t.deadline &&
          new Date(t.deadline).toISOString().split("T")[0] === date;
        const assignedOn =
          (t.assignedAt ?? (t as any)._creationTime) >= start &&
          (t.assignedAt ?? (t as any)._creationTime) <= end;
        return completedOn || deadlineOn || assignedOn;
      })
      .map((t) => {
        const brief = briefMap.get(t.briefId);
        const brand = brief?.brandId ? brandMap.get(brief.brandId) : null;
        return {
          _id: t._id,
          title: t.title,
          status: t.status,
          brandName: brand?.name ?? "No Brand",
          briefTitle: brief?.title ?? "Unknown",
          completedAt: t.completedAt ?? null,
          deadline: t.deadline ?? null,
        };
      });

    // MoMs this manager created that day (counts brand-page & notebook MoMs).
    const moms = await ctx.db
      .query("meetingMinutes")
      .withIndex("by_creator", (q) => q.eq("createdBy", managerId))
      .collect();
    const momsToday = moms
      .filter(
        (m) =>
          ymd(m.meetingDate) === date ||
          ymd(m.createdAt) === date ||
          (m.meetingDate >= start && m.meetingDate <= end)
      )
      .map((m) => ({
        _id: m._id,
        title: m.title,
        brandName: brandMap.get(m.brandId)?.name ?? "—",
      }));

    // Open tasks this manager delegated to others (their supervising
    // responsibility): pending / in-progress / review, non-archived brief.
    const allUsers = await ctx.db.query("users").collect();
    const userMap = new Map(allUsers.map((u) => [u._id, u]));
    const OPEN = new Set(["pending", "in-progress", "review"]);
    const supervising = allTasks
      .filter(
        (t) =>
          t.assignedBy === managerId &&
          t.assigneeId !== managerId &&
          OPEN.has(t.status) &&
          (() => {
            const b = briefMap.get(t.briefId);
            return b && b.status !== "archived";
          })()
      )
      .map((t) => {
        const brief = briefMap.get(t.briefId);
        const brand = brief?.brandId ? brandMap.get(brief.brandId) : null;
        const assignee = userMap.get(t.assigneeId);
        return {
          _id: t._id,
          title: t.title,
          status: t.status,
          assigneeName:
            assignee?.name ?? assignee?.email ?? "Unknown",
          brandName: brand?.name ?? "No Brand",
          brandColor: brand?.color ?? "#6b7280",
          deadline: t.deadline ?? null,
        };
      })
      .sort((a, b) => {
        const rank = (s: string) =>
          s === "review" ? 0 : s === "in-progress" ? 1 : 2;
        return rank(a.status) - rank(b.status);
      });

    return {
      manager: {
        _id: manager._id,
        name: manager.name ?? manager.email ?? "Unknown",
        email: manager.email,
        avatarUrl: manager.avatarUrl,
      },
      date,
      entries: entries.map((e) => ({
        ...e,
        brandName: brandMap.get(e.brandId)?.name ?? "—",
        brandColor: brandMap.get(e.brandId)?.color ?? "#6b7280",
      })),
      tasks: tasksToday,
      moms: momsToday,
      supervising,
      summary: {
        brandsLogged: new Set(entries.map((e) => e.brandId)).size,
        totalHours: entries.reduce((s, e) => s + (e.hoursSpent ?? 0), 0),
        tasksHandled: tasksToday.length,
        momCount: momsToday.length,
        supervisingOpen: supervising.length,
      },
    };
  },
});

export const getManagerWorklogReport = query({
  args: {
    managerId: v.id("users"),
    from: v.string(), // "YYYY-MM-DD" inclusive
    to: v.string(), // "YYYY-MM-DD" inclusive
  },
  handler: async (ctx, { managerId, from, to }) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return null;
    if (!(await canSupervise(ctx, viewerId, managerId))) return null;

    const manager = await ctx.db.get(managerId);
    if (!manager) return null;

    const rangeStart = new Date(from + "T00:00:00").getTime();
    const rangeEnd = new Date(to + "T23:59:59.999").getTime();

    const allEntries = await ctx.db
      .query("managerWorklog")
      .withIndex("by_user_date", (q) => q.eq("userId", managerId))
      .collect();
    const entries = allEntries.filter(
      (e) => e.date >= from && e.date <= to
    );

    const allBrands = await ctx.db.query("brands").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const briefMap = new Map(allBriefs.map((b) => [b._id, b]));
    const brandMap = new Map(allBrands.map((b) => [b._id, b]));

    const allTasks = await ctx.db.query("tasks").collect();
    const handledTasks = allTasks.filter(
      (t) => t.assignedBy === managerId || t.assigneeId === managerId
    );

    const moms = await ctx.db
      .query("meetingMinutes")
      .withIndex("by_creator", (q) => q.eq("createdBy", managerId))
      .collect();
    const momsInRange = moms.filter((m) => {
      const md = ymd(m.meetingDate);
      const cd = ymd(m.createdAt);
      return (
        (md >= from && md <= to) ||
        (cd >= from && cd <= to) ||
        (m.meetingDate >= rangeStart && m.meetingDate <= rangeEnd)
      );
    });

    type BrandReport = {
      brandId: string;
      brandName: string;
      brandColor: string;
      daysLogged: Set<string>;
      totalHours: number;
      entries: { date: string; content: string; hoursSpent?: number }[];
      tasks: {
        _id: string;
        title: string;
        status: string;
        date: string | null;
      }[];
      momCount: number;
    };
    const byBrand = new Map<string, BrandReport>();

    const ensure = (brandId: Id<"brands"> | undefined): BrandReport => {
      const key = brandId ? (brandId as string) : "__no_brand__";
      if (!byBrand.has(key)) {
        const brand = brandId ? brandMap.get(brandId) : null;
        byBrand.set(key, {
          brandId: key,
          brandName: brand?.name ?? "No Brand",
          brandColor: brand?.color ?? "#6b7280",
          daysLogged: new Set(),
          totalHours: 0,
          entries: [],
          tasks: [],
          momCount: 0,
        });
      }
      return byBrand.get(key)!;
    };

    for (const e of entries) {
      const r = ensure(e.brandId);
      r.daysLogged.add(e.date);
      r.totalHours += e.hoursSpent ?? 0;
      r.entries.push({
        date: e.date,
        content: e.content,
        hoursSpent: e.hoursSpent,
      });
    }

    for (const t of handledTasks) {
      const brief = briefMap.get(t.briefId);
      if (!brief) continue;
      const when = t.completedAt ?? t.assignedAt ?? (t as any)._creationTime;
      if (when < rangeStart || when > rangeEnd) continue;
      const r = ensure(brief.brandId);
      r.tasks.push({
        _id: t._id,
        title: t.title,
        status: t.status,
        date: when ? new Date(when).toISOString().split("T")[0] : null,
      });
    }

    for (const m of momsInRange) {
      const r = ensure(m.brandId);
      r.momCount += 1;
    }

    const brands = [...byBrand.values()]
      .map((r) => ({
        brandId: r.brandId,
        brandName: r.brandName,
        brandColor: r.brandColor,
        daysLogged: r.daysLogged.size,
        totalHours: r.totalHours,
        entries: r.entries.sort((a, b) => (a.date < b.date ? -1 : 1)),
        tasks: r.tasks.sort((a, b) =>
          (a.date ?? "") < (b.date ?? "") ? -1 : 1
        ),
        momCount: r.momCount,
      }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName));

    return {
      manager: {
        _id: manager._id,
        name: manager.name ?? manager.email ?? "Unknown",
        email: manager.email,
        avatarUrl: manager.avatarUrl,
      },
      from,
      to,
      brands,
      totals: {
        brands: brands.length,
        daysLogged: new Set(entries.map((e) => e.date)).size,
        totalHours: entries.reduce((s, e) => s + (e.hoursSpent ?? 0), 0),
        momCount: momsInRange.length,
      },
    };
  },
});
