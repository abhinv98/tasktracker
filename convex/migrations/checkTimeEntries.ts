import { internalQuery } from "../_generated/server";

export const run = internalQuery({
  handler: async (ctx) => {
    const entries = await ctx.db.query("timeEntries").collect();
    return {
      totalEntries: entries.length,
      sample: entries.slice(0, 5).map((e) => ({
        taskId: e.taskId,
        userId: e.userId,
        startedAt: e.startedAt,
        durationMinutes: e.durationMinutes,
        manual: e.manual,
      })),
    };
  },
});
