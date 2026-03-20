import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Helper: find team lead for a user ─────────────
async function findTeamLeadForUser(ctx: any, userId: string) {
  const userTeams = await ctx.db
    .query("userTeams")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (userTeams.length === 0) return null;

  const teams = await Promise.all(
    userTeams.map((ut: any) => ctx.db.get(ut.teamId))
  );
  const team = teams.find((t: any) => t);
  return team ? { teamId: team._id, leadId: team.leadId, teamName: team.name } : null;
}

// ─── Helper: check if user is brand manager ────────
async function isBrandManager(ctx: any, userId: string, brandId: string) {
  const bms = await ctx.db
    .query("brandManagers")
    .withIndex("by_brand", (q: any) => q.eq("brandId", brandId))
    .collect();
  return bms.some((bm: any) => bm.managerId === userId);
}

// ─── Queries ────────────────────────────────────────

export const listDeliverables = query({
  args: { taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let deliverables;
    if (taskId) {
      deliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
    } else {
      deliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_submittedBy", (q) => q.eq("submittedBy", userId))
        .collect();
    }

    const users = await ctx.db.query("users").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const allTeams = await ctx.db.query("teams").collect();

    const results = await Promise.all(
      deliverables.map(async (d) => {
        const submitter = users.find((u) => u._id === d.submittedBy);
        const reviewer = d.reviewedBy ? users.find((u) => u._id === d.reviewedBy) : null;
        const teamLeadReviewer = d.teamLeadReviewedBy ? users.find((u) => u._id === d.teamLeadReviewedBy) : null;
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return {
                name: d.fileNames?.[idx] ?? "file",
                url: url ?? "",
              };
            })
          );
          files = files.filter((f) => f.url);
        }

        // Find submitter's team and lead
        let teamLeadName: string | null = null;
        let teamName: string | null = null;
        if (d.teamLeadReviewedBy) {
          teamLeadName = teamLeadReviewer?.name ?? teamLeadReviewer?.email ?? null;
          const submitterTeams = await ctx.db
            .query("userTeams")
            .withIndex("by_user", (q) => q.eq("userId", d.submittedBy))
            .collect();
          for (const ut of submitterTeams) {
            const team = allTeams.find((t) => t._id === ut.teamId);
            if (team && team.leadId === d.teamLeadReviewedBy) {
              teamName = team.name;
              break;
            }
          }
        }

        const isSubTask = !!task?.parentTaskId;
        let parentTaskTitle: string | null = null;
        let mainAssigneeName: string | null = null;
        const mainAssigneeReviewer = d.mainAssigneeReviewedBy
          ? users.find((u) => u._id === d.mainAssigneeReviewedBy)
          : null;
        if (isSubTask && task?.parentTaskId) {
          const parentTask = tasks.find((t) => t._id === task.parentTaskId);
          parentTaskTitle = parentTask?.title ?? null;
          const ma = parentTask ? users.find((u) => u._id === parentTask.assigneeId) : null;
          mainAssigneeName = ma?.name ?? ma?.email ?? null;
        }

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          reviewerName: reviewer?.name ?? reviewer?.email,
          taskTitle: task?.title ?? "Unknown",
          taskDuration: task?.duration ?? "—",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          brandId: brief?.brandId,
          files,
          teamLeadReviewerName: teamLeadName,
          teamName,
          isSubTask,
          parentTaskTitle,
          mainAssigneeName,
          mainAssigneeReviewerName: mainAssigneeReviewer?.name ?? mainAssigneeReviewer?.email ?? null,
        };
      })
    );
    return results;
  },
});

