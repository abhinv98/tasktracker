import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * BM/Super-Admin override: when a task is force-marked "done" by an
 * authorized manager, every non-rejected deliverable on that task and on
 * every descendant (via parentTaskId) is auto-approved end-to-end so it
 * stops haunting Team Lead / Brand Manager review queues.
 *
 * Rules:
 * - Only deliverables whose status is NOT "rejected" are touched.
 * - Sets `status: "approved"`, `teamLeadStatus: "approved"`,
 *   `passedToManagerAt`, `reviewedBy`, `teamLeadReviewedBy`, and an
 *   "Auto-approved via brand manager status override" review note (only
 *   when no review note already exists, so genuine human notes survive).
 * - Creative-slot tasks (N > 1) also get their unsubmitted slots filled in
 *   as approved deliverables credited to the assignee — see
 *   `fillCreativeSlotsForTask`.
 * - Recurses via `parentTaskId` exactly like cascadeDoneToChildren so the
 *   two helpers stay aligned.
 *
 * Returns the IDs of deliverables that were patched (idempotent on
 * already-approved deliverables: they are skipped).
 */
const OVERRIDE_NOTE = "Auto-approved via brand manager status override";
const FILLED_SLOT_MESSAGE = "Auto-completed via manager status override";

/**
 * How many creative slots a task carries. Server mirror of
 * `taskCreativesTarget` in src/lib/briefCreatives.ts: a per-task
 * `creativesRequired` wins, otherwise the brief supplies it (designing /
 * copywriting briefs, or single-task briefs that set a count).
 */
export function creativeSlotTarget(
  task: { creativesRequired?: number | null; handoffSourceTaskId?: unknown } | null,
  brief: { briefType?: string | null; creativesRequired?: number | null } | null
): number {
  if (task?.creativesRequired != null && task.creativesRequired >= 1) {
    return Math.min(99, Math.max(1, task.creativesRequired));
  }
  const bt = brief?.briefType;
  const usesSlots =
    bt === "designing" ||
    bt === "copywriting" ||
    (bt === "single_task" &&
      brief?.creativesRequired != null &&
      brief.creativesRequired >= 1);
  if (!usesSlots) return 1;
  return Math.min(99, Math.max(1, brief?.creativesRequired ?? 1));
}

/**
 * Fill the unsubmitted creative slots of a force-completed task with
 * already-approved placeholder deliverables credited to its assignee.
 *
 * Why: a task that needs 15 creatives but only ever had 1 submitted in-app
 * (the rest handed over off-tracker) stayed at "1 / 15 creatives submitted"
 * forever after a manager marked it done, and the assignee got credit for
 * one deliverable instead of fifteen. Marking done is the manager asserting
 * the work landed, so the remaining slots are closed out too.
 *
 * Only runs for tasks that actually use creative slots (target > 1) — an
 * ordinary one-deliverable task never gets a fabricated row. Handoff tasks
 * are skipped: they reference the original task's deliverables.
 */
export async function fillCreativeSlotsForTask(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  triggeredByUserId: Id<"users">
): Promise<Id<"deliverables">[]> {
  const task = await ctx.db.get(taskId);
  if (!task || task.handoffSourceTaskId) return [];

  const brief = await ctx.db.get(task.briefId);
  const target = creativeSlotTarget(task, brief);
  if (target <= 1) return [];

  const existing = await ctx.db
    .query("deliverables")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  const missing = target - existing.length;
  if (missing <= 0) return [];

  const now = Date.now();
  const created: Id<"deliverables">[] = [];
  for (let i = 0; i < missing; i++) {
    const id = await ctx.db.insert("deliverables", {
      taskId,
      submittedBy: task.assigneeId,
      message: FILLED_SLOT_MESSAGE,
      submittedAt: now,
      status: "approved",
      reviewedBy: triggeredByUserId,
      reviewedAt: now,
      reviewNote: OVERRIDE_NOTE,
      teamLeadStatus: "approved",
      teamLeadReviewedBy: triggeredByUserId,
      teamLeadReviewedAt: now,
      teamLeadReviewNote: OVERRIDE_NOTE,
      passedToManagerBy: triggeredByUserId,
      passedToManagerAt: now,
    });
    created.push(id);
  }
  return created;
}

export async function autoApproveDeliverablesForTaskTree(
  ctx: MutationCtx,
  rootTaskId: Id<"tasks">,
  triggeredByUserId: Id<"users">
): Promise<Id<"deliverables">[]> {
  const touched: Id<"deliverables">[] = [];
  const now = Date.now();

  async function walk(taskId: Id<"tasks">) {
    const dels = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();

    for (const d of dels) {
      if (d.status === "rejected") continue;
      if (
        d.status === "approved" &&
        d.teamLeadStatus === "approved" &&
        d.passedToManagerAt
      ) {
        continue; // already fully approved
      }

      const overrideNote = OVERRIDE_NOTE;

      await ctx.db.patch(d._id, {
        status: "approved",
        reviewedBy: d.reviewedBy ?? triggeredByUserId,
        reviewedAt: d.reviewedAt ?? now,
        reviewNote: d.reviewNote ?? overrideNote,
        teamLeadStatus: "approved",
        teamLeadReviewedBy: d.teamLeadReviewedBy ?? triggeredByUserId,
        teamLeadReviewedAt: d.teamLeadReviewedAt ?? now,
        teamLeadReviewNote: d.teamLeadReviewNote ?? overrideNote,
        passedToManagerBy: d.passedToManagerBy ?? triggeredByUserId,
        passedToManagerAt: d.passedToManagerAt ?? now,
        // Helper sub-task review: also bless if pending so the chain clears
        ...(d.mainAssigneeStatus === "pending"
          ? {
              mainAssigneeStatus: "approved" as const,
              mainAssigneeReviewedBy: triggeredByUserId,
              mainAssigneeReviewedAt: now,
              mainAssigneeReviewNote:
                d.mainAssigneeReviewNote ?? overrideNote,
            }
          : {}),
      });
      touched.push(d._id);
    }

    // Close out the creative slots nobody ever submitted against.
    touched.push(...(await fillCreativeSlotsForTask(ctx, taskId, triggeredByUserId)));

    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", taskId))
      .collect();
    for (const c of children) await walk(c._id);
  }

  await walk(rootTaskId);
  return touched;
}
