import { getAuthUserId } from "./lib/internalAuth";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Admin-only overview of freelancers and the briefs/tasks assigned to them.
 *
 * Scoping mirrors the oversight board: super admins see every freelancer
 * (even ones with no tasks yet — useful as a roster); a regular admin
 * (brand manager) only sees freelancers with at least one task on a brief
 * belonging to a brand they manage. Briefs with no brand are only visible
 * to super admins.
 */
export const getFreelancersOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return null;

    const isSuperAdmin = user.isSuperAdmin === true;

    let managedBrandIds: Set<Id<"brands">> | null = null;
    if (!isSuperAdmin) {
      const managed = await ctx.db
        .query("brandManagers")
        .withIndex("by_manager", (q) => q.eq("managerId", userId))
        .collect();
      managedBrandIds = new Set(managed.map((m) => m.brandId));
      if (managedBrandIds.size === 0) {
        return { isSuperAdmin, freelancers: [] };
      }
    }

    const employees = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "employee"))
      .collect();
    const freelancerUsers = employees.filter((u) => u.isFreelancer === true);
    if (freelancerUsers.length === 0) {
      return { isSuperAdmin, freelancers: [] };
    }

    const allBriefs = await ctx.db.query("briefs").collect();
    const briefById = new Map(allBriefs.map((b) => [b._id, b]));
    const allBrands = await ctx.db.query("brands").collect();
    const brandById = new Map(allBrands.map((b) => [b._id, b]));

    const freelancers = [];
    for (const f of freelancerUsers) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", f._id))
        .collect();

      const inScope = tasks.filter((t) => {
        const brief = briefById.get(t.briefId);
        if (!brief || brief.status === "archived") return false;
        if (managedBrandIds) {
          return brief.brandId !== undefined && managedBrandIds.has(brief.brandId);
        }
        return true;
      });

      // Scoped admins only see freelancers actually working on their brands
      if (!isSuperAdmin && inScope.length === 0) continue;

      const byBrief = new Map<Id<"briefs">, Doc<"tasks">[]>();
      for (const t of inScope) {
        const list = byBrief.get(t.briefId) ?? [];
        list.push(t);
        byBrief.set(t.briefId, list);
      }

      const briefs = [...byBrief.entries()]
        .map(([briefId, briefTasks]) => {
          const brief = briefById.get(briefId)!;
          const brand = brief.brandId ? brandById.get(brief.brandId) : undefined;
          return {
            briefId,
            title: brief.title,
            status: brief.status,
            briefType: brief.briefType,
            deadline: brief.deadline,
            brand: brand
              ? { _id: brand._id, name: brand.name, color: brand.color }
              : null,
            latestAssignedAt: Math.max(
              ...briefTasks.map((t) => t.assignedAt ?? t._creationTime)
            ),
            tasks: briefTasks
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((t) => ({
                _id: t._id,
                title: t.title,
                status: t.status,
                deadline: t.deadline,
                assignedAt: t.assignedAt ?? t._creationTime,
                completedAt: t.completedAt,
              })),
          };
        })
        .sort((a, b) => b.latestAssignedAt - a.latestAssignedAt);

      const count = (status: string) =>
        inScope.filter((t) => t.status === status).length;

      freelancers.push({
        _id: f._id,
        name: f.name,
        email: f.email,
        designation: f.designation,
        avatarUrl: f.avatarUrl,
        taskCounts: {
          total: inScope.length,
          done: count("done"),
          inProgress: count("in-progress"),
          review: count("review"),
          pending: count("pending"),
        },
        briefs,
      });
    }

    freelancers.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { isSuperAdmin, freelancers };
  },
});