export const listTeamLeadPendingApprovals = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_lead", (q) => q.eq("leadId", userId))
      .collect();
    if (teams.length === 0) return [];

    const teamIds = teams.map((t) => t._id);
    const allUserTeams = await ctx.db.query("userTeams").collect();
    const teamMemberIds = new Set(
      allUserTeams
        .filter((ut) => teamIds.includes(ut.teamId))
        .map((ut) => ut.userId)
    );

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const pending = allDeliverables.filter(
      (d) =>
        (d.teamLeadStatus === "pending" ||
          (d.teamLeadStatus === "approved" && !d.passedToManagerAt)) &&
        teamMemberIds.has(d.submittedBy)
    );

    const users = await ctx.db.query("users").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const brands = await ctx.db.query("brands").collect();

    const results = await Promise.all(
      pending.map(async (d) => {
        const submitter = users.find((u) => u._id === d.submittedBy);
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
        const brand = brief?.brandId ? brands.find((b) => b._id === brief.brandId) : null;

        const brandManagerEntries = brief?.brandId
          ? await ctx.db
              .query("brandManagers")
              .withIndex("by_brand", (q) => q.eq("brandId", brief.brandId!))
              .collect()
          : [];
        const brandManagers = brandManagerEntries
          .map((bm) => {
            const mgr = users.find((u) => u._id === bm.managerId);
            return mgr ? { _id: mgr._id, name: mgr.name ?? mgr.email ?? "Unknown" } : null;
          })
          .filter(Boolean);

        const isAlsoBrandManager = brandManagerEntries.some(
          (bm) => bm.managerId === userId
        );

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
            })
          );
          files = files.filter((f) => f.url);
        }

        const isSubTask = !!task?.parentTaskId;
        let mainAssigneeName: string | null = null;
        let parentTaskTitle: string | null = null;
        if (isSubTask && task?.parentTaskId) {
          const parentTask = tasks.find((t) => t._id === task.parentTaskId);
          parentTaskTitle = parentTask?.title ?? null;
          const mainAssignee = parentTask ? users.find((u) => u._id === parentTask.assigneeId) : null;
          mainAssigneeName = mainAssignee?.name ?? mainAssignee?.email ?? null;
        }
        const mainAssigneeReviewer = d.mainAssigneeReviewedBy
          ? users.find((u) => u._id === d.mainAssigneeReviewedBy)
          : null;

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          taskTitle: task?.title ?? "Unknown",
          taskDuration: task?.duration ?? "—",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          brandName: brand?.name ?? "No Brand",
          brandId: brief?.brandId,
          brandManagers,
          isAlsoBrandManager,
          files,
          isSubTask,
          parentTaskTitle,
          mainAssigneeName,
          mainAssigneeApproved: d.mainAssigneeStatus === "approved",
          mainAssigneeReviewerName: mainAssigneeReviewer?.name ?? mainAssigneeReviewer?.email ?? null,
        };
      })
    );
    return results;
  },
});

export const listManagerDeliverables = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const myBrandAssignments = await ctx.db
      .query("brandManagers")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .collect();
    if (myBrandAssignments.length === 0) return [];

    const myBrandIds = new Set(myBrandAssignments.map((bm) => bm.brandId));

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const users = await ctx.db.query("users").collect();
    const brands = await ctx.db.query("brands").collect();
    const allTeams = await ctx.db.query("teams").collect();

    const passed = allDeliverables.filter((d) => {
      if (d.teamLeadStatus !== "approved" || !d.passedToManagerAt) return false;
      if (d.status === "approved" || d.status === "rejected") return false;
      const task = tasks.find((t) => t._id === d.taskId);
      const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
      return brief?.brandId && myBrandIds.has(brief.brandId);
    });

    const results = await Promise.all(
      passed.map(async (d) => {
        const submitter = users.find((u) => u._id === d.submittedBy);
        const teamLeadReviewer = d.teamLeadReviewedBy
          ? users.find((u) => u._id === d.teamLeadReviewedBy)
          : null;
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
        const brand = brief?.brandId ? brands.find((b) => b._id === brief.brandId) : null;

        let teamName: string | null = null;
        if (d.teamLeadReviewedBy) {
          const submitterUserTeams = await ctx.db
            .query("userTeams")
            .withIndex("by_user", (q) => q.eq("userId", d.submittedBy))
            .collect();
          for (const ut of submitterUserTeams) {
            const team = allTeams.find((t) => t._id === ut.teamId);
            if (team && team.leadId === d.teamLeadReviewedBy) {
              teamName = team.name;
              break;
            }
          }
        }

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
            })
          );
          files = files.filter((f) => f.url);
        }

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          taskTitle: task?.title ?? "Unknown",
          taskDuration: task?.duration ?? "—",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          brandName: brand?.name ?? "No Brand",
          brandId: brief?.brandId,
          teamLeadReviewerName: teamLeadReviewer?.name ?? teamLeadReviewer?.email ?? null,
          teamName,
          files,
          taskClientFacing: task?.clientFacing ?? false,
          clientStatus: d.clientStatus,
        };
      })
    );

    // Client feedback deliverables (changes requested or denied by client)
    const briefTeams = await ctx.db.query("briefTeams").collect();
    const allUserTeams = await ctx.db.query("userTeams").collect();

    const clientFeedback = allDeliverables.filter((d) => {
      if (d.clientStatus !== "client_changes_requested" && d.clientStatus !== "client_denied") return false;
      if (d.status === "rejected") return false;
      const task = tasks.find((t) => t._id === d.taskId);
      const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
      return brief?.brandId && myBrandIds.has(brief.brandId);
    });

    const clientFeedbackResults = await Promise.all(
      clientFeedback.map(async (d) => {
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
        const brand = brief?.brandId ? brands.find((b) => b._id === brief.brandId) : null;
        const submitter = users.find((u) => u._id === d.submittedBy);

        const bTeams = briefTeams.filter((bt) => bt.briefId === brief?._id);
        const teamMemberIds = new Set<string>();
        for (const bt of bTeams) {
          const members = allUserTeams.filter((ut) => ut.teamId === bt.teamId);
          for (const m of members) teamMemberIds.add(m.userId);
        }
        const teamMembersList = [...teamMemberIds].map((id) => {
          const u = users.find((usr) => usr._id === id);
          return u ? { _id: u._id, name: u.name ?? u.email ?? "Unknown" } : null;
        }).filter(Boolean);

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = (await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
            })
          )).filter((f) => f.url);
        }

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          taskTitle: task?.title ?? "Unknown",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          brandName: brand?.name ?? "No Brand",
          brandId: brief?.brandId,
          files,
          taskClientFacing: task?.clientFacing ?? false,
          clientStatus: d.clientStatus,
          clientNote: d.clientNote ?? null,
          teamMembers: teamMembersList,
          _clientFeedback: true as const,
        };
      })
    );

    const readyToSend = allDeliverables.filter((d) => {
      if (d.status !== "approved") return false;
      const task = tasks.find((t) => t._id === d.taskId);
      if (!task?.clientFacing) return false;
      if (d.clientStatus && d.clientStatus !== "client_changes_requested") return false;
      const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
      return brief?.brandId && myBrandIds.has(brief.brandId);
    });

    const sendToClientResults = await Promise.all(
      readyToSend.map(async (d) => {
        const submitter = users.find((u) => u._id === d.submittedBy);
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
        const brand = brief?.brandId ? brands.find((b) => b._id === brief.brandId) : null;
        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = (await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
            })
          )).filter((f) => f.url);
        }
        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          taskTitle: task?.title ?? "Unknown",
          taskDuration: task?.duration ?? "—",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          brandName: brand?.name ?? "No Brand",
          brandId: brief?.brandId,
          files,
          taskClientFacing: true as const,
          _sendToClient: true as const,
        };
      })
    );

    return [...results, ...sendToClientResults, ...clientFeedbackResults];
  },
});

