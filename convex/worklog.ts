import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const getEmployeeWorkLog = query({
  args: { date: v.string() }, // "YYYY-MM-DD"
  handler: async (ctx, { date }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const employees = allUsers.filter((u) => u.role === "employee");
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
            duration: task.duration ?? "—",
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

    const employees = allUsers.filter((u) => u.role === "employee");

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

export const getTeamMemberTasks = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) return null;
    const caller = await ctx.db.get(callerId);
    if (!caller || caller.role !== "admin") return null;

    const targetUser = await ctx.db.get(targetUserId);
    if (!targetUser) return null;

    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", targetUserId))
      .collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allUsers = await ctx.db.query("users").collect();
    const allBrands = await ctx.db.query("brands").collect();

    const activeBriefs = allBriefs.filter(
      (b) => !["archived", "completed"].includes(b.status)
    );
    const activeBriefIds = new Set(activeBriefs.map((b) => b._id));

    const activeTasks = allTasks.filter((t) => activeBriefIds.has(t.briefId));

    return {
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        designation: targetUser.designation,
        avatarUrl: targetUser.avatarUrl,
      },
      tasks: activeTasks.map((t) => {
        const brief = activeBriefs.find((b) => b._id === t.briefId);
        const brand = brief?.brandId ? allBrands.find((br) => br._id === brief.brandId) : null;
        const assignedByUser = allUsers.find((u) => u._id === t.assignedBy);
        return {
          _id: t._id,
          title: t.title,
          status: t.status,
          duration: t.duration,
          briefTitle: brief?.title ?? "Unknown",
          briefId: t.briefId,
          brandName: brand?.name ?? "—",
          assignedByName: assignedByUser?.name ?? assignedByUser?.email ?? "Unknown",
          deadline: t.deadline,
        };
      }),
    };
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

export const getEmployeeHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    if (allTasks.length === 0) return [];

    const briefIds = [...new Set(allTasks.map((t) => t.briefId))];
    const briefs = (await Promise.all(briefIds.map((id) => ctx.db.get(id)))).filter(Boolean);

    const brandIds = [...new Set(briefs.map((b) => b!.brandId).filter(Boolean))] as Id<"brands">[];
    const brands = (await Promise.all(brandIds.map((id) => ctx.db.get(id)))).filter(Boolean);

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_submittedBy", (q) => q.eq("submittedBy", userId))
      .collect();

    const deliverablesByTask = new Map<string, typeof deliverables>();
    for (const d of deliverables) {
      const key = d.taskId as string;
      if (!deliverablesByTask.has(key)) deliverablesByTask.set(key, []);
      deliverablesByTask.get(key)!.push(d);
    }

    const brandMap = new Map(brands.map((b) => [b!._id, b!]));
    const briefMap = new Map(briefs.map((b) => [b!._id, b!]));

    type BrandGroup = {
      brand: { _id: string; name: string; color: string };
      briefs: {
        _id: string;
        title: string;
        status: string;
        briefType?: string;
        tasks: {
          _id: string;
          title: string;
          status: string;
          duration: string;
          deliverables: {
            _id: string;
            message: string;
            status?: string;
            submittedAt: number;
            fileNames?: string[];
          }[];
        }[];
      }[];
    };

    const brandGroups = new Map<string, BrandGroup>();

    for (const task of allTasks) {
      const brief = briefMap.get(task.briefId);
      if (!brief) continue;

      const brandId = brief.brandId ? (brief.brandId as string) : "__no_brand__";
      const brand = brief.brandId ? brandMap.get(brief.brandId) : null;

      if (!brandGroups.has(brandId)) {
        brandGroups.set(brandId, {
          brand: {
            _id: brandId,
            name: brand?.name ?? "No Brand",
            color: brand?.color ?? "#6b7280",
          },
          briefs: [],
        });
      }

      const group = brandGroups.get(brandId)!;
      let briefEntry = group.briefs.find((b) => b._id === (brief._id as string));
      if (!briefEntry) {
        briefEntry = {
          _id: brief._id as string,
          title: brief.title,
          status: brief.status,
          briefType: (brief as any).briefType,
          tasks: [],
        };
        group.briefs.push(briefEntry);
      }

      const taskDeliverables = deliverablesByTask.get(task._id as string) ?? [];
      briefEntry.tasks.push({
        _id: task._id as string,
        title: task.title,
        status: task.status,
        duration: task.duration ?? "—",
        deliverables: taskDeliverables.map((d) => ({
          _id: d._id as string,
          message: d.message,
          status: d.status,
          submittedAt: d.submittedAt,
          fileNames: d.fileNames,
        })),
      });
    }

    return [...brandGroups.values()];
  },
});
