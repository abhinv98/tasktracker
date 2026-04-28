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
 * - Recurses via `parentTaskId` exactly like cascadeDoneToChildren so the
 *   two helpers stay aligned.
 *
 * Returns the IDs of deliverables that were patched (idempotent on
 * already-approved deliverables: they are skipped).
 */
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

      const overrideNote =
        "Auto-approved via brand manager status override";

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

    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", taskId))
      .collect();
    for (const c of children) await walk(c._id);
  }

  await walk(rootTaskId);
  return touched;
}