export const getTeamLeadPendingCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_lead", (q) => q.eq("leadId", userId))
      .collect();
    if (teams.length === 0) return 0;

    const teamIds = teams.map((t) => t._id);
    const allUserTeams = await ctx.db.query("userTeams").collect();
    const teamMemberIds = new Set(
      allUserTeams.filter((ut) => teamIds.includes(ut.teamId)).map((ut) => ut.userId)
    );

    const allDeliverables = await ctx.db.query("deliverables").collect();
    return allDeliverables.filter(
      (d) => d.teamLeadStatus === "pending" && teamMemberIds.has(d.submittedBy)
    ).length;
  },
});

// ─── Approved Work Queries ──────────────────────────

export const listClientApprovedDeliverables = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const currentUser = await ctx.db.get(userId);
    if (!currentUser) return [];

    let allowedBrandIds: Set<string> | null = null;
    if (currentUser.role === "admin" && !currentUser.isSuperAdmin) {
      const brandManagerLinks = await ctx.db
        .query("brandManagers")
        .withIndex("by_manager", (q) => q.eq("managerId", userId))
        .collect();
      allowedBrandIds = new Set(brandManagerLinks.map((bm) => bm.brandId));
    }

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const approved = allDeliverables.filter(
      (d) => d.clientStatus === "client_approved"
    );
    if (approved.length === 0) return [];

    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const brands = await ctx.db.query("brands").collect();
    const users = await ctx.db.query("users").collect();

    const results = await Promise.all(
      approved.map(async (d) => {
        const task = tasks.find((t) => t._id === d.taskId);
        const brief = task ? briefs.find((b) => b._id === task.briefId) : null;

        if (allowedBrandIds && (!brief?.brandId || !allowedBrandIds.has(brief.brandId))) {
          return null;
        }

        const brand = brief?.brandId
          ? brands.find((b) => b._id === brief.brandId)
          : null;
        const manager = brief?.assignedManagerId
          ? users.find((u) => u._id === brief.assignedManagerId)
          : null;
        const submitter = users.find((u) => u._id === d.submittedBy);

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = (
            await Promise.all(
              d.fileIds.map(async (fileId, idx) => {
                const url = await ctx.storage.getUrl(fileId);
                return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
              })
            )
          ).filter((f) => f.url);
        }

        return {
          _id: d._id,
          taskTitle: task?.title ?? "Unknown",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          brandName: brand?.name ?? "No Brand",
          brandId: brief?.brandId,
          managerName: manager?.name ?? manager?.email ?? "Unknown",
          managerId: brief?.assignedManagerId,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          submittedAt: d.submittedAt,
          clientReviewedAt: d.clientReviewedAt,
          clientNote: d.clientNote,
          message: d.message,
          link: d.link,
          files,
        };
      })
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (b.clientReviewedAt ?? 0) - (a.clientReviewedAt ?? 0));
  },
});

