import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getEmployeeReport = query({
  args: {
    employeeId: v.optional(v.id("users")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const isAdmin = user.role === "admin";

    // Check if user is a team lead
    const allTeams = await ctx.db.query("teams").collect();
    const ledTeams = allTeams.filter((t) => t.leadId === userId);
    const isTeamLead = ledTeams.length > 0;

    // Must be admin or team lead to access reports
    if (!isAdmin && !isTeamLead) return null;

    const allUsers = await ctx.db.query("users").collect();
    const allUserTeams = await ctx.db.query("userTeams").collect();

    // Determine which employees are visible to this user
    let visibleEmployeeIds: Set<any>;

    if (isAdmin) {
      // Admins see everyone
      visibleEmployeeIds = new Set(
        allUsers.filter((u) => u.name || u.email).map((u) => u._id)
      );
    } else {
      // Team leads see only members of the teams they lead
      const ledTeamIds = new Set(ledTeams.map((t) => t._id));
      const teamMemberIds = allUserTeams
        .filter((ut) => ledTeamIds.has(ut.teamId))
        .map((ut) => ut.userId);
      visibleEmployeeIds = new Set(teamMemberIds);
      // Also include themselves
      visibleEmployeeIds.add(userId);
    }

    // If team filter is applied, narrow down to that team's members
    if (args.teamId) {
      const teamMembers = allUserTeams
        .filter((ut) => ut.teamId === args.teamId)
        .map((ut) => ut.userId);
      const teamMemberSet = new Set(teamMembers);
      // Intersect with visible employees
      visibleEmployeeIds = new Set(
        [...visibleEmployeeIds].filter((id) => teamMemberSet.has(id))
      );
    }

    const employees = allUsers.filter(
      (u) => (u.name || u.email) && visibleEmployeeIds.has(u._id)
    );

    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allTimeEntries = await ctx.db.query("timeEntries").collect();
    const allDeliverables = await ctx.db.query("deliverables").collect();

    // Brand filter: get brief IDs for the selected brand
    let brandBriefIds: Set<string> | null = null;
    if (args.brandId) {
      brandBriefIds = new Set(
        allBriefs
          .filter((b: any) => b.brandId === args.brandId)
          .map((b) => b._id)
      );
    }

    const startMs = args.startDate ? new Date(args.startDate + "T00:00:00").getTime() : 0;
    const endMs = args.endDate ? new Date(args.endDate + "T23:59:59.999").getTime() : Date.now();

    function buildEmployeeReport(empId: string) {
      const emp = allUsers.find((u) => u._id === empId);
      if (!emp) return null;

      let empTasks = allTasks.filter((t) => t.assigneeId === empId);

      // Apply brand filter at task level
      if (brandBriefIds) {
        empTasks = empTasks.filter((t) => brandBriefIds!.has(t.briefId));
      }

      const tasksInRange = empTasks.filter((t) => {
        const assignedAt = t.assignedAt ?? (t as any)._creationTime;
        if (assignedAt && assignedAt >= startMs && assignedAt <= endMs) return true;
        if (t.deadline && t.deadline >= startMs && t.deadline <= endMs) return true;
        if (t.completedAt && t.completedAt >= startMs && t.completedAt <= endMs) return true;
        return false;
      });

      const completedTasks = tasksInRange.filter((t) => t.status === "done");
      // "review" tasks are already submitted and awaiting approval — they
      // shouldn't count as overdue against the assignee.
      const overdueTasks = tasksInRange.filter(
        (t) =>
          t.deadline &&
          t.deadline < Date.now() &&
          t.status !== "done" &&
          t.status !== "review"
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
        const submittedForReviewAt = t.submittedForReviewAt ?? null;
        const employeeTimeHours = (submittedForReviewAt && tAssignedAt)
          ? Math.round(((submittedForReviewAt - tAssignedAt) / (1000 * 60 * 60)) * 10) / 10
          : null;
        const approvalTimeHours = (t.completedAt && submittedForReviewAt)
          ? Math.round(((t.completedAt - submittedForReviewAt) / (1000 * 60 * 60)) * 10) / 10
          : null;
        return {
          _id: t._id,
          title: t.title,
          status: t.status,
          assignedAt: tAssignedAt,
          submittedForReviewAt,
          deadline: t.deadline,
          completedAt: t.completedAt,
          briefTitle: brief?.title ?? "Unknown",
          briefId: t.briefId,
          taskTimeHours,
          employeeTimeHours,
          approvalTimeHours,
          deadlineExtended: t.deadlineExtended ?? false,
          originalDeadline: t.originalDeadline,
          changesCount: t.changesCount ?? 0,
        };
      });

      return {
        employee: {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          designation: emp.designation,
          isSuperAdmin: (emp as any).isSuperAdmin,
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
      // Ensure the requested employee is within visible set
      if (!visibleEmployeeIds.has(args.employeeId)) {
        return { employees: [], dateRange: { startDate: args.startDate, endDate: args.endDate } };
      }
      const report = buildEmployeeReport(args.employeeId);
      return { employees: report ? [report] : [], dateRange: { startDate: args.startDate, endDate: args.endDate } };
    }

    const reports = employees
      .map((emp) => buildEmployeeReport(emp._id))
      .filter(Boolean);

    return { employees: reports, dateRange: { startDate: args.startDate, endDate: args.endDate } };
  },
});
