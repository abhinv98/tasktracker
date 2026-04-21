import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { cascadeDoneToChildren } from "./lib/cascadeTaskStatus";
import {
  syncMultiTaskBriefStatus,
  syncSingleTaskBriefStatus,
} from "./lib/syncBriefStatus";

/**
 * One-shot backfill: for every parent task already at status="done",
 * cascade that "done" status down to all descendant child tasks that
 * haven't been flipped yet. Then re-sync the owning brief status so
 * that briefs whose every task is now "done" get moved to "completed".
 *
 * WHY THIS EXISTS:
 * The Content Calendar "Publish" action historically only flipped the
 * parent calendar-entry task to "done". Its [Copy] and [Design] children
 * stayed at their previous status (usually "review" or "in-progress").
 * That is why Elma Zarin Khan's dashboard shows "2/11 tasks done" for
 * TOI Kolkata even though every entry visually says Published — her
 * child tasks were never marked done.
 *
 * HOW TO RUN:
 *   Convex dashboard → Functions → migrations:backfillParentDoneCascade
 *   Args: { dryRun: true } (preview first), then { dryRun: false } to apply.
 *
 *   Optional: pass { brandId: "<brand_id>" } to restrict scope to one brand,
 *   or { briefId: "<brief_id>" } for a single brief (useful for testing).
 *
 * IDEMPOTENCY:
 * Safe to run multiple times. Tasks already at "done" are skipped.
 * Briefs already at "completed" / "archived" are left alone.
 *
 * WHAT IT DOES NOT DO:
 * - Does NOT auto-approve pending deliverables on cascaded children.
 *   If a Copy deliverable was sitting at teamLeadStatus="pending" when
 *   the parent was published, the task moves to "done" but the deliverable
 *   review stack is untouched. Surface those separately if needed.
 * - Does NOT cascade upward (child done → parent done). Only downward.
 */
