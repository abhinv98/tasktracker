import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** Brief statuses that still have work in them (not completed or archived). */
export const OPEN_BRIEF_STATUSES = [
  "draft",
  "active",
  "in-progress",
  "review",
  "rejected",
  "on_hold",
  "sent_to_client",
] as const;

/**
 * Open briefs that pass `keep`, plus all of their tasks, through indexes.
 * Most briefs are completed, so manager panels that used to read the whole
 * briefs and tasks tables (~3,000 rows, about a second each run) read a
 * few hundred rows instead.
 */
export async function openBriefsAndTasks(
  ctx: QueryCtx,
  keep: (b: Doc<"briefs">) => boolean
): Promise<{ briefs: Doc<"briefs">[]; tasks: Doc<"tasks">[] }> {
  const briefs = (
    await Promise.all(
      OPEN_BRIEF_STATUSES.map((s) =>
        ctx.db
          .query("briefs")
          .withIndex("by_status", (q) => q.eq("status", s))
          .collect()
      )
    )
  )
    .flat()
    .filter(keep);
  const tasks = (
    await Promise.all(
      briefs.map((b) =>
        ctx.db
          .query("tasks")
          .withIndex("by_brief", (q) => q.eq("briefId", b._id))
          .collect()
      )
    )
  ).flat();
  return { briefs, tasks };
}