export const getApprovedWorkStats = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const currentUser = await ctx.db.get(userId);
    if (!currentUser) return null;

    let allowedBrandIds: Set<string> | null = null;
    if (currentUser.role === "admin" && !currentUser.isSuperAdmin) {
      const brandManagerLinks = await ctx.db
        .query("brandManagers")
        .withIndex("by_manager", (q) => q.eq("managerId", userId))
        .collect();
      allowedBrandIds = new Set(brandManagerLinks.map((bm) => bm.brandId));
    }

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allTasks = await ctx.db.query("tasks").collect();

    const scopedBriefs = allowedBrandIds
      ? allBriefs.filter((b) => b.brandId && allowedBrandIds!.has(b.brandId))
      : allBriefs;
    const scopedBriefIds = new Set(scopedBriefs.map((b) => b._id));
    const scopedTasks = allTasks.filter((t) => scopedBriefIds.has(t.briefId));
    const scopedTaskIds = new Set(scopedTasks.map((t) => t._id));
    const scopedDeliverables = allowedBrandIds
      ? allDeliverables.filter((d) => scopedTaskIds.has(d.taskId))
      : allDeliverables;

    const sentToClient = scopedDeliverables.filter(
      (d) => d.clientStatus !== undefined
    ).length;
    const clientApproved = scopedDeliverables.filter(
      (d) => d.clientStatus === "client_approved"
    ).length;

    const totalBriefs = scopedBriefs.length;

    const clientFacingTaskBriefIds = new Set(
      scopedTasks.filter((t) => t.clientFacing).map((t) => t.briefId)
    );
    const clientBriefs = scopedBriefs.filter((b) =>
      clientFacingTaskBriefIds.has(b._id)
    ).length;
    const internalBriefs = totalBriefs - clientBriefs;

    return {
      sentToClient,
      clientApproved,
      totalBriefs,
      clientBriefs,
      internalBriefs,
    };
  },
});

// ─── Mutations ──────────────────────────────────────

export const submitDeliverable = mutation({
  args: {
    taskId: v.id("tasks"),
    message: v.string(),
    link: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
    fileNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { taskId, message, link, fileIds, fileNames }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    const isSubTask = !!task.parentTaskId;
    let parentTask: any = null;
    if (isSubTask) {
      parentTask = await ctx.db.get(task.parentTaskId!);
    }

    const deliverableId = await ctx.db.insert("deliverables", {
      taskId,
      submittedBy: userId,
      message,
      link,
      submittedAt: Date.now(),
      status: "pending",
      ...(isSubTask
        ? { mainAssigneeStatus: "pending" as const }
        : { teamLeadStatus: "pending" as const }),
      ...(fileIds && fileIds.length > 0 ? { fileIds } : {}),
      ...(fileNames && fileNames.length > 0 ? { fileNames } : {}),
    });

    if (task.status !== "done" && task.status !== "review") {
      await ctx.db.patch(taskId, { status: "review" });
    }

    const user = await ctx.db.get(userId);

    if (isSubTask && parentTask) {
      await ctx.db.insert("notifications", {
        recipientId: parentTask.assigneeId,
        type: "deliverable_submitted",
        title: "Helper deliverable for review",
        message: `${user?.name ?? "Someone"} submitted a deliverable for their sub-task on "${parentTask.title}"`,
        briefId: task.briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    } else {
      const teamInfo = await findTeamLeadForUser(ctx, userId);

      if (teamInfo?.leadId) {
        await ctx.db.insert("notifications", {
          recipientId: teamInfo.leadId,
          type: "deliverable_submitted",
          title: "Deliverable submitted for review",
          message: `${user?.name ?? "Someone"} submitted a deliverable for "${task.title}"`,
          briefId: task.briefId,
          taskId,
          triggeredBy: userId,
          read: false,
          createdAt: Date.now(),
        });
      }

      if (task.assignedBy !== teamInfo?.leadId) {
        await ctx.db.insert("notifications", {
          recipientId: task.assignedBy,
          type: "deliverable_submitted",
          title: "Deliverable submitted",
          message: `${user?.name ?? "Someone"} submitted a deliverable for "${task.title}"`,
          briefId: task.briefId,
          taskId,
          triggeredBy: userId,
          read: false,
          createdAt: Date.now(),
        });
      }
    }

    return deliverableId;
  },
});

export const teamLeadApprove = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const teamInfo = await findTeamLeadForUser(ctx, deliverable.submittedBy);
    if (!teamInfo || teamInfo.leadId !== userId) {
      throw new Error("Only the team lead can approve this deliverable");
    }

    await ctx.db.patch(deliverableId, {
      teamLeadStatus: "approved",
      teamLeadReviewedBy: userId,
      teamLeadReviewNote: note,
      teamLeadReviewedAt: Date.now(),
    });

    const user = await ctx.db.get(userId);
    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_approved",
      title: "Deliverable approved by team lead",
      message: `${user?.name ?? "Team lead"} approved your deliverable for "${task?.title ?? "a task"}"`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    if (task) {
      await ctx.db.insert("activityLog", {
        briefId: task.briefId,
        taskId: task._id,
        userId,
        action: "team_lead_approved",
        details: JSON.stringify({ taskTitle: task.title, briefTitle: brief?.title }),
        timestamp: Date.now(),
      });
    }
  },
});

