import { internalQuery, internalMutation } from "../_generated/server";
import { cascadeDoneToChildren } from "../lib/cascadeTaskStatus";
import { autoApproveDeliverablesForTaskTree } from "../lib/autoApproveDeliverables";
import { syncBriefStatusFromTasks } from "../lib/syncBriefStatus";

/**
 * Read-only: dump the parent + every child for the calendar entry titled
 * exactly "Ad Adapt 1" (the row Abhinav screenshotted) so we can see
 * whether the cascade should fire.
 */
export const inspectAdAdapt1 = internalQuery({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const users = await ctx.db.query("users").collect();
    const deliverables = await ctx.db.query("deliverables").collect();

    // The parent calendar entry has no parentTaskId and a title of
    // "Ad Adapt 1". We match loosely on title to avoid case/space issues.
    const candidates = tasks.filter(
      (t) =>
        !t.parentTaskId &&
        t.title.trim().toLowerCase() === "ad adapt 1"
    );

    return candidates.map((parent) => {
      const parentAssignee = users.find((u) => u._id === parent.assigneeId);
      const parentDeliverables = deliverables.filter(
        (d) => d.taskId === parent._id
      );
      const children = tasks.filter((t) => t.parentTaskId === parent._id);
      return {
        parent: {
          id: parent._id,
          title: parent.title,
          status: parent.status,
          completedAt: parent.completedAt,
          briefId: parent.briefId,
          assignee: parentAssignee?.name ?? parentAssignee?.email,
          parentDeliverables: parentDeliverables.map((d) => ({
            id: d._id,
            status: d.status,
            teamLeadStatus: d.teamLeadStatus,
            passedToManagerAt: d.passedToManagerAt,
          })),
        },
        children: children.map((c) => {
          const a = users.find((u) => u._id === c.assigneeId);
          const ds = deliverables.filter((d) => d.taskId === c._id);
          return {
            id: c._id,
            title: c.title,
            status: c.status,
            assignee: a?.name ?? a?.email,
            deliverables: ds.map((d) => ({
              id: d._id,
              status: d.status,
              teamLeadStatus: d.teamLeadStatus,
              passedToManagerAt: d.passedToManagerAt,
              submittedAt: d.submittedAt,
            })),
          };
        }),
      };
    });
  },
});

/**
 * Force-cascade exactly the "Ad Adapt 1" parent (or every match if the
 * title is duplicated): mark every child done, auto-approve their pending
 * deliverables, refresh brief status. Idempotent.
 */
export const repairAdAdapt1 = internalMutation({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const targets = tasks.filter(
      (t) =>
        !t.parentTaskId &&
        t.title.trim().toLowerCase() === "ad adapt 1" &&
        t.status === "done"
    );

    const summary: any[] = [];
    for (const parent of targets) {
      const cascaded = await cascadeDoneToChildren(
        ctx,
        parent._id,
        parent.assignedBy
      );
      const approved = await autoApproveDeliverablesForTaskTree(
        ctx,
        parent._id,
        parent.assignedBy
      );
      await syncBriefStatusFromTasks(ctx, parent.briefId);
      summary.push({
        parentId: parent._id,
        cascadedTaskIds: cascaded,
        autoApprovedDeliverableIds: approved,
      });
    }

    return { matched: targets.length, summary };
  },
});