export const backfillParentDoneCascade = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    brandId: v.optional(v.id("brands")),
    briefId: v.optional(v.id("briefs")),
  },
  handler: async (ctx, { dryRun = true, brandId, briefId }) => {
    // ── Load scope ───────────────────────────────────────────────
    let briefs;
    if (briefId) {
      const b = await ctx.db.get(briefId);
      briefs = b ? [b] : [];
    } else if (brandId) {
      briefs = await ctx.db
        .query("briefs")
        .filter((q) => q.eq(q.field("brandId"), brandId))
        .collect();
    } else {
      briefs = await ctx.db.query("briefs").collect();
    }

    // Tracking
    let totalDoneParentsScanned = 0;
    let totalChildrenCascaded = 0;
    let totalBriefsResynced = 0;
    const affectedBriefIds = new Set<Id<"briefs">>();
    const details: Array<{
      briefId: Id<"briefs">;
      briefTitle: string;
      currentBriefStatus: string;
      parentsWithStuckChildren: Array<{
        parentId: Id<"tasks">;
        parentTitle: string;
        stuckChildren: Array<{
          _id: Id<"tasks">;
          title: string;
          previousStatus: string;
        }>;
      }>;
      briefWouldResyncTo: string | null;
    }> = [];

    // ── For each brief, find done parents with stuck descendants ─
    for (const brief of briefs) {
      if (brief.status === "archived") continue;

      const allTasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();

      // Build parent->children map (one hop, recursion handles deeper)
      const childrenByParent = new Map<Id<"tasks">, typeof allTasks>();
      for (const t of allTasks) {
        if (t.parentTaskId) {
          const list = childrenByParent.get(t.parentTaskId) ?? [];
          list.push(t);
          childrenByParent.set(t.parentTaskId, list);
        }
      }

      // Any parent task (has children) currently "done" with a non-done child
      const doneParentsWithStuckChildren = allTasks.filter((p) => {
        if (p.status !== "done") return false;
        const kids = childrenByParent.get(p._id);
        if (!kids || kids.length === 0) return false;
        return kids.some((c) => c.status !== "done");
      });

      if (doneParentsWithStuckChildren.length === 0 && brief.status !== "completed") {
        // Nothing to cascade. Still check if brief itself needs resync
        // (e.g. all tasks are done but brief still at "in-progress").
        const everyTaskDone =
          allTasks.length > 0 && allTasks.every((t) => t.status === "done");
        if (everyTaskDone && brief.status !== "completed") {
          if (!dryRun) {
            if (brief.briefType === "single_task" && allTasks[0]) {
              await syncSingleTaskBriefStatus(ctx, brief._id, "done");
            } else {
              await syncMultiTaskBriefStatus(ctx, brief._id, allTasks[0]._id);
            }
            totalBriefsResynced += 1;
          }
          affectedBriefIds.add(brief._id);
          details.push({
            briefId: brief._id,
            briefTitle: brief.title,
            currentBriefStatus: brief.status,
            parentsWithStuckChildren: [],
            briefWouldResyncTo: "completed",
          });
        }
        continue;
      }

      // Record per-brief detail for the preview/report
      const perBriefParents = doneParentsWithStuckChildren.map((p) => ({
        parentId: p._id,
        parentTitle: p.title,
        stuckChildren: (childrenByParent.get(p._id) ?? [])
          .filter((c) => c.status !== "done")
          .map((c) => ({
            _id: c._id,
            title: c.title,
            previousStatus: c.status,
          })),
      }));

      totalDoneParentsScanned += doneParentsWithStuckChildren.length;

      if (!dryRun) {
        for (const parent of doneParentsWithStuckChildren) {
          // Null triggeredByUserId signals "migration" to the helper —
          // it will skip notifications and log with the task's own assignee.
          const cascaded = await cascadeDoneToChildren(
            ctx,
            parent._id,
            null,
            "backfill_migration"
          );
          totalChildrenCascaded += cascaded.length;
        }
      } else {
        // For preview, count what WOULD be cascaded (recursively).
        const countDescendantNotDone = (parentId: Id<"tasks">): number => {
          const kids = childrenByParent.get(parentId) ?? [];
          let n = 0;
          for (const k of kids) {
            if (k.status !== "done") n += 1;
            n += countDescendantNotDone(k._id);
          }
          return n;
        };
        for (const parent of doneParentsWithStuckChildren) {
          totalChildrenCascaded += countDescendantNotDone(parent._id);
        }
      }

      affectedBriefIds.add(brief._id);

      // After cascading, figure out what the brief status SHOULD be.
      let briefWouldResyncTo: string | null = null;
      if (brief.status !== "completed") {
        // After cascade, if every task is done, brief should be completed.
        // In dryRun we project; in real run we re-query.
        if (!dryRun) {
          const refreshed = await ctx.db
            .query("tasks")
            .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
            .collect();
          const nowAllDone =
            refreshed.length > 0 && refreshed.every((t) => t.status === "done");
          if (nowAllDone) {
            if (brief.briefType === "single_task") {
              await syncSingleTaskBriefStatus(ctx, brief._id, "done");
            } else {
              await syncMultiTaskBriefStatus(ctx, brief._id, refreshed[0]._id);
            }
            briefWouldResyncTo = "completed";
            totalBriefsResynced += 1;
          }
        } else {
          // Project: after cascade, every task (non-done ones that are descendants
          // of a done parent) would be done.
          const stillNotDoneAfterHypotheticalCascade = allTasks.filter((t) => {
            if (t.status === "done") return false;
            // Walk up parent chain: if any ancestor is already done, this child
            // would be cascaded to done.
            let cursor: Id<"tasks"> | undefined = t.parentTaskId;
            while (cursor) {
              const ancestor = allTasks.find((x) => x._id === cursor);
              if (!ancestor) break;
              if (ancestor.status === "done") return false; // would be cascaded
              cursor = ancestor.parentTaskId;
            }
            return true;
          });
          if (
            allTasks.length > 0 &&
            stillNotDoneAfterHypotheticalCascade.length === 0
          ) {
            briefWouldResyncTo = "completed";
          }
        }
      }

      details.push({
        briefId: brief._id,
        briefTitle: brief.title,
        currentBriefStatus: brief.status,
        parentsWithStuckChildren: perBriefParents,
        briefWouldResyncTo,
      });
    }

    return {
      mode: dryRun ? "DRY_RUN" : "APPLIED",
      ranAt: new Date().toISOString(),
      scope: briefId
        ? { type: "single_brief", briefId }
        : brandId
          ? { type: "single_brand", brandId }
          : { type: "all_briefs" },
      summary: {
        briefsScanned: briefs.length,
        briefsAffected: affectedBriefIds.size,
        doneParentsWithStuckChildren: totalDoneParentsScanned,
        childrenCascadedToDone: totalChildrenCascaded,
        briefsResyncedToCompleted: totalBriefsResynced,
      },
      details,
      nextStep: dryRun
        ? "Review `details` above. When satisfied, re-run with { dryRun: false } to apply."
        : "Done. Re-run with { dryRun: true } if you want to verify idempotency.",
    };
  },
});