export const teamLeadReject = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.string(),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const teamInfo = await findTeamLeadForUser(ctx, deliverable.submittedBy);
    if (!teamInfo || teamInfo.leadId !== userId) {
      throw new Error("Only the team lead can reject this deliverable");
    }

    await ctx.db.patch(deliverableId, {
      teamLeadStatus: "changes_requested",
      teamLeadReviewedBy: userId,
      teamLeadReviewNote: note,
      teamLeadReviewedAt: Date.now(),
    });

    const task = await ctx.db.get(deliverable.taskId);
    if (task && task.status === "review") {
      await ctx.db.patch(deliverable.taskId, { status: "in-progress" });
    }

    const user = await ctx.db.get(userId);
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_rejected",
      title: "Changes requested by team lead",
      message: `${user?.name ?? "Team lead"} requested changes on your deliverable for "${task?.title ?? "a task"}": ${note}`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const passToManager = mutation({
  args: {
    deliverableId: v.id("deliverables"),
  },
  handler: async (ctx, { deliverableId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    if (deliverable.teamLeadStatus !== "approved") {
      throw new Error("Deliverable must be approved by team lead first");
    }

    const teamInfo = await findTeamLeadForUser(ctx, deliverable.submittedBy);
    if (!teamInfo || teamInfo.leadId !== userId) {
      throw new Error("Only the team lead can pass this deliverable to the manager");
    }

    await ctx.db.patch(deliverableId, {
      passedToManagerBy: userId,
      passedToManagerAt: Date.now(),
    });

    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;

    if (brief?.brandId) {
      const brandManagers = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", brief.brandId!))
        .collect();

      const user = await ctx.db.get(userId);
      for (const bm of brandManagers) {
        await ctx.db.insert("notifications", {
          recipientId: bm.managerId,
          type: "deliverable_submitted",
          title: "Deliverable ready for review",
          message: `${user?.name ?? "Team lead"} passed a deliverable for "${task?.title ?? "a task"}" for your review`,
          briefId: task?.briefId,
          taskId: deliverable.taskId,
          triggeredBy: userId,
          read: false,
          createdAt: Date.now(),
        });
      }
    }
  },
});

export const teamLeadAndManagerApprove = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const teamInfo = await findTeamLeadForUser(ctx, deliverable.submittedBy);
    if (!teamInfo || teamInfo.leadId !== userId) {
      throw new Error("Only the team lead can approve this deliverable");
    }

    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;

    if (!brief?.brandId) {
      throw new Error("Brief has no brand assigned — cannot do brand manager approval");
    }

    const isManager = await isBrandManager(ctx, userId, brief.brandId);
    if (!isManager) {
      throw new Error("You are not the brand manager for this brief");
    }

    const now = Date.now();

    await ctx.db.patch(deliverableId, {
      teamLeadStatus: "approved",
      teamLeadReviewedBy: userId,
      teamLeadReviewNote: note,
      teamLeadReviewedAt: now,
      passedToManagerBy: userId,
      passedToManagerAt: now,
      status: "approved",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: now,
    });

    if (task) {
      if (task.clientFacing) {
        await ctx.db.patch(deliverable.taskId, { status: "review" });
      } else {
        await ctx.db.patch(deliverable.taskId, {
          status: "done",
          completedAt: now,
        });
      }
    }

    const user = await ctx.db.get(userId);
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_approved",
      title: "Deliverable fully approved",
      message: `${user?.name ?? "Your manager"} approved your deliverable for "${task?.title ?? "a task"}" as both team lead and brand manager${task?.clientFacing ? " (pending client review)" : ""}`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: now,
    });

    if (task) {
      await ctx.db.insert("activityLog", {
        briefId: task.briefId,
        taskId: task._id,
        userId,
        action: "deliverable_approved_internally",
        details: JSON.stringify({
          taskTitle: task.title,
          briefTitle: brief?.title,
          clientFacing: task.clientFacing,
          dualRole: true,
        }),
        timestamp: now,
      });
    }
  },
});

