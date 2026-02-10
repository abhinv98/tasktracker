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

      // Overdue - notify the manager
      if (task.deadline < now) {
        const brief = await ctx.db.get(task.briefId);
        if (brief?.assignedManagerId) {
          const recentNotifs = await ctx.db
            .query("notifications")
            .withIndex("by_recipient", (q) =>
              q.eq("recipientId", brief.assignedManagerId!)
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
              recipientId: brief.assignedManagerId,
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

    // Check brief deadlines
    const briefs = await ctx.db.query("briefs").collect();
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    for (const brief of briefs) {
      if (
        !brief.deadline ||
        brief.status === "completed" ||
        brief.status === "archived"
      )
        continue;

      if (brief.deadline < now) {
        for (const admin of admins) {
          const recentNotifs = await ctx.db
            .query("notifications")
            .withIndex("by_recipient", (q) => q.eq("recipientId", admin._id))
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
              recipientId: admin._id,
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
