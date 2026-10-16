import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Calendar entries created from "Add to calendar" on an individual-task brief
 * stored the placeholder parent with assignedBy = brand manager, so the
 * calendar read the admin's placeholder as a second Copy task. Restore the
 * placeholder invariant (assignedBy === assigneeId, no handoff target).
 * Run with { dryRun: true } first.
 */
export const run = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const tasks = await ctx.db.query("tasks").collect();
    const fixed: string[] = [];
    for (const parent of tasks) {
      if (parent.parentTaskId || !parent.postDate) continue;
      if (!parent.assigneeId || parent.assigneeId === parent.assignedBy) continue;
      const children = tasks.filter((t) => t.parentTaskId === parent._id);
      if (children.length === 0) continue;
      // Only the createIndividualTaskBrief shape: children titled "[Team] <title>",
      // inserted in the same mutation as the parent.
      const sameMutation = children.every(
        (c) =>
          c.title.endsWith(`] ${parent.title}`) &&
          c.title.startsWith("[") &&
          Math.abs(c._creationTime - parent._creationTime) < 5_000 &&
          c.assignedBy === parent.assignedBy
      );
      if (!sameMutation) continue;
      fixed.push(`${parent._id} ${parent.title}`);
      if (!dryRun) {
        await ctx.db.patch(parent._id, {
          assignedBy: parent.assigneeId,
          handoffTargetTeamId: undefined,
        });
      }
    }
    return { count: fixed.length, fixed };
  },
});
