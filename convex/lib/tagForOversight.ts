import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

type OversightSource =
  | "individual_task"
  | "master_brief"
  | "content_calendar"
  | "sub_task"
  | "employee_task";

/**
 * Silent, super-admin-only task tag.
 *
 * Called from every task-creation path. Records one `taskOversight` row so
 * the oversight admins (Vivek & Mayur) get a simplified board of every task
 * (employee · brand · status · assigning manager) plus a once-a-day rolled-up
 * digest notification. Invisible to everyone else — no notification noise.
 *
 * Failures here must never block task creation, so the caller wraps this in a
 * try/catch is unnecessary: we swallow our own errors defensively instead.
 */
export async function tagForOversight(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    briefId: Id<"briefs">;
    assigneeId: Id<"users">;
    assignedBy: Id<"users">;
    source: OversightSource;
  }
): Promise<void> {
  try {
    const brief = await ctx.db.get(args.briefId);
    const brandId = brief?.brandId;
    await ctx.db.insert("taskOversight", {
      taskId: args.taskId,
      briefId: args.briefId,
      brandId: brandId ?? undefined,
      assigneeId: args.assigneeId,
      assignedBy: args.assignedBy,
      source: args.source,
      createdAt: Date.now(),
    });
  } catch {
    // Oversight tagging is best-effort; never break task creation.
  }
}
