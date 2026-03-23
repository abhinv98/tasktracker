import { internalMutation } from "../_generated/server";

const TASK_TO_BRIEF_STATUS: Record<string, string> = {
  "pending": "active",
  "in-progress": "in-progress",
  "review": "review",
  "done": "completed",
};

export const run = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    let updated = 0;

    for (const brief of briefs) {
      if (brief.briefType !== "single_task") continue;

      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();

      if (tasks.length !== 1) continue;

      const task = tasks[0];
      const expectedBriefStatus = TASK_TO_BRIEF_STATUS[task.status];

      if (expectedBriefStatus && brief.status !== expectedBriefStatus) {
        await ctx.db.patch(brief._id, { status: expectedBriefStatus as any });
        updated++;
      }
    }

    return { updated };
  },
});
