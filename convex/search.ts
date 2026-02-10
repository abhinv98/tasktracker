import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

export const globalSearch = query({
  args: { query: v.string() },
  handler: async (ctx, { query: q }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { briefs: [], tasks: [], brands: [], teams: [], users: [] };
    if (!q.trim()) return { briefs: [], tasks: [], brands: [], teams: [], users: [] };

    const term = q.toLowerCase();
    const user = await ctx.db.get(userId);
    const role = user?.role ?? "employee";

    // Briefs
    let briefs = await ctx.db.query("briefs").collect();
    if (role === "manager") {
      briefs = briefs.filter((b) => b.assignedManagerId === userId);
    } else if (role === "employee") {
      const myTasks = await ctx.db
        .query("tasks")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
        .collect();
      const briefIds = new Set(myTasks.map((t) => t.briefId));
      briefs = briefs.filter((b) => briefIds.has(b._id));
    }
    const matchedBriefs = briefs
      .filter(
        (b) =>
          b.title.toLowerCase().includes(term) ||
          b.description.toLowerCase().includes(term)
      )
      .slice(0, 5)
      .map((b) => ({ _id: b._id, title: b.title, status: b.status, type: "brief" as const }));

    // Tasks
    let tasks = await ctx.db.query("tasks").collect();
    if (role === "employee") {
      tasks = tasks.filter((t) => t.assigneeId === userId);
    }
    const matchedTasks = tasks
      .filter((t) => t.title.toLowerCase().includes(term))
      .slice(0, 5)
      .map((t) => ({ _id: t._id, title: t.title, status: t.status, briefId: t.briefId, type: "task" as const }));

    // Brands
    const brands = role !== "employee"
      ? (await ctx.db.query("brands").collect())
          .filter((b) => b.name.toLowerCase().includes(term))
          .slice(0, 3)
          .map((b) => ({ _id: b._id, name: b.name, type: "brand" as const }))
      : [];

    // Teams
    const teams = role !== "employee"
      ? (await ctx.db.query("teams").collect())
          .filter((t) => t.name.toLowerCase().includes(term))
          .slice(0, 3)
          .map((t) => ({ _id: t._id, name: t.name, type: "team" as const }))
      : [];

    // Users (admin/manager only)
    const users =
      role === "admin" || role === "manager"
        ? (await ctx.db.query("users").collect())
            .filter(
              (u) =>
                u.name?.toLowerCase().includes(term) ||
                u.email?.toLowerCase().includes(term)
            )
            .slice(0, 3)
            .map((u) => ({
              _id: u._id,
              name: u.name ?? u.email ?? "Unknown",
              role: u.role,
              type: "user" as const,
            }))
        : [];

    return { briefs: matchedBriefs, tasks: matchedTasks, brands, teams, users };
  },
});
