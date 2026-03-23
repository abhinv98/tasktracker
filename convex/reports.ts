import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getEmployeeReport = query({
  args: {
    employeeId: v.optional(v.id("users")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const employees = allUsers.filter((u) => u.role === "employee");

    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allTimeEntries = await ctx.db.query("timeEntries").collect();
    const allDeliverables = await ctx.db.query("deliverables").collect();

    const startMs = args.startDate ? new Date(args.startDate + "T00:00:00").getTime() : 0;
    const endMs = args.endDate ? new Date(args.endDate + "T23:59:59.999").getTime() : Date.now();

    function buildEmployeeReport(empId: string) {
      const emp = allUsers.find((u) => u._id === empId);
      if (!emp) return null;

      const empTasks = allTasks.filter((t) => t.assigneeId === empId);

      const tasksInRange = empTasks.filter((t) => {
        const assignedAt = t.assignedAt ?? (t as any)._creationTime;
        if (assignedAt && assignedAt >= startMs && assignedAt <= endMs) return true;
        if (t.deadline && t.deadline >= startMs && t.deadline <= endMs) return true;
        if (t.completedAt && t.completedAt >= startMs && t.completedAt <= endMs) return true;
        return false;
      });

      const completedTasks = tasksInRange.filter((t) => t.status === "done");
      const overdueTasks = tasksInRange.filter(
        (t) => t.deadline && t.deadline < Date.now() && t.status !== "done"
      );

      const timeEntries = allTimeEntries.filter(
        (te) => te.userId === empId && te.startedAt >= startMs && te.startedAt <= endMs
      );
      const totalMinutes = timeEntries.reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);

      const totalTimeFromTasks = completedTasks
        .filter((t) => t.completedAt && t.assignedAt)
        .reduce((sum, t) => sum + (t.completedAt! - t.assignedAt!), 0);
      const totalTaskHours = Math.round((totalTimeFromTasks / (1000 * 60 * 60)) * 10) / 10;

      const briefIds = [...new Set(tasksInRange.map((t) => t.briefId))];

      const deliverables = allDeliverables.filter(
        (d) => d.submittedBy === empId && d.submittedAt >= startMs && d.submittedAt <= endMs
      );
      const approvedDeliverables = deliverables.filter((d) => d.status === "approved");

      const completionTimes = completedTasks
        .filter((t) => t.completedAt && t.assignedAt)
        .map((t) => (t.completedAt! - t.assignedAt!) / (1000 * 60 * 60));
      const avgCompletionHours = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

      const taskDetails = tasksInRange.map((t) => {
        const brief = allBriefs.find((b) => b._id === t.briefId);
        const tAssignedAt = t.assignedAt ?? (t as any)._creationTime;
        const taskTimeHours = (t.completedAt && tAssignedAt)
          ? Math.round(((t.completedAt - tAssignedAt) / (1000 * 60 * 60)) * 10) / 10
          : null;
        return {
          _id: t._id,
          title: t.title,
          status: t.status,
          assignedAt: tAssignedAt,
          deadline: t.deadline,
          completedAt: t.completedAt,
          briefTitle: brief?.title ?? "Unknown",
          briefId: t.briefId,
          taskTimeHours,
        };
      });

      return {
        employee: {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          designation: emp.designation,
        },
        totalTasks: tasksInRange.length,
        completedTasks: completedTasks.length,
        overdueTasks: overdueTasks.length,
        totalMinutes,
        totalTaskHours,
        briefCount: briefIds.length,
        deliverableCount: deliverables.length,
        approvedDeliverableCount: approvedDeliverables.length,
        avgCompletionHours: Math.round(avgCompletionHours * 10) / 10,
        tasks: taskDetails,
      };
    }

    if (args.employeeId) {
      const report = buildEmployeeReport(args.employeeId);
      return { employees: report ? [report] : [], dateRange: { startDate: args.startDate, endDate: args.endDate } };
    }

    const reports = employees
      .map((emp) => buildEmployeeReport(emp._id))
      .filter(Boolean);

    return { employees: reports, dateRange: { startDate: args.startDate, endDate: args.endDate } };
  },
});
