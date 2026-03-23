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
