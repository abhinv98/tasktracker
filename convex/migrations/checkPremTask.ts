import { internalQuery } from "../_generated/server";

export const run = internalQuery({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const prem = users.find((u) => u.name?.toLowerCase().includes("prem"));
    if (!prem) return { error: "Prem Rastogi not found" };

    const tasks = await ctx.db.query("tasks").collect();
    const target = tasks.find(
      (t) =>
        t.assigneeId === prem._id &&
        t.title.toLowerCase().includes("led advt")
    );
    if (!target) return { error: "Task not found", premId: prem._id };

    const brief = await ctx.db.get(target.briefId);
    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", target._id))
      .collect();

    const teams = await ctx.db.query("teams").collect();
    const userTeams = await ctx.db
      .query("userTeams")
      .withIndex("by_user", (q) => q.eq("userId", prem._id))
      .collect();
    const premTeams = userTeams.map((ut) => {
      const team = teams.find((t) => t._id === ut.teamId);
      return { teamId: ut.teamId, teamName: team?.name, leadId: team?.leadId };
    });

    const brandManagers = brief?.brandId
      ? await ctx.db
          .query("brandManagers")
          .withIndex("by_brand", (q) => q.eq("brandId", brief.brandId!))
          .collect()
      : [];

    return {
      prem: { id: prem._id, name: prem.name, email: (prem as any).email },
      task: {
        id: target._id,
        title: target.title,
        status: target.status,
        assigneeId: target.assigneeId,
        assignedBy: target.assignedBy,
        briefId: target.briefId,
        clientFacing: target.clientFacing,
        parentTaskId: target.parentTaskId,
      },
      brief: brief
        ? {
            id: brief._id,
            title: brief.title,
            status: brief.status,
            brandId: brief.brandId,
            briefType: brief.briefType,
          }
        : null,
      deliverables: deliverables.map((d) => ({
        id: d._id,
        status: d.status,
        teamLeadStatus: d.teamLeadStatus,
        mainAssigneeStatus: d.mainAssigneeStatus,
        passedToManagerAt: d.passedToManagerAt,
        clientStatus: d.clientStatus,
        submittedBy: d.submittedBy,
        submittedAt: d.submittedAt,
        message: d.message?.substring(0, 100),
      })),
      premTeams,
      brandManagers: brandManagers.map((bm) => {
        const mgr = users.find((u) => u._id === bm.managerId);
        return { managerId: bm.managerId, managerName: mgr?.name };
      }),
    };
  },
});
