import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const run = internalMutation({
  args: {
    fromUserId: v.string(),
    toUserId: v.string(),
  },
  handler: async (ctx, { fromUserId, toUserId }) => {
    const fromId = fromUserId as any;
    const toId = toUserId as any;

    const fromUser = await ctx.db.get(fromId);
    const toUser = await ctx.db.get(toId);
    if (!fromUser) throw new Error("Source user not found");
    if (!toUser) throw new Error("Target user not found");

    const stats: Record<string, number> = {};

    if ((fromUser as any).designation && !(toUser as any).designation) {
      await ctx.db.patch(toId, { designation: (fromUser as any).designation });
      stats.designation_copied = 1;
    }

    const tasks = await ctx.db.query("tasks").collect();
    let tasksMoved = 0;
    for (const task of tasks) {
      const updates: Record<string, any> = {};
      if (task.assigneeId === fromId) updates.assigneeId = toId;
      if (task.assignedBy === fromId) updates.assignedBy = toId;
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(task._id, updates);
        tasksMoved++;
      }
    }
    stats.tasks = tasksMoved;

    const deliverables = await ctx.db.query("deliverables").collect();
    let delsMoved = 0;
    for (const d of deliverables) {
      const updates: Record<string, any> = {};
      if (d.submittedBy === fromId) updates.submittedBy = toId;
      if ((d as any).reviewedBy === fromId) updates.reviewedBy = toId;
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(d._id, updates);
        delsMoved++;
      }
    }
    stats.deliverables = delsMoved;

    const userTeams = await ctx.db.query("userTeams").collect();
    let teamsMoved = 0;
    for (const ut of userTeams) {
      if (ut.userId === fromId) {
        const existing = userTeams.find(
          (x) => x.userId === toId && x.teamId === ut.teamId
        );
        if (existing) {
          await ctx.db.delete(ut._id);
        } else {
          await ctx.db.patch(ut._id, { userId: toId });
        }
        teamsMoved++;
      }
    }
    stats.userTeams = teamsMoved;

    const notifications = await ctx.db.query("notifications").collect();
    let notifsMoved = 0;
    for (const n of notifications) {
      const updates: Record<string, any> = {};
      if (n.recipientId === fromId) updates.recipientId = toId;
      if (n.triggeredBy === fromId) updates.triggeredBy = toId;
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(n._id, updates);
        notifsMoved++;
      }
    }
    stats.notifications = notifsMoved;

    const activityLogs = await ctx.db.query("activityLog").collect();
    let logsMoved = 0;
    for (const log of activityLogs) {
      if (log.userId === fromId) {
        await ctx.db.patch(log._id, { userId: toId });
        logsMoved++;
      }
    }
    stats.activityLogs = logsMoved;

    const timeEntries = await ctx.db.query("timeEntries").collect();
    let timeEntriesMoved = 0;
    for (const te of timeEntries) {
      if (te.userId === fromId) {
        await ctx.db.patch(te._id, { userId: toId });
        timeEntriesMoved++;
      }
    }
    stats.timeEntries = timeEntriesMoved;

    const dailySummaries = await ctx.db.query("taskDailySummaries").collect();
    let summariesMoved = 0;
    for (const ds of dailySummaries) {
      if (ds.userId === fromId) {
        await ctx.db.patch(ds._id, { userId: toId } as any);
        summariesMoved++;
      }
    }
    stats.taskDailySummaries = summariesMoved;

    const comments = await ctx.db.query("comments").collect();
    let commentsMoved = 0;
    for (const c of comments) {
      if (c.userId === fromId) {
        await ctx.db.patch(c._id, { userId: toId });
        commentsMoved++;
      }
    }
    stats.comments = commentsMoved;

    const brandManagers = await ctx.db.query("brandManagers").collect();
    let bmMoved = 0;
    for (const bm of brandManagers) {
      if (bm.managerId === fromId) {
        const existing = brandManagers.find(
          (x) => x.managerId === toId && x.brandId === bm.brandId
        );
        if (existing) {
          await ctx.db.delete(bm._id);
        } else {
          await ctx.db.patch(bm._id, { managerId: toId });
        }
        bmMoved++;
      }
    }
    stats.brandManagers = bmMoved;

    const briefs = await ctx.db.query("briefs").collect();
    let briefsMoved = 0;
    for (const b of briefs) {
      const updates: Record<string, any> = {};
      if ((b as any).assignedManagerId === fromId) updates.assignedManagerId = toId;
      if ((b as any).createdBy === fromId) updates.createdBy = toId;
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(b._id, updates);
        briefsMoved++;
      }
    }
    stats.briefs = briefsMoved;

    const authAccounts = await ctx.db.query("authAccounts").collect();
    for (const acc of authAccounts) {
      if (acc.userId === fromId) {
        await ctx.db.delete(acc._id);
        stats.authAccountsDeleted = (stats.authAccountsDeleted ?? 0) + 1;
      }
    }

    const authSessions = await ctx.db.query("authSessions").collect();
    for (const sess of authSessions) {
      if (sess.userId === fromId) {
        await ctx.db.delete(sess._id);
        stats.authSessionsDeleted = (stats.authSessionsDeleted ?? 0) + 1;
      }
    }

    await ctx.db.delete(fromId);
    stats.userDeleted = 1;

    return {
      from: { id: fromUserId, name: (fromUser as any).name, email: (fromUser as any).email },
      to: { id: toUserId, name: (toUser as any).name, email: (toUser as any).email },
      stats,
    };
  },
});
