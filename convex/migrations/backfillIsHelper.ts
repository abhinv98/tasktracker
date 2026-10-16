import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Marks existing helper sub-tasks with isHelper: true. Helpers are the
 * children made by createSubTask: tagged "sub_task" in taskOversight, or
 * still carrying its "<parent> - Sub-task" title. Calendar Copy/Design and
 * handoff children share parentTaskId but are left alone.
 * Run with { dryRun: true } first.
 */
export const run = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const subTaskTags = await ctx.db.query("taskOversight").collect();
    const taggedSubTasks = new Set(
      subTaskTags.filter((o) => o.source === "sub_task").map((o) => o.taskId)
    );
    const tasks = await ctx.db.query("tasks").collect();
    const marked: string[] = [];
    for (const t of tasks) {
      if (!t.parentTaskId || t.isHelper) continue;
      if (!taggedSubTasks.has(t._id) && !t.title.endsWith(" - Sub-task")) continue;
      marked.push(`${t._id} ${t.title}`);
      if (!dryRun) await ctx.db.patch(t._id, { isHelper: true });
    }

    // Calendar/handoff children were routed through the helper gate by
    // mistake. Move their still-pending deliverables onto the team-lead gate.
    const helperIds = new Set(
      tasks
        .filter((t) => t.isHelper || marked.some((m) => m.startsWith(`${t._id} `)))
        .map((t) => t._id)
    );
    const childIds = new Set(tasks.filter((t) => t.parentTaskId).map((t) => t._id));
    const deliverables = await ctx.db.query("deliverables").collect();
    const rerouted: string[] = [];
    for (const d of deliverables) {
      if (!childIds.has(d.taskId) || helperIds.has(d.taskId)) continue;
      if (d.mainAssigneeStatus !== "pending" && d.mainAssigneeStatus !== "approved") continue;
      if (d.teamLeadStatus || d.status !== "pending") continue;
      rerouted.push(d._id);
      if (!dryRun) {
        await ctx.db.patch(d._id, {
          teamLeadStatus: "pending",
          mainAssigneeStatus: undefined,
          mainAssigneeReviewedBy: undefined,
          mainAssigneeReviewNote: undefined,
          mainAssigneeReviewedAt: undefined,
        });
      }
    }
    return { count: marked.length, marked, rerouted };
  },
});
