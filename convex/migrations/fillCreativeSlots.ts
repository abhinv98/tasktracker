import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import {
  creativeSlotTarget,
  fillCreativeSlotsForTask,
} from "../lib/autoApproveDeliverables";

/**
 * Backfill for tasks force-completed BEFORE the slot-filling fix: a done
 * task needing N creatives that only ever had a few submitted in-app stayed
 * at "k / N creatives submitted" and under-credited its assignee.
 *
 * READ-ONLY scout: every done task whose creative slots are short.
 */
export const findUnfilledCreativeSlots = internalQuery({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const briefMap = new Map(briefs.map((b) => [b._id as string, b]));
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [u._id as string, u]));

    const rows = [];
    for (const t of tasks) {
      if (t.status !== "done") continue;
      if (t.handoffSourceTaskId) continue;
      const brief = briefMap.get(t.briefId as string) ?? null;
      const target = creativeSlotTarget(t, brief);
      if (target <= 1) continue;
      const dels = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      if (dels.length >= target) continue;
      rows.push({
        taskId: t._id,
        title: t.title,
        assignee: userMap.get(t.assigneeId as string)?.name ?? "Unknown",
        briefTitle: brief?.title ?? "-",
        submitted: dels.length,
        target,
        completedAt: t.completedAt ?? null,
      });
    }
    rows.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { count: rows.length, rows };
  },
});

/**
 * Fill those slots. Pass `taskId` to repair a single task; omit it to sweep
 * every done task. Idempotent — a task already at its target is skipped.
 */
export const fillCreativeSlots = internalMutation({
  args: { taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, { taskId }) => {
    const targets = taskId
      ? [await ctx.db.get(taskId)]
      : (await ctx.db.query("tasks").collect()).filter(
          (t) => t.status === "done"
        );

    const filled: { taskId: string; created: number }[] = [];
    for (const t of targets) {
      if (!t) continue;
      // Credit the manager who marked it done; fall back to the assignor.
      const created = await fillCreativeSlotsForTask(ctx, t._id, t.assignedBy);
      if (created.length > 0) {
        filled.push({ taskId: t._id as string, created: created.length });
      }
    }
    return { tasksFilled: filled.length, filled };
  },
});
