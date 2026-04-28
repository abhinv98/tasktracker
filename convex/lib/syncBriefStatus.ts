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

/**
 * Recompute multi-task brief status from current task counts. Handles BOTH
 * directions: forward (some -> all done -> completed) and reverse (was
 * completed but a task was reopened -> in-progress).
 *
 * - Single-task briefs are skipped (handled by syncSingleTaskBriefStatus).
 * - Archived briefs are never auto-changed.
 * - Briefs with zero tasks are left alone (caller decides).
 *
 * Status rules:
 *   total === 0                                   -> no change
 *   anyOnHold && !allDone                         -> "on_hold"
 *   done === total                                -> "completed"
 *   anyReview && done < total                     -> "review"
 *   anyInProgress || (done > 0 && done < total)   -> "in-progress"
 *   else                                          -> "active"
 */
export async function syncBriefStatusFromTasks(
  ctx: MutationCtx,
  briefId: Id<"briefs">
) {
  const brief = await ctx.db.get(briefId);
  if (!brief) return;
  if (brief.status === "archived") return;
  if (brief.briefType === "single_task") return;

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_brief", (q) => q.eq("briefId", briefId))
    .collect();

  if (tasks.length === 0) return;

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const review = tasks.filter((t) => t.status === "review").length;
  const onHold = tasks.filter((t) => t.status === "on-hold").length;

  let next: string;
  if (onHold > 0 && done < total) {
    next = "on_hold";
  } else if (done === total) {
    next = "completed";
  } else if (review > 0) {
    next = "review";
  } else if (inProgress > 0 || done > 0) {
    next = "in-progress";
  } else {
    next = "active";
  }

  if (brief.status !== next) {
    await ctx.db.patch(briefId, { status: next as any });
  }
}