// ─── Sub-task: main assignee review queries & mutations ─────

export const managerApproveFromTeamLead = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    if (deliverable.teamLeadStatus !== "approved") {
      throw new Error("Deliverable must be approved by team lead first");
    }

    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;

    if (!brief?.brandId) {
      throw new Error("Brief has no brand assigned");
    }

    const isManager = await isBrandManager(ctx, userId, brief.brandId);
    if (!isManager) {
      throw new Error("You are not the brand manager for this brief");
    }

    const now = Date.now();

    await ctx.db.patch(deliverableId, {
      passedToManagerBy: userId,
      passedToManagerAt: now,
      status: "approved",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: now,
    });

    if (task) {
      if (task.clientFacing) {
        await ctx.db.patch(deliverable.taskId, { status: "review" });
      } else {
        await ctx.db.patch(deliverable.taskId, {
          status: "done",
          completedAt: now,
        });
      }
    }

    const user = await ctx.db.get(userId);
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_approved",
      title: "Deliverable approved by brand manager",
      message: `${user?.name ?? "Brand manager"} approved your deliverable for "${task?.title ?? "a task"}"${task?.clientFacing ? " (pending client review)" : ""}`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: now,
    });

    if (task) {
      await ctx.db.insert("activityLog", {
        briefId: task.briefId,
        taskId: task._id,
        userId,
        action: "deliverable_approved_internally",
        details: JSON.stringify({
          taskTitle: task.title,
          briefTitle: brief?.title,
          clientFacing: task.clientFacing,
        }),
        timestamp: now,
      });
    }
  },
});

export const listMainAssigneePendingReviews = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const myTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    const myTaskIds = new Set(myTasks.map((t) => t._id));

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const subTaskDeliverables = allDeliverables.filter((d) => {
      if (d.mainAssigneeStatus !== "pending") return false;
      return true;
    });

    const tasks = await ctx.db.query("tasks").collect();
    const users = await ctx.db.query("users").collect();
    const briefs = await ctx.db.query("briefs").collect();

    const results = await Promise.all(
      subTaskDeliverables.map(async (d) => {
        const subTask = tasks.find((t) => t._id === d.taskId);
        if (!subTask?.parentTaskId || !myTaskIds.has(subTask.parentTaskId)) return null;

        const parentTask = tasks.find((t) => t._id === subTask.parentTaskId);
        const submitter = users.find((u) => u._id === d.submittedBy);
        const brief = subTask ? briefs.find((b) => b._id === subTask.briefId) : null;

        let files: { name: string; url: string }[] = [];
        if (d.fileIds && d.fileIds.length > 0) {
          files = await Promise.all(
            d.fileIds.map(async (fileId, idx) => {
              const url = await ctx.storage.getUrl(fileId);
              return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
            })
          );
          files = files.filter((f) => f.url);
        }

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          subTaskTitle: subTask?.title ?? "Unknown",
          subTaskDescription: subTask?.description ?? "",
          parentTaskTitle: parentTask?.title ?? "Unknown",
          parentTaskId: subTask?.parentTaskId,
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          files,
        };
      })
    );
    return results.filter(Boolean);
  },
});

export const getMainAssigneePendingCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const myTasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    const myTaskIds = new Set(myTasks.map((t) => t._id));

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const tasks = await ctx.db.query("tasks").collect();

    return allDeliverables.filter((d) => {
      if (d.mainAssigneeStatus !== "pending") return false;
      const subTask = tasks.find((t) => t._id === d.taskId);
      return subTask?.parentTaskId && myTaskIds.has(subTask.parentTaskId);
    }).length;
  },
});

