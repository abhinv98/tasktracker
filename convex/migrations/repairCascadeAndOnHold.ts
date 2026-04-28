import { internalMutation, internalQuery } from "../_generated/server";
import { syncBriefStatusFromTasks } from "../lib/syncBriefStatus";
import { cascadeDoneToChildren } from "../lib/cascadeTaskStatus";
import { autoApproveDeliverablesForTaskTree } from "../lib/autoApproveDeliverables";

/**
 * READ-ONLY: surface every brief currently in "on_hold" and every task
 * whose parent is "done" but who is itself stuck in non-done status.
 * Use this before running the destructive cousin to confirm scope.
 */
export const findCascadeAndOnHoldDamage = internalQuery({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    const tasks = await ctx.db.query("tasks").collect();

    const onHoldBriefs = briefs
      .filter((b) => b.status === "on_hold" && b.briefType !== "single_task")
      .map((b) => {
        const briefTasks = tasks.filter((t) => t.briefId === b._id);
        return {
          briefId: b._id,
          title: b.title,
          briefType: b.briefType,
          totalTasks: briefTasks.length,
          done: briefTasks.filter((t) => t.status === "done").length,
          onHold: briefTasks.filter((t) => t.status === "on-hold").length,
        };
      });

    const taskById = new Map(tasks.map((t) => [t._id as string, t]));
    const stuckChildren = tasks
      .filter((t) => {
        if (!t.parentTaskId) return false;
        if (t.status === "done") return false;
        const parent = taskById.get(t.parentTaskId as string);
        return parent?.status === "done";
      })
      .map((t) => ({
        taskId: t._id,
        title: t.title,
        status: t.status,
        parentTaskId: t.parentTaskId,
        assigneeId: t.assigneeId,
      }));

    return {
      onHoldBriefCount: onHoldBriefs.length,
      onHoldBriefs,
      stuckChildCount: stuckChildren.length,
      stuckChildren,
    };
  },
});

/**
 * Repair pass:
 *  1. For every multi-task brief stuck in "on_hold", recompute status from
 *     task counts. Briefs whose tasks are all genuinely on-hold stay put;
 *     those auto-flipped by the old helper bug snap back to the right
 *     state (in-progress / review / completed / active).
 *  2. For every child task whose parent is "done" but is itself not done,
 *     run cascadeDoneToChildren + autoApproveDeliverablesForTaskTree on
 *     the parent so the descendants and their deliverables catch up.
 *
 * Idempotent: safe to re-run.
 */
export const repairCascadeAndOnHold = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    const tasks = await ctx.db.query("tasks").collect();

    // Step 1: re-sync on_hold briefs that are not actually all-on-hold.
    const onHoldFixed: string[] = [];
    for (const b of briefs) {
      if (b.briefType === "single_task") continue;
      if (b.status !== "on_hold") continue;

      const briefTasks = tasks.filter((t) => t.briefId === b._id);
      if (briefTasks.length === 0) continue;

      // If all non-done tasks are actually on-hold, this was likely a
      // legitimate manual pause. Skip those to avoid clobbering.
      const allNonDoneAreOnHold = briefTasks
        .filter((t) => t.status !== "done")
        .every((t) => t.status === "on-hold");
      if (allNonDoneAreOnHold) continue;

      // Force out of on_hold first so the (post-fix) helper doesn't bail
      // early on its own "respect manual on_hold" guard.
      await ctx.db.patch(b._id, { status: "in-progress" as any });
      await syncBriefStatusFromTasks(ctx, b._id);
      onHoldFixed.push(b._id as string);
    }

    // Step 2: cascade done from parents to stuck children.
    const taskById = new Map(tasks.map((t) => [t._id as string, t]));
    const parentsToRecascade = new Set<string>();
    for (const t of tasks) {
      if (!t.parentTaskId) continue;
      if (t.status === "done") continue;
      const parent = taskById.get(t.parentTaskId as string);
      if (parent?.status === "done") {
        parentsToRecascade.add(parent._id as string);
      }
    }

    const cascadedFrom: string[] = [];
    for (const parentId of parentsToRecascade) {
      // triggeredByUserId is null for migration runs (cascade helper handles this).
      await cascadeDoneToChildren(ctx, parentId as any, null);
      // Also auto-approve any pending deliverables on those just-cascaded children.
      const parent = await ctx.db.get(parentId as any);
      if (parent && (parent as any).assignedBy) {
        await autoApproveDeliverablesForTaskTree(
          ctx,
          parentId as any,
          (parent as any).assignedBy
        );
      }
      cascadedFrom.push(parentId);
      // Keep brief status fresh once children flipped.
      if (parent) {
        await syncBriefStatusFromTasks(ctx, (parent as any).briefId);
      }
    }

    return {
      briefsRescuedFromOnHold: onHoldFixed,
      parentsCascaded: cascadedFrom,
    };
  },
});
