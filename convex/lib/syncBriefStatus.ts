import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * For single-task briefs, keeps the brief status in sync with its tasks.
 * No-op for other brief types. Callers patch the task first; the status is
 * derived from all main tasks (multi-team chains have several), never from
 * helper sub-tasks, so a helper finishing can't complete the brief.
 * Archived briefs (incl. brand on-hold) and manual on_hold are left alone.
 * The status argument is kept for call-site compatibility and ignored.
 */
export async function syncSingleTaskBriefStatus(
  ctx: MutationCtx,
  briefId: Id<"briefs">,
  _newTaskStatus?: string
) {
  const brief = await ctx.db.get(briefId);
  if (!brief || brief.briefType !== "single_task") return;
  if (brief.status === "archived" || brief.status === "on_hold") return;

  const tasks = (
    await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect()
  ).filter((t) => !t.isHelper);
  if (tasks.length === 0) return;

  const done = tasks.filter((t) => t.status === "done").length;
  // Paused tasks don't move the brief (matches the old status mapping).
  if (done < tasks.length && tasks.every((t) => t.status === "done" || t.status === "on-hold")) return;
  let next: string;
  if (done === tasks.length) next = "completed";
  else if (tasks.some((t) => t.status === "review")) next = "review";
  else if (done > 0 || tasks.some((t) => t.status === "in-progress")) next = "in-progress";
  else next = "active";

  if (brief.status !== next) {
    await ctx.db.patch(briefId, { status: next as any });
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
 * Status rules (no auto on_hold — that status is reserved for an explicit
 * manager decision; otherwise a single delayed entry inside a content
 * calendar would flag the whole brief and every assignee's dashboard would
 * pick up the on-hold pill):
 *   total === 0                                   -> no change
 *   done === total                                -> "completed"
 *   currently "on_hold" and not all done          -> leave it alone
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

  // Respect a manually-set "on_hold" brief status until everything is
  // actually finished. A manager flipping the brief on hold should not be
  // overridden just because a couple of entries are still in progress.
  if (brief.status === "on_hold" && done < total) return;

  let next: string;
  if (done === total) {
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