export const mainAssigneeApprove = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const subTask = await ctx.db.get(deliverable.taskId);
    if (!subTask?.parentTaskId) throw new Error("Not a sub-task deliverable");

    const parentTask = await ctx.db.get(subTask.parentTaskId);
    if (!parentTask || parentTask.assigneeId !== userId) {
      throw new Error("Only the main task assignee can review this");
    }

    await ctx.db.patch(deliverableId, {
      mainAssigneeStatus: "approved",
      mainAssigneeReviewedBy: userId,
      mainAssigneeReviewNote: note,
      mainAssigneeReviewedAt: Date.now(),
    });

    const user = await ctx.db.get(userId);
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_approved",
      title: "Deliverable approved by main assignee",
      message: `${user?.name ?? "Main assignee"} approved your deliverable for "${subTask.title}"`,
      briefId: subTask.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const mainAssigneeReject = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.string(),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const subTask = await ctx.db.get(deliverable.taskId);
    if (!subTask?.parentTaskId) throw new Error("Not a sub-task deliverable");

    const parentTask = await ctx.db.get(subTask.parentTaskId);
    if (!parentTask || parentTask.assigneeId !== userId) {
      throw new Error("Only the main task assignee can review this");
    }

    await ctx.db.patch(deliverableId, {
      mainAssigneeStatus: "changes_requested",
      mainAssigneeReviewedBy: userId,
      mainAssigneeReviewNote: note,
      mainAssigneeReviewedAt: Date.now(),
    });

    if (subTask.status === "review") {
      await ctx.db.patch(deliverable.taskId, { status: "in-progress" });
    }

    const user = await ctx.db.get(userId);
    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_rejected",
      title: "Changes requested by main assignee",
      message: `${user?.name ?? "Main assignee"} requested changes on your deliverable for "${subTask.title}": ${note}`,
      briefId: subTask.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const passSubTaskToTeamLead = mutation({
  args: {
    deliverableId: v.id("deliverables"),
  },
  handler: async (ctx, { deliverableId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    if (deliverable.mainAssigneeStatus !== "approved") {
      throw new Error("Deliverable must be approved by main assignee first");
    }

    const subTask = await ctx.db.get(deliverable.taskId);
    if (!subTask?.parentTaskId) throw new Error("Not a sub-task deliverable");

    const parentTask = await ctx.db.get(subTask.parentTaskId);
    if (!parentTask || parentTask.assigneeId !== userId) {
      throw new Error("Only the main task assignee can pass this to the team lead");
    }

    await ctx.db.patch(deliverableId, {
      teamLeadStatus: "pending",
    });

    const teamInfo = await findTeamLeadForUser(ctx, deliverable.submittedBy);
    if (teamInfo?.leadId) {
      const user = await ctx.db.get(userId);
      await ctx.db.insert("notifications", {
        recipientId: teamInfo.leadId,
        type: "deliverable_submitted",
        title: "Sub-task deliverable for review",
        message: `${user?.name ?? "Main assignee"} passed a helper deliverable for "${subTask.title}" on "${parentTask.title}" for your review`,
        briefId: subTask.briefId,
        taskId: deliverable.taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

export const approveDeliverable = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;

    if (brief?.brandId) {
      const isManager = await isBrandManager(ctx, userId, brief.brandId);
      if (!isManager) {
        throw new Error("Only brand managers can give final approval");
      }
    } else {
      const user = await ctx.db.get(userId);
      if (!user || user.role !== "admin") {
        throw new Error("Not authorized to approve");
      }
    }

    await ctx.db.patch(deliverableId, {
      status: "approved",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: Date.now(),
    });

    if (task) {
      if (task.clientFacing) {
        await ctx.db.patch(deliverable.taskId, { status: "review" });
      } else {
        await ctx.db.patch(deliverable.taskId, {
          status: "done",
          completedAt: Date.now(),
        });
      }
    }

    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_approved",
      title: "Deliverable approved",
      message: `Your deliverable for "${task?.title ?? "a task"}" was approved${task?.clientFacing ? " (pending client review)" : ""}`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    if (task) {
      await ctx.db.insert("activityLog", {
        briefId: task.briefId,
        taskId: task._id,
        userId,
        action: "deliverable_approved_internally",
        details: JSON.stringify({ taskTitle: task.title, briefTitle: brief?.title, clientFacing: task.clientFacing }),
        timestamp: Date.now(),
      });
    }
  },
});

export const rejectDeliverable = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    note: v.string(),
  },
  handler: async (ctx, { deliverableId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;

    if (brief?.brandId) {
      const isManager = await isBrandManager(ctx, userId, brief.brandId);
      if (!isManager) {
        throw new Error("Only brand managers can reject deliverables");
      }
    } else {
      const user = await ctx.db.get(userId);
      if (!user || user.role !== "admin") {
        throw new Error("Not authorized to reject");
      }
    }

    await ctx.db.patch(deliverableId, {
      status: "rejected",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: Date.now(),
      teamLeadStatus: undefined,
      teamLeadReviewedBy: undefined,
      teamLeadReviewNote: undefined,
      teamLeadReviewedAt: undefined,
      passedToManagerBy: undefined,
      passedToManagerAt: undefined,
    });

    if (task && task.status === "review") {
      await ctx.db.patch(deliverable.taskId, { status: "in-progress" });
    }

    await ctx.db.insert("notifications", {
      recipientId: deliverable.submittedBy,
      type: "deliverable_rejected",
      title: "Changes requested",
      message: `Changes requested on your deliverable for "${task?.title ?? "a task"}": ${note}`,
      briefId: task?.briefId,
      taskId: deliverable.taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const reassignAfterClientFeedback = mutation({
  args: {
    taskId: v.id("tasks"),
    newAssigneeId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, newAssigneeId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins/managers can reassign");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);

    const oldAssigneeId = task.assigneeId;
    await ctx.db.patch(taskId, {
      assigneeId: newAssigneeId,
      status: "in-progress",
      assignedAt: Date.now(),
    });

    // Reset the latest deliverable so it goes through the flow again
    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const latestDeliverable = deliverables
      .filter((d) => d.clientStatus === "client_changes_requested" || d.clientStatus === "client_denied")
      .sort((a, b) => b.submittedAt - a.submittedAt)[0];

    if (latestDeliverable) {
      await ctx.db.patch(latestDeliverable._id, {
        status: "rejected",
        clientStatus: undefined,
      });
    }

    const newAssignee = await ctx.db.get(newAssigneeId);
    await ctx.db.insert("notifications", {
      recipientId: newAssigneeId,
      type: "task_assigned",
      title: "Task reassigned after client feedback",
      message: `You have been assigned "${task.title}" for revisions${note ? `: ${note}` : ""}`,
      briefId: task.briefId,
      taskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    if (oldAssigneeId !== newAssigneeId) {
      await ctx.db.insert("notifications", {
        recipientId: oldAssigneeId,
        type: "task_status_changed",
        title: "Task reassigned",
        message: `"${task.title}" was reassigned to ${newAssignee?.name ?? newAssignee?.email ?? "another team member"} after client feedback`,
        briefId: task.briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    await ctx.db.insert("activityLog", {
      briefId: task.briefId,
      taskId,
      userId,
      action: "reassigned_after_client_feedback",
      details: JSON.stringify({ from: oldAssigneeId, to: newAssigneeId, note }),
      timestamp: Date.now(),
    });
  },
});

export const forwardToTeamMember = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    targetUserId: v.id("users"),
    note: v.string(),
  },
  handler: async (ctx, { deliverableId, targetUserId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    const task = await ctx.db.get(deliverable.taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);

    if (!brief?.brandId) {
      throw new Error("Brief has no brand assigned");
    }

    const isManager = await isBrandManager(ctx, userId, brief.brandId);
    if (!isManager) {
      throw new Error("Only the brand manager can forward deliverables");
    }

    const oldAssigneeId = task.assigneeId;

    await ctx.db.patch(deliverableId, {
      status: "rejected",
      reviewedBy: userId,
      reviewNote: note,
      reviewedAt: Date.now(),
      teamLeadStatus: undefined,
      teamLeadReviewedBy: undefined,
      teamLeadReviewNote: undefined,
      teamLeadReviewedAt: undefined,
      passedToManagerBy: undefined,
      passedToManagerAt: undefined,
    });

    await ctx.db.patch(task._id, {
      assigneeId: targetUserId,
      status: "in-progress",
      assignedAt: Date.now(),
    });

    const user = await ctx.db.get(userId);
    const targetUser = await ctx.db.get(targetUserId);

    await ctx.db.insert("notifications", {
      recipientId: targetUserId,
      type: "task_assigned",
      title: "Deliverable forwarded to you",
      message: `${user?.name ?? "Brand manager"} forwarded a deliverable for "${task.title}" to you: ${note}`,
      briefId: task.briefId,
      taskId: task._id,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });

    if (oldAssigneeId !== targetUserId) {
      await ctx.db.insert("notifications", {
        recipientId: oldAssigneeId,
        type: "task_status_changed",
        title: "Task reassigned",
        message: `"${task.title}" was forwarded to ${targetUser?.name ?? targetUser?.email ?? "another team member"} by ${user?.name ?? "brand manager"}`,
        briefId: task.briefId,
        taskId: task._id,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    await ctx.db.insert("activityLog", {
      briefId: task.briefId,
      taskId: task._id,
      userId,
      action: "forwarded_to_team_member",
      details: JSON.stringify({
        from: oldAssigneeId,
        to: targetUserId,
        targetName: targetUser?.name ?? targetUser?.email,
        note,
        taskTitle: task.title,
        briefTitle: brief?.title,
      }),
      timestamp: Date.now(),
    });
  },
});

export const deleteDeliverable = mutation({
  args: { deliverableId: v.id("deliverables") },
  handler: async (ctx, { deliverableId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can delete deliverables");
    }

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    if (deliverable.fileIds) {
      for (const fileId of deliverable.fileIds) {
        await ctx.storage.delete(fileId);
      }
    }

    await ctx.db.delete(deliverableId);
  },
});
