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
    return await ctx.db.insert("managerWorklog", {
      ...args,
      userId,
      createdAt: now,
      updatedAt: now,
    });
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
  },
});

export const deleteEntry = mutation({
  args: { entryId: v.id("managerWorklog") },
  handler: async (ctx, { entryId }) => {
    const { userId } = await requireAdmin(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.userId !== userId)
      throw new Error("Worklog entry not found");
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
      .filter((m) => m.meetingDate >= start && m.meetingDate <= end)
      .map((m) => ({
        _id: m._id,
        title: m.title,
        brandName: brandMap.get(m.brandId)?.name ?? "—",
      }));

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
      summary: {
        brandsLogged: new Set(entries.map((e) => e.brandId)).size,
        totalHours: entries.reduce((s, e) => s + (e.hoursSpent ?? 0), 0),
        tasksHandled: tasksToday.length,
        momCount: momsToday.length,
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
    const momsInRange = moms.filter(
      (m) => m.meetingDate >= rangeStart && m.meetingDate <= rangeEnd
    );

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
