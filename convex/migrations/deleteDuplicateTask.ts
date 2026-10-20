import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { cascadeDeleteTask } from "../lib/cascadeDeleteTask";

/**
 * Remove a double-created task, keeping its twin. Refuses unless the two
 * rows are the same entry (brief, title, post date, top-level) and the copy
 * has no deliverables or children — so it can only ever delete a duplicate.
 */
export const run = internalMutation({
  args: { duplicateId: v.id("tasks"), keepId: v.id("tasks") },
  handler: async (ctx, { duplicateId, keepId }) => {
    const dup = await ctx.db.get(duplicateId);
    const keep = await ctx.db.get(keepId);
    if (!dup || !keep) throw new Error("Task not found");
    if (
      dup.briefId !== keep.briefId ||
      dup.title.trim() !== keep.title.trim() ||
      dup.postDate !== keep.postDate ||
      dup.parentTaskId !== keep.parentTaskId
    ) {
      throw new Error("These tasks are not duplicates of each other");
    }
    const delivs = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", duplicateId))
      .first();
    const child = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", duplicateId))
      .first();
    if (delivs || child) throw new Error("The copy has work attached; resolve it by hand");
    await cascadeDeleteTask(ctx, duplicateId);
    return { deleted: duplicateId, kept: keepId };
  },
});
