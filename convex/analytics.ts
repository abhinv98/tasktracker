import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export const getDashboardAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) return null;

    const briefs = await ctx.db.query("briefs").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const users = await ctx.db.query("users").collect();
    const teams = await ctx.db.query("teams").collect();
    const brands = await ctx.db.query("brands").collect();
    const timeEntries = await ctx.db.query("timeEntries").collect();
    const activityLog = await ctx.db.query("activityLog").collect();

    // Brief stats
    const briefsByStatus: Record<string, number> = {};
    for (const b of briefs) {
      briefsByStatus[b.status] = (briefsByStatus[b.status] || 0) + 1;
    }

    // Task stats
    const tasksByStatus: Record<string, number> = {};
    for (const t of tasks) {
      tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
    }

    const doneTasks = tasks.filter((t) => t.status === "done");
    const overdueTasks = tasks.filter(
      (t) => t.deadline && t.deadline < Date.now() && t.status !== "done"
    );

    // Avg completion time (for done tasks with completedAt)
    const completionTimes = doneTasks
      .filter((t) => t.completedAt)
      .map((t) => t.completedAt! - t._creationTime);
    const avgCompletionMs =
      completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;
    const avgCompletionHours = Math.round(avgCompletionMs / (1000 * 60 * 60));

    // Employee utilization
    const employees = users.filter((u) => u.role === "employee");
    const employeeStats = employees.map((emp) => {
      const empTasks = tasks.filter((t) => t.assigneeId === emp._id);
      const empDone = empTasks.filter((t) => t.status === "done").length;
      const empTimeEntries = timeEntries.filter((te) => te.userId === emp._id);
      const totalTrackedMinutes = empTimeEntries.reduce(
        (sum, te) => sum + (te.durationMinutes ?? 0),
        0
      );
      const estimatedMinutes = empTasks.reduce(
        (sum, t) => sum + t.durationMinutes,
        0
      );
      return {
        _id: emp._id,
        name: emp.name ?? emp.email ?? "Unknown",
        totalTasks: empTasks.length,
        doneTasks: empDone,
        trackedHours: Math.round(totalTrackedMinutes / 60 * 10) / 10,
        estimatedHours: Math.round(estimatedMinutes / 60 * 10) / 10,
      };
    });

    // Weekly velocity (tasks completed per week, last 8 weeks)
    const now = Date.now();
    const weeklyVelocity: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = now - (i + 1) * 7 * 24 * 60 * 60 * 1000;
      const weekEnd = now - i * 7 * 24 * 60 * 60 * 1000;
      const count = doneTasks.filter(
        (t) => t.completedAt && t.completedAt >= weekStart && t.completedAt < weekEnd
      ).length;
      const label = new Date(weekEnd).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      weeklyVelocity.push({ week: label, count });
    }

    // Recent activity (last 20)
    const recentActivity = activityLog
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map((log) => {
        const actUser = users.find((u) => u._id === log.userId);
        const brief = briefs.find((b) => b._id === log.briefId);
        return {
          ...log,
          userName: actUser?.name ?? actUser?.email ?? "Unknown",
          briefTitle: brief?.title ?? "Unknown",
        };
      });

    return {
      totalBriefs: briefs.length,
      totalTasks: tasks.length,
      totalUsers: users.length,
      totalTeams: teams.length,
      totalBrands: brands.length,
      briefsByStatus,
      tasksByStatus,
      overdueTasks: overdueTasks.length,
      avgCompletionHours,
      employeeStats,
      weeklyVelocity,
      recentActivity,
    };
  },
});
