import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getEmployeeWorkLog = query({
  args: { date: v.string() }, // "YYYY-MM-DD"
  handler: async (ctx, { date }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const employees = allUsers.filter(
      (u) => u.role === "employee" || u.role === "manager"
    );
    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allTimeEntries = await ctx.db.query("timeEntries").collect();
    const allActivityLogs = await ctx.db.query("activityLog").collect();

    const dayStart = new Date(date + "T00:00:00").getTime();
    const dayEnd = new Date(date + "T23:59:59.999").getTime();

    const employeeWorkLogs = employees.map((emp) => {
      const taskIds = new Set<string>();

      // Tasks with deadline on this date
      const tasksWithDeadline = allTasks.filter((t) => {
        if (t.assigneeId !== emp._id || !t.deadline) return false;
        const dlDate = new Date(t.deadline).toISOString().split("T")[0];
        return dlDate === date;
      });
      tasksWithDeadline.forEach((t) => taskIds.add(t._id));

      // Tasks with time entries on this date
      const timeEntriesForDay = allTimeEntries.filter((te) => {
        if (te.userId !== emp._id) return false;
        return te.startedAt >= dayStart && te.startedAt <= dayEnd;
      });
      timeEntriesForDay.forEach((te) => taskIds.add(te.taskId));

      // Tasks with activity (status changes) on this date
      const activityForDay = allActivityLogs.filter((al) => {
        if (al.userId !== emp._id) return false;
        return al.timestamp >= dayStart && al.timestamp <= dayEnd;
      });
      activityForDay.forEach((al) => {
        if (al.taskId) taskIds.add(al.taskId);
      });

      // Tasks completed on this date
      const completedToday = allTasks.filter((t) => {
        if (t.assigneeId !== emp._id || !t.completedAt) return false;
        const cDate = new Date(t.completedAt).toISOString().split("T")[0];
        return cDate === date;
      });
      completedToday.forEach((t) => taskIds.add(t._id));

      const tasks = [...taskIds]
        .map((id) => {
          const task = allTasks.find((t) => t._id === id);
          if (!task) return null;
          const brief = allBriefs.find((b) => b._id === task.briefId);
          const timeSpent = timeEntriesForDay
            .filter((te) => te.taskId === id)
            .reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
          return {
            _id: task._id,
            title: task.title,
            status: task.status,
            duration: task.duration,
            briefTitle: brief?.title ?? "Unknown",
            briefId: task.briefId,
            timeSpentMinutes: timeSpent,
            deadline: task.deadline,
          };
        })
        .filter(Boolean);

      return {
        user: {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          avatarUrl: emp.avatarUrl,
        },
        tasks,
        totalTasks: tasks.length,
        completedTasks: tasks.filter((t) => t?.status === "done").length,
      };
    });

    // Only show employees with tasks
    const withTasks = employeeWorkLogs.filter((e) => e.totalTasks > 0);
    const allEmployeeLogs = employeeWorkLogs;

    return {
      date,
      employees: allEmployeeLogs,
      employeesWithTasks: withTasks,
      summary: {
        totalEmployees: allEmployeeLogs.length,
        employeesActive: withTasks.length,
        totalTasks: withTasks.reduce((s, e) => s + e.totalTasks, 0),
        completedTasks: withTasks.reduce((s, e) => s + e.completedTasks, 0),
      },
    };
  },
});

export const getTaskManifest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allBrands = await ctx.db.query("brands").collect();

    const activeBriefs = allBriefs.filter(
      (b) => !["archived", "completed"].includes(b.status)
    );

    const employees = allUsers.filter(
      (u) => u.role === "employee" || u.role === "manager"
    );

    return employees.map((emp) => {
      const empTasks = allTasks.filter((t) => t.assigneeId === emp._id);
      const briefIds = [...new Set(empTasks.map((t) => t.briefId))];
      const empBriefs = briefIds
        .map((bid) => {
          const brief = activeBriefs.find((b) => b._id === bid);
          if (!brief) return null;
          const brand = brief.brandId
            ? allBrands.find((br) => br._id === brief.brandId)
            : null;
          const tasksInBrief = empTasks.filter((t) => t.briefId === bid);
          const doneTasks = tasksInBrief.filter((t) => t.status === "done").length;
          return {
            briefId: brief._id,
            briefTitle: brief.title,
            briefType: (brief as any).briefType,
            brandName: brand?.name ?? "No Brand",
            brandColor: brand?.color ?? "#6b7280",
            totalTasks: tasksInBrief.length,
            doneTasks,
            status: brief.status,
          };
        })
        .filter(Boolean);

      return {
        user: {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          avatarUrl: emp.avatarUrl,
        },
        briefs: empBriefs,
        totalTasks: empTasks.length,
        completedTasks: empTasks.filter((t) => t.status === "done").length,
      };
    }).filter((e) => e.briefs.length > 0);
  },
});

export const getTeamLoadView = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return null;

    const teams = await ctx.db.query("teams").collect();
    const userTeams = await ctx.db.query("userTeams").collect();
    const allUsers = await ctx.db.query("users").collect();
    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();

    const activeBriefs = allBriefs.filter(
      (b) => !["archived", "completed"].includes(b.status)
    );
    const activeTaskIds = new Set(
      allTasks
        .filter((t) => activeBriefs.some((b) => b._id === t.briefId))
        .map((t) => t._id)
    );
    const activeTasks = allTasks.filter((t) => activeTaskIds.has(t._id));

    return teams.map((team) => {
      const memberLinks = userTeams.filter((ut) => ut.teamId === team._id);
      const memberIds = memberLinks.map((ml) => ml.userId);
      const members = memberIds
        .map((mid) => {
          const u = allUsers.find((usr) => usr._id === mid);
          if (!u) return null;
          const memberTasks = activeTasks.filter((t) => t.assigneeId === mid);
          return {
            _id: u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            taskCount: memberTasks.length,
            pendingTasks: memberTasks.filter((t) => t.status === "pending").length,
            inProgressTasks: memberTasks.filter((t) => t.status === "in-progress").length,
            reviewTasks: memberTasks.filter((t) => t.status === "review").length,
            doneTasks: memberTasks.filter((t) => t.status === "done").length,
          };
        })
        .filter(Boolean);

      const teamTasks = activeTasks.filter((t) =>
        memberIds.includes(t.assigneeId)
      );

      const loadLevel =
        teamTasks.length === 0
          ? "idle"
          : teamTasks.length / Math.max(members.length, 1) > 8
            ? "heavy"
            : teamTasks.length / Math.max(members.length, 1) > 4
              ? "moderate"
              : "light";

      return {
        team: {
          _id: team._id,
          name: team.name,
          color: team.color,
        },
        members,
        totalTasks: teamTasks.length,
        statusCounts: {
          pending: teamTasks.filter((t) => t.status === "pending").length,
          "in-progress": teamTasks.filter((t) => t.status === "in-progress").length,
          review: teamTasks.filter((t) => t.status === "review").length,
          done: teamTasks.filter((t) => t.status === "done").length,
        },
        loadLevel,
      };
    });
  },
});
