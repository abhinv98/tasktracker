import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Cascades status="done" from a parent task to all descendant child tasks
 * linked via `parentTaskId`. Idempotent: already-done children are skipped
 * but still recursed through (so grandchildren get fixed if a middle-layer
 * child is already done but its own children are stuck).
 *
 * - Only cascades DOWNWARD (parent -> children). Never upward.
 * - Does NOT auto-approve pending deliverables on cascaded children.
 *   The task status moves to "done" but the deliverables table is untouched.
 * - Sets `completedAt` on each cascaded child.
 * - Inserts a notification for each child's assignee (unless the triggerer
 *   is the same person, or triggeredByUserId is null for migration runs).
 * - Inserts an activityLog entry with action="auto_completed_via_parent".
 *
 * Returns the IDs of child tasks whose status was flipped to "done".
 */
export async function cascadeDoneToChildren(
  ctx: MutationCtx,
  parentTaskId: Id<"tasks">,
  triggeredByUserId: Id<"users"> | null,
  reason: string = "parent_marked_done"
): Promise<Id<"tasks">[]> {
  const children = await ctx.db
    .query("tasks")
    .withIndex("by_parent", (q) => q.eq("parentTaskId", parentTaskId))
    .collect();

  const cascaded: Id<"tasks">[] = [];
  const now = Date.now();

  for (const child of children) {
    if (child.status !== "done") {
      await ctx.db.patch(child._id, {
        status: "done",
        completedAt: now,
      });
      cascaded.push(child._id);

      if (triggeredByUserId && child.assigneeId !== triggeredByUserId) {
        await ctx.db.insert("notifications", {
          recipientId: child.assigneeId,
          type: "task_status_changed",
          title: "Task auto-completed",
          message: `"${child.title}" was marked done because its parent entry was completed.`,
          briefId: child.briefId,
          taskId: child._id,
          triggeredBy: triggeredByUserId,
          read: false,
          createdAt: now,
        });
      }

      await ctx.db.insert("activityLog", {
        briefId: child.briefId,
        taskId: child._id,
        // Fall back to the task's own assignee if no trigger user (migration case)
        userId: triggeredByUserId ?? child.assigneeId,
        action: "auto_completed_via_parent",
        details: JSON.stringify({ parentTaskId, reason }),
        timestamp: now,
      });
    }

    // Recurse either way: an already-done middle layer can still have stuck grandchildren
    const grandchildren = await cascadeDoneToChildren(
      ctx,
      child._id,
      triggeredByUserId,
      reason
    );
    cascaded.push(...grandchildren);
  }

  return cascaded;
}
