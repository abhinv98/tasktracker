import { internalMutation } from "../_generated/server";
import { reopenBriefForNewTask } from "../lib/syncBriefStatus";

/**
 * One-shot repair: completed briefs that received new tasks before task
 * inserts learned to reopen them (reopenBriefForNewTask). On 13 Nov 2026
 * this was one brief: "TOI Chennai - Flipped It — Content Calendar",
 * completed in July with seven entries added on 20 Oct.
 *
 * Run: npx convex run migrations/reopenCompletedBriefs:run '{"dryRun":false}'
 * Safe to re-run. NOT the reverse of fixCompletedBriefsWithOpenTasks, which
 * closes the open tasks instead.
 */
export const run = internalMutation({
  handler: async (ctx, { dryRun = true }: { dryRun?: boolean }) => {
    const stuck: string[] = [];
    const reopened: string[] = [];
    for (const brief of await ctx.db.query("briefs").collect()) {
      if (brief.status !== "completed") continue;
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      if (tasks.every((t) => t.status === "done")) continue;
      stuck.push(brief.title);
      if (dryRun) continue;
      await reopenBriefForNewTask(ctx, brief._id);
      // A single-task brief whose only open work is a helper or a paused
      // task stays completed by design, so report what actually moved.
      const after = await ctx.db.get(brief._id);
      if (after && after.status !== "completed") reopened.push(`${brief.title} -> ${after.status}`);
    }
    return { dryRun, stuck, reopened };
  },
});
