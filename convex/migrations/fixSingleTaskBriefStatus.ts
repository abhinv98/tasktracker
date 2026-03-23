import { internalMutation } from "../_generated/server";

/**
 * Fixes single-task briefs that were incorrectly set to "completed" by
 * the previous migration. A brief should only be "completed" if the task's
 * deliverable was formally approved. If there's no approved deliverable,
 * the brief status should reflect the task's intermediate status.
 */
export const run = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    let updated = 0;

    for (const brief of briefs) {
      if (brief.briefType !== "single_task") continue;
      if (brief.status !== "completed") continue;

      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();

      if (tasks.length !== 1) continue;
      const task = tasks[0];
      if (task.status !== "done") continue;

      const deliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();

      const hasApprovedDeliverable = deliverables.some(
        (d) => d.status === "approved"
      );

      if (!hasApprovedDeliverable) {
        await ctx.db.patch(brief._id, { status: "review" as any });
        updated++;
      }
    }

    return { updated };
  },
});
