import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Close any running timers on a task. Called wherever a task becomes done
 *  so time stops accruing on finished work. */
export async function stopTaskTimers(ctx: MutationCtx, taskId: Id<"tasks">) {
  const open = (
    await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect()
  ).filter((e) => !e.stoppedAt);
  const now = Date.now();
  for (const e of open) {
    await ctx.db.patch(e._id, {
      stoppedAt: now,
      durationMinutes: Math.round((now - e.startedAt) / 60000),
    });
  }
}
