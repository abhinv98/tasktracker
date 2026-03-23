import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const deliverables = await ctx.db.query("deliverables").collect();

    let fixed = 0;
    const details: { briefId: string; title: string; oldStatus: string; reason: string }[] = [];

    for (const brief of briefs) {
      if (brief.status === "completed" || brief.status === "archived") continue;

      const briefTasks = tasks.filter((t) => t.briefId === brief._id);
      if (briefTasks.length === 0) continue;

      const allDone = briefTasks.every((t) => t.status === "done");
      if (!allDone) continue;

      // All tasks are done but brief is not completed — check if these were
      // admin-approved (no deliverables) or deliverable-approved
      const hasApprovedDeliverables = briefTasks.some((t) => {
        const taskDeliverables = deliverables.filter((d) => d.taskId === t._id);
        return taskDeliverables.some((d) => d.status === "approved");
      });

      // If there are approved deliverables, the approval flow should have
      // already handled this. If not, it was admin-done.
      // Either way, all tasks are done so the brief should be completed.
      await ctx.db.patch(brief._id, { status: "completed" as any });
      fixed++;
      details.push({
        briefId: brief._id,
        title: brief.title,
        oldStatus: brief.status,
        reason: hasApprovedDeliverables ? "deliverable_approved_but_brief_not_synced" : "admin_marked_done",
      });
    }

    return { fixed, details };
  },
});
