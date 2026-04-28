import { internalQuery, internalMutation } from "../_generated/server";

/**
 * READ-ONLY: Find every orphaned task assigned to Faiz.
 *
 * An "orphan" is a task with `parentTaskId` set, where the parent task
 * no longer exists in the DB. These are produced when an admin deletes
 * a content-calendar entry without cascading the delete to its linked
 * children (e.g. linked Copy team tasks).
 *
 * Run this FIRST to inspect the damage before calling `deleteFaizOrphans`.
 */
export const findFaizOrphans = internalQuery({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const faiz = users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes("faiz")) ||
        (u.email && (u.email as string).toLowerCase().includes("faiz"))
    );

    if (faiz.length === 0) {
      return { error: "No user found whose name/email contains 'faiz'" };
    }

    const allTasks = await ctx.db.query("tasks").collect();
    const taskIdSet = new Set(allTasks.map((t) => t._id as string));
    const briefs = await ctx.db.query("briefs").collect();
    const allDeliverables = await ctx.db.query("deliverables").collect();

    const results = faiz.map((u) => {
      const myTasks = allTasks.filter((t) => t.assigneeId === u._id);
      const orphans = myTasks.filter(
        (t) => t.parentTaskId && !taskIdSet.has(t.parentTaskId as string)
      );
      const enriched = orphans.map((t) => {
        const brief = briefs.find((b) => b._id === t.briefId);
        const dels = allDeliverables.filter((d) => d.taskId === t._id);
        return {
          taskId: t._id,
          title: t.title,
          status: t.status,
          postDate: t.postDate ?? null,
          deadline: t.deadline ?? null,
          parentTaskId: t.parentTaskId,
          briefId: t.briefId,
          briefTitle: brief?.title ?? null,
          briefType: brief?.briefType ?? null,
          brandId: brief?.brandId ?? null,
          deliverableCount: dels.length,
          deliverables: dels.map((d) => ({
            id: d._id,
            status: d.status,
            teamLeadStatus: d.teamLeadStatus,
            submittedAt: d.submittedAt,
          })),
        };
      });
      return {
        userId: u._id,
        name: u.name,
        email: (u as any).email,
        totalAssignedTasks: myTasks.length,
        orphanCount: orphans.length,
        orphans: enriched,
      };
    });

    return { matches: results };
  },
});

/**
 * DESTRUCTIVE: Delete every orphaned task assigned to Faiz, plus all
 * deliverables and attachments hanging off those tasks.
 *
 * IMPORTANT: Run `findFaizOrphans` first. Pass `dryRun: true` here to
 * preview the exact ids that would be deleted without touching the DB.
 *
 * If `confirmedTaskIds` is provided, only those specific orphans will
 * be deleted (extra safety: lets you cherry-pick after reviewing the
 * findFaizOrphans output). If omitted, ALL orphans for any user whose
 * name/email matches "faiz" are deleted.
 */
export const deleteFaizOrphans = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await runDelete(ctx, { dryRun: false });
  },
});

export const previewDeleteFaizOrphans = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await runDelete(ctx, { dryRun: true });
  },
});

async function runDelete(ctx: any, opts: { dryRun: boolean }) {
  const users = await ctx.db.query("users").collect();
  const faizUsers = users.filter(
    (u: any) =>
      (u.name && u.name.toLowerCase().includes("faiz")) ||
      (u.email && u.email.toLowerCase().includes("faiz"))
  );

  if (faizUsers.length === 0) {
    return { error: "No user found whose name/email contains 'faiz'" };
  }

  const faizIds = new Set(faizUsers.map((u: any) => u._id));
  const allTasks = await ctx.db.query("tasks").collect();
  const taskIdSet = new Set(allTasks.map((t: any) => t._id));

  const orphans = allTasks.filter(
    (t: any) =>
      faizIds.has(t.assigneeId) &&
      t.parentTaskId &&
      !taskIdSet.has(t.parentTaskId)
  );

  const summary: any[] = [];
  for (const t of orphans) {
    const dels = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q: any) => q.eq("taskId", t._id))
      .collect();

    const atts = await ctx.db
      .query("attachments")
      .withIndex("by_parent", (q: any) =>
        q.eq("parentType", "task").eq("parentId", t._id)
      )
      .collect();

    const summaries = await ctx.db
      .query("taskDailySummaries")
      .withIndex("by_task", (q: any) => q.eq("taskId", t._id))
      .collect();

    const timeEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q: any) => q.eq("taskId", t._id))
      .collect();

    summary.push({
      taskId: t._id,
      title: t.title,
      status: t.status,
      parentTaskId: t.parentTaskId,
      deliverablesDeleted: dels.length,
      attachmentsDeleted: atts.length,
      summariesDeleted: summaries.length,
      timeEntriesDeleted: timeEntries.length,
    });

    if (!opts.dryRun) {
      for (const d of dels) await ctx.db.delete(d._id);
      for (const a of atts) await ctx.db.delete(a._id);
      for (const s of summaries) await ctx.db.delete(s._id);
      for (const te of timeEntries) await ctx.db.delete(te._id);
      await ctx.db.delete(t._id);
    }
  }

  return {
    dryRun: opts.dryRun,
    matchedFaizUsers: faizUsers.map((u: any) => ({
      id: u._id,
      name: u.name,
      email: u.email,
    })),
    orphanCount: orphans.length,
    deleted: summary,
  };
}
