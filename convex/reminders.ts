import { internalMutation } from "./_generated/server";

export const checkDeadlines = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;

    // Check task deadlines
    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      if (!task.deadline || task.status === "done") continue;

      // 24h reminder
      if (task.deadline > now && task.deadline <= in24h) {
        // Check if we already sent a reminder recently (within 12h)
        const recentNotifs = await ctx.db
          .query("notifications")
          .withIndex("by_recipient", (q) => q.eq("recipientId", task.assigneeId))
          .collect();
        const alreadySent = recentNotifs.some(
          (n) =>
            n.type === "deadline_reminder" &&
            n.taskId === task._id &&
            n.createdAt > now - 12 * 60 * 60 * 1000
        );
        if (!alreadySent) {
          await ctx.db.insert("notifications", {
            recipientId: task.assigneeId,
            type: "deadline_reminder",
            title: "Task deadline approaching",
            message: `"${task.title}" is due in less than 24 hours`,
            briefId: task.briefId,
            taskId: task._id,
            triggeredBy: task.assignedBy,
            read: false,
            createdAt: now,
          });
        }
      }

      // Overdue - notify the manager, assignor, and team lead
      if (task.deadline < now) {
        const brief = await ctx.db.get(task.briefId);
        const recipientIds = new Set<string>();

        if (brief?.assignedManagerId) recipientIds.add(brief.assignedManagerId);
        if (task.assignedBy) recipientIds.add(task.assignedBy);

        // For helper tasks, also notify team lead
        if (task.parentTaskId) {
          const assigneeTeams = await ctx.db
            .query("userTeams")
            .withIndex("by_user", (q) => q.eq("userId", task.assigneeId))
            .collect();
          for (const ut of assigneeTeams) {
            const team = await ctx.db.get(ut.teamId);
            if (team && "leadId" in team && team.leadId) {
              recipientIds.add(team.leadId as string);
            }
          }
        }

        // Also notify the assignee
        recipientIds.add(task.assigneeId);

        for (const recipientId of recipientIds) {
          const recentNotifs = await ctx.db
            .query("notifications")
            .withIndex("by_recipient", (q) =>
              q.eq("recipientId", recipientId as any)
            )
            .collect();
          const alreadySent = recentNotifs.some(
            (n) =>
              n.type === "deadline_reminder" &&
              n.taskId === task._id &&
              n.createdAt > now - 24 * 60 * 60 * 1000
          );
          if (!alreadySent) {
            await ctx.db.insert("notifications", {
              recipientId: recipientId as any,
              type: "deadline_reminder",
              title: "Task overdue",
              message: `"${task.title}" is past its deadline`,
              briefId: task.briefId,
              taskId: task._id,
              triggeredBy: task.assigneeId,
              read: false,
              createdAt: now,
            });
          }
        }
      }
    }

    // Check brief deadlines - notify brand managers + super admins only
    const briefs = await ctx.db.query("briefs").collect();
    const allUsers = await ctx.db.query("users").collect();
    const superAdmins = allUsers.filter((u) => u.isSuperAdmin === true);
    const allBrandManagers = await ctx.db.query("brandManagers").collect();

    for (const brief of briefs) {
      if (
        !brief.deadline ||
        brief.status === "completed" ||
        brief.status === "archived"
      )
        continue;

      if (brief.deadline < now) {
        // Find recipients: brand managers for this brief's brand + super admins
        const recipientIds = new Set<string>();
        for (const sa of superAdmins) recipientIds.add(sa._id);
        if (brief.brandId) {
          for (const bm of allBrandManagers) {
            if (bm.brandId === brief.brandId) recipientIds.add(bm.managerId);
          }
        }
        if (brief.assignedManagerId) recipientIds.add(brief.assignedManagerId);

        for (const recipientId of recipientIds) {
          const recentNotifs = await ctx.db
            .query("notifications")
            .withIndex("by_recipient", (q) => q.eq("recipientId", recipientId as any))
            .collect();
          const alreadySent = recentNotifs.some(
            (n) =>
              n.type === "deadline_reminder" &&
              n.briefId === brief._id &&
              !n.taskId &&
              n.createdAt > now - 24 * 60 * 60 * 1000
          );
          if (!alreadySent) {
            await ctx.db.insert("notifications", {
              recipientId: recipientId as any,
              type: "deadline_reminder",
              title: "Brief overdue",
              message: `Brief "${brief.title}" has passed its deadline`,
              briefId: brief._id,
              triggeredBy: brief.createdBy,
              read: false,
              createdAt: now,
            });
          }
        }
      }
    }
  },
});
