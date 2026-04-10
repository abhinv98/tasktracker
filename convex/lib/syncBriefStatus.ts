import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

const TASK_TO_BRIEF_STATUS: Record<string, string> = {
  "pending": "active",
  "in-progress": "in-progress",
  "review": "review",
  "done": "completed",
};

/**
 * For single-task briefs, keeps the parent brief status in sync with
 * the task status. No-op for non-single-task briefs.
 */
export async function syncSingleTaskBriefStatus(
  ctx: MutationCtx,
  briefId: Id<"briefs">,
  newTaskStatus: string
) {
  const brief = await ctx.db.get(briefId);
  if (!brief || brief.briefType !== "single_task") return;

  const mappedStatus = TASK_TO_BRIEF_STATUS[newTaskStatus];
  if (mappedStatus && brief.status !== mappedStatus) {
    await ctx.db.patch(briefId, { status: mappedStatus as any });
  }
}

/**
 * For multi-task (master) briefs: checks if ALL tasks in the brief are
 * now "done". If so, marks the brief as "completed".
 * Called after approval flow marks a task as done.
 */
export async function syncMultiTaskBriefStatus(
  ctx: MutationCtx,
  briefId: Id<"briefs">,
  justCompletedTaskId: Id<"tasks">
) {
  const brief = await ctx.db.get(briefId);
  if (!brief) return;
  if (brief.status === "completed" || brief.status === "archived") return;
  // Single-task briefs are handled by syncSingleTaskBriefStatus
  if (brief.briefType === "single_task") return;

  const allTasks = await ctx.db
    .query("tasks")
    .withIndex("by_brief", (q) => q.eq("briefId", briefId))
    .collect();

  if (allTasks.length === 0) return;

  const allDone = allTasks.every((t) => t.status === "done");
  if (allDone) {
    await ctx.db.patch(briefId, { status: "completed" as any });
  }
}
