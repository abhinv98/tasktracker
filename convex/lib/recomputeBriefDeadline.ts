import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Recomputes a brief's "ultimate" deadline from its tasks.
 *
 * Rules:
 *  - content_calendar briefs are evergreen — never carry a top-level deadline.
 *  - If only one task in the brief has a deadline → mirror it.
 *  - If multiple tasks have deadlines → use the latest one ("last node in
 *    sequence" — work on the brief isn't done until that final date passes).
 *  - If no task has a deadline → clear brief.deadline.
 *  - A deadline set by hand on the brief (deadlineIsManual) wins outright and
 *    is never recomputed from tasks.
 *
 * Called after task create / update (deadline change) / delete so the
 * brief-level deadline shown across dashboards, listings, and reports stays
 * in sync without depending on read-time overrides.
 */
export async function recomputeBriefDeadline(
  ctx: MutationCtx,
  briefId: Id<"briefs">
): Promise<void> {
  const brief = await ctx.db.get(briefId);
  if (!brief) return;
  if (brief.briefType === "content_calendar") return;
  if (brief.deadlineIsManual === true) return;

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_brief", (q) => q.eq("briefId", briefId))
    .collect();

  // Top-level workflow nodes only — sub-tasks (helpers spawned by team leads)
  // are not "nodes in sequence" from the brief owner's perspective.
  const topLevel = tasks.filter((t) => t.parentTaskId === undefined);
  const deadlines = topLevel
    .map((t) => t.deadline)
    .filter((d): d is number => d !== undefined);

  const newDeadline = deadlines.length > 0 ? Math.max(...deadlines) : undefined;

  if (newDeadline !== brief.deadline) {
    await ctx.db.patch(briefId, { deadline: newDeadline });
  }
}
