import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Recursively delete a task and EVERY artefact attached to it: child tasks
 * (via parentTaskId), deliverables, attachments, time entries, daily
 * summaries, comments, and read receipts. Used by deleteTask, deleteSheet,
 * and any flow that needs to ensure no orphan rows remain.
 *
 * Returns the ids that were deleted (useful for logging / migrations).
 */
export async function cascadeDeleteTask(
  ctx: MutationCtx,
  taskId: Id<"tasks">
): Promise<{ tasks: Id<"tasks">[]; deliverables: Id<"deliverables">[] }> {
  const deletedTasks: Id<"tasks">[] = [];
  const deletedDeliverables: Id<"deliverables">[] = [];

  async function walk(id: Id<"tasks">) {
    // Recurse first so we never strand a child with a missing parent
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", id))
      .collect();
    for (const c of children) await walk(c._id);

    // Deliverables on this task
    const dels = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .collect();
    for (const d of dels) {
      // jsrRemarks reference deliverables; clean them up
      const remarks = await ctx.db
        .query("jsrRemarks")
        .withIndex("by_deliverable", (q) => q.eq("deliverableId", d._id))
        .collect();
      for (const r of remarks) await ctx.db.delete(r._id);

      // Handoffs that source from this deliverable
      const handoffs = await ctx.db
        .query("deliverableHandoffs")
        .withIndex("by_source_deliverable", (q) =>
          q.eq("sourceDeliverableId", d._id)
        )
        .collect();
      for (const h of handoffs) await ctx.db.delete(h._id);

      await ctx.db.delete(d._id);
      deletedDeliverables.push(d._id);
    }

    // Handoffs that source from this task (separate from deliverable-level)
    const taskHandoffs = await ctx.db
      .query("deliverableHandoffs")
      .withIndex("by_source_task", (q) => q.eq("sourceTaskId", id))
      .collect();
    for (const h of taskHandoffs) await ctx.db.delete(h._id);

    // Attachments on this task
    const atts = await ctx.db
      .query("attachments")
      .withIndex("by_parent", (q) =>
        q.eq("parentType", "task").eq("parentId", id)
      )
      .collect();
    for (const a of atts) await ctx.db.delete(a._id);

    // Comments on this task
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) =>
        q.eq("parentType", "task").eq("parentId", id)
      )
      .collect();
    for (const c of comments) {
      // Comment reactions
      const reactions = await ctx.db
        .query("commentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", c._id))
        .collect();
      for (const r of reactions) await ctx.db.delete(r._id);
      await ctx.db.delete(c._id);
    }

    // Time entries
    const timeEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .collect();
    for (const te of timeEntries) await ctx.db.delete(te._id);

    // Daily summaries
    const summaries = await ctx.db
      .query("taskDailySummaries")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .collect();
    for (const s of summaries) await ctx.db.delete(s._id);

    // Schedule blocks pointing at this task
    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .collect();
    for (const b of blocks) await ctx.db.delete(b._id);

    // Task connections that reference this task
    const incoming = await ctx.db
      .query("taskConnections")
      .withIndex("by_target", (q) => q.eq("targetTaskId", id))
      .collect();
    for (const tc of incoming) await ctx.db.delete(tc._id);
    const outgoing = await ctx.db
      .query("taskConnections")
      .withIndex("by_source", (q) => q.eq("sourceTaskId", id))
      .collect();
    for (const tc of outgoing) await ctx.db.delete(tc._id);

    await ctx.db.delete(id);
    deletedTasks.push(id);
  }

  await walk(taskId);
  return { tasks: deletedTasks, deliverables: deletedDeliverables };
}
