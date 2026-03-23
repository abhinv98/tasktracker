import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const deliverables = await ctx.db.query("deliverables").collect();

    let updated = 0;

    for (const task of tasks) {
      if (task.submittedForReviewAt) continue;
      if (task.status !== "review" && task.status !== "done") continue;

      const taskDeliverables = deliverables
        .filter((d) => d.taskId === task._id)
        .sort((a, b) => a.submittedAt - b.submittedAt);

      const firstDeliverable = taskDeliverables[0];
      if (firstDeliverable) {
        await ctx.db.patch(task._id, {
          submittedForReviewAt: firstDeliverable.submittedAt,
        });
        updated++;
      }
    }

    return { updated, total: tasks.length };
  },
});
