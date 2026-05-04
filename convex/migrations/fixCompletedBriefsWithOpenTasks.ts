import { internalMutation } from "../_generated/server";
import { cascadeDoneToChildren } from "../lib/cascadeTaskStatus";

/**
 * One-shot repair for briefs that were manually flipped to "completed"
 * before updateBrief learned to cascade task status. Symptom: brief shows
 * Completed in the list view but Brief Details + employee Dashboard still
 * render the underlying task as review/in-progress, and Work Log hides it
 * because Work Log filters tasks whose brief is completed.
 *
 * Forward fix lives in convex/briefs.ts updateBrief; this migration cleans
 * up the historical inconsistency so existing screens line up immediately.
 */
export const run = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();

    let briefsScanned = 0;
    let tasksFixed = 0;
    const details: {
      briefId: string;
      title: string;
      taskId: string;
      taskTitle: string;
      oldStatus: string;
    }[] = [];

    for (const brief of briefs) {
      if (brief.status !== "completed") continue;
      briefsScanned++;

      const tasksInBrief = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();

      const now = Date.now();
      for (const t of tasksInBrief) {
        if (t.status !== "done") {
          await ctx.db.patch(t._id, {
            status: "done",
            completedAt: t.completedAt ?? now,
          });
          tasksFixed++;
          details.push({
            briefId: brief._id,
            title: brief.title,
            taskId: t._id,
            taskTitle: t.title,
            oldStatus: t.status,
          });
          await ctx.db.insert("activityLog", {
            briefId: t.briefId,
            taskId: t._id,
            userId: t.assigneeId,
            action: "auto_completed_via_brief",
            details: JSON.stringify({ reason: "migration_completed_brief_repair" }),
            timestamp: now,
          });
        }
        await cascadeDoneToChildren(ctx, t._id, null, "migration_completed_brief_repair");
      }
    }

    return { briefsScanned, tasksFixed, details };
  },
});
