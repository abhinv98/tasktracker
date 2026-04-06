import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { syncSingleTaskBriefStatus } from "./lib/syncBriefStatus";
import { mergeUpstreamResourcesIntoTask } from "./lib/taskFlowResources";
import type { Id } from "./_generated/dataModel";

/**
 * After a task's deliverables are all approved and the task is marked done,
 * propagate its deliverable resources to all downstream connected tasks.
 * This ensures the master brief route passes each task's deliverables
 * sequentially as resources to the next task in line.
 */
async function propagateResourcesToDownstreamTasks(
  ctx: any,
  taskId: Id<"tasks">,
  briefId: Id<"briefs">
) {
  const downstreamConnections = await ctx.db
    .query("taskConnections")
    .withIndex("by_brief", (q: any) => q.eq("briefId", briefId))
    .collect();

  const targets = downstreamConnections.filter(
    (c: any) => c.sourceTaskId === taskId
  );

  for (const conn of targets) {
    await mergeUpstreamResourcesIntoTask(ctx, conn.targetTaskId, taskId);
  }
}

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
          briefType: brief?.briefType ?? null,
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

        // Task-level grouping info for creative-slot briefs
        const taskSiblings = allDeliverables.filter((s) => s.taskId === d.taskId);
        const taskDeliverableCount = taskSiblings.length;
        const taskApprovedByTLCount = taskSiblings.filter(
          (s) => s.teamLeadStatus === "approved"
        ).length;

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
          taskDeliverableCount,
          taskApprovedByTLCount,
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

    // Pre-fetch all handoff records for checking handed-off status in filters
    const allHandoffs = await ctx.db.query("deliverableHandoffs").collect();
    const handedOffDeliverableIds = new Set(allHandoffs.map((h: any) => h.sourceDeliverableId as string));

    // TL-approved deliverables for this brand:
    // - "awaiting pass to manager" (not yet approved)
    // - "with manager" (pending or approved)
    // - Approved but not yet handed off (when task has handoffTargetTeamId) — Bug 8 fix
    const passed = allDeliverables.filter((d) => {
      if (d.teamLeadStatus !== "approved") return false;
      if (d.status === "rejected") return false;
      // Keep approved deliverables visible if they still need handoff
      if (d.status === "approved") {
        if (handedOffDeliverableIds.has(d._id as string)) return false; // already handed off
        const task = tasks.find((t) => t._id === d.taskId);
        // Keep visible if task has a handoff target OR has other un-handed-off siblings
        if (!task?.handoffTargetTeamId) {
          // Also keep if any sibling deliverable on same task is not yet handed off and task has handoffs
          const taskHandoffs = allHandoffs.filter((h: any) => h.sourceTaskId === d.taskId);
          if (taskHandoffs.length === 0) return false; // no handoff target, no active handoffs — hide
        }
      }
      const task = tasks.find((t) => t._id === d.taskId);
      const brief = task ? briefs.find((b) => b._id === task.briefId) : null;
      return !!(brief?.brandId && myBrandIds.has(brief.brandId));
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

        // Check if this deliverable has been handed off already
        const handoffs = await ctx.db
          .query("deliverableHandoffs")
          .withIndex("by_source_deliverable", (q) => q.eq("sourceDeliverableId", d._id))
          .collect();
        const isHandedOff = handoffs.length > 0;
        const handoffTargetTeamName = isHandedOff
          ? allTeams.find((t) => t._id === handoffs[0].targetTeamId)?.name ?? null
          : null;

        // Check if the task is marked for handoff
        const taskHasHandoffTarget = !!task?.handoffTargetTeamId;

        // Check if there are chain tasks (handoff tasks) from this source task that aren't done
        let hasIncompleteChainTasks = false;
        if (task) {
          const sourceHandoffs = await ctx.db
            .query("deliverableHandoffs")
            .withIndex("by_source_task", (q) => q.eq("sourceTaskId", task._id))
            .collect();
          if (sourceHandoffs.length > 0) {
            for (const h of sourceHandoffs) {
              const chainTask = await ctx.db.get(h.targetTaskId);
              if (chainTask && chainTask.status !== "done") {
                hasIncompleteChainTasks = true;
                break;
              }
            }
          }
        }

        // Compute task-level grouping info for creative-slot briefs
        const taskSiblings = allDeliverables.filter((s) => s.taskId === d.taskId);
        const taskDeliverableCount = taskSiblings.length;
        const taskApprovedCount = taskSiblings.filter((s) => s.status === "approved").length;
        const allTaskDeliverablesHandedOff = taskSiblings.every((s) =>
          handedOffDeliverableIds.has(s._id as string)
        );

        return {
          ...d,
          submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
          taskTitle: task?.title ?? "Unknown",
          taskDuration: task?.duration ?? "—",
          briefTitle: brief?.title ?? "Unknown",
          briefId: brief?._id,
          briefType: brief?.briefType ?? null,
          brandName: brand?.name ?? "No Brand",
          brandId: brief?.brandId,
          teamLeadReviewerName: teamLeadReviewer?.name ?? teamLeadReviewer?.email ?? null,
          teamName,
          files,
          taskClientFacing: task?.clientFacing ?? false,
          clientStatus: d.clientStatus,
          awaitingHandoff: !d.passedToManagerAt,
          isHandedOff,
          handoffTargetTeamName,
          taskHasHandoffTarget,
          hasIncompleteChainTasks,
          taskDeliverableCount,
          taskApprovedCount,
          allTaskDeliverablesHandedOff,
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
      await ctx.db.patch(taskId, {
        status: "review",
        ...(!task.submittedForReviewAt ? { submittedForReviewAt: Date.now() } : {}),
      });
    } else if (!task.submittedForReviewAt) {
      await ctx.db.patch(taskId, { submittedForReviewAt: Date.now() });
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
    if (task) {
      const updates: Record<string, any> = {
        changesCount: (task.changesCount ?? 0) + 1,
      };
      if (task.status === "review") {
        updates.status = "in-progress";
      }
      await ctx.db.patch(deliverable.taskId, updates);
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

    const task = await ctx.db.get(deliverable.taskId);
    const brief = task ? await ctx.db.get(task.briefId) : null;

    const teamInfo = await findTeamLeadForUser(ctx, deliverable.submittedBy);
    const isTeamLead = !!(teamInfo && teamInfo.leadId === userId);
    const isBm =
      brief?.brandId && (await isBrandManager(ctx, userId, brief.brandId));

    if (!isTeamLead && !isBm) {
      throw new Error(
        "Only the team lead or brand manager can pass this deliverable to the manager"
      );
    }

    await ctx.db.patch(deliverableId, {
      passedToManagerBy: userId,
      passedToManagerAt: Date.now(),
    });

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

/**
 * Submit deliverable directly to Brand Manager, bypassing Team Lead.
 * Used by the Content Calendar "Send to Brand Manager" flow.
 */
export const submitDeliverableDirectToManager = mutation({
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

    const brief = await ctx.db.get(task.briefId);
    if (!brief) throw new Error("Brief not found");

    // Create deliverable with TL auto-approved and already passed to manager
    const deliverableId = await ctx.db.insert("deliverables", {
      taskId,
      submittedBy: userId,
      message,
      link,
      submittedAt: Date.now(),
      status: "pending",
      teamLeadStatus: "approved" as const,
      teamLeadReviewedBy: userId,
      teamLeadReviewedAt: Date.now(),
      teamLeadReviewNote: "Sent directly to Brand Manager",
      passedToManagerBy: userId,
      passedToManagerAt: Date.now(),
      ...(fileIds && fileIds.length > 0 ? { fileIds } : {}),
      ...(fileNames && fileNames.length > 0 ? { fileNames } : {}),
    });

    // Move task to review
    if (task.status !== "done" && task.status !== "review") {
      await ctx.db.patch(taskId, {
        status: "review",
        ...(!task.submittedForReviewAt ? { submittedForReviewAt: Date.now() } : {}),
      });
    }

    // Notify brand manager(s)
    const user = await ctx.db.get(userId);
    if (brief.brandId) {
      const brandManagers = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", brief.brandId!))
        .collect();

      for (const bm of brandManagers) {
        await ctx.db.insert("notifications", {
          recipientId: bm.managerId,
          type: "deliverable_submitted",
          title: "Deliverable sent directly for review",
          message: `${user?.name ?? "Someone"} sent a deliverable for "${task.title}" directly for your review`,
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
      // Check if ALL creative-slot deliverables are approved before marking task done
      const allTaskDeliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      const allApproved = allTaskDeliverables.every((d) => d.status === "approved");

      if (allApproved) {
        if (task.clientFacing) {
          await ctx.db.patch(deliverable.taskId, { status: "review" });
          await syncSingleTaskBriefStatus(ctx, task.briefId, "review");
        } else {
          await ctx.db.patch(deliverable.taskId, {
            status: "done",
            completedAt: now,
          });
          await syncSingleTaskBriefStatus(ctx, task.briefId, "done");
        }
        // Propagate deliverable resources to downstream connected tasks in master brief
        await propagateResourcesToDownstreamTasks(ctx, task._id, task.briefId);
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
      // Check if ALL creative-slot deliverables are approved before marking task done
      const allTaskDeliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      const allApproved = allTaskDeliverables.every((d) => d.status === "approved");

      if (allApproved) {
        if (task.clientFacing) {
          await ctx.db.patch(deliverable.taskId, { status: "review" });
          await syncSingleTaskBriefStatus(ctx, task.briefId, "review");
        } else {
          await ctx.db.patch(deliverable.taskId, {
            status: "done",
            completedAt: now,
          });
          await syncSingleTaskBriefStatus(ctx, task.briefId, "done");
        }
        // Propagate deliverable resources to downstream connected tasks in master brief
        await propagateResourcesToDownstreamTasks(ctx, task._id, task.briefId);
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

      // ── Auto-handoff for content calendar tasks ──────────
      // When a content calendar task's deliverable is approved and the task
      // has handoffTargetTeamId set, automatically create a handoff task
      // carrying the creative copy + caption to the design team.
      if (
        brief?.briefType === "content_calendar" &&
        task.handoffTargetTeamId &&
        !task.clientFacing
      ) {
        const targetTeam = await ctx.db.get(task.handoffTargetTeamId);
        if (targetTeam) {
          // Find existing handoff task or create new one
          const existingHandoffs = await ctx.db
            .query("deliverableHandoffs")
            .withIndex("by_source_task", (q: any) =>
              q.eq("sourceTaskId", task._id)
            )
            .collect();
          const alreadyHandedOff = existingHandoffs.some(
            (h: any) => h.targetTeamId === task.handoffTargetTeamId
          );

          if (!alreadyHandedOff) {
            const targetAssigneeId = targetTeam.leadId;

            // Build note with creative copy + caption
            const handoffNote = [
              task.creativeCopy ? `Creative Copy:\n${task.creativeCopy}` : "",
              task.caption ? `Caption:\n${task.caption}` : "",
            ]
              .filter(Boolean)
              .join("\n\n");

            // Build reference links from deliverable
            const referenceLinks: string[] = [];
            if (deliverable.link) referenceLinks.push(deliverable.link);
            if (deliverable.fileIds) {
              for (const fid of deliverable.fileIds) {
                const url = await ctx.storage.getUrl(fid);
                if (url) referenceLinks.push(url);
              }
            }

            // Create handoff task in the same brief
            const existingTasks = await ctx.db
              .query("tasks")
              .withIndex("by_assignee_sort", (q) =>
                q.eq("assigneeId", targetAssigneeId)
              )
              .collect();
            const maxOrder = existingTasks.length
              ? Math.max(...existingTasks.map((t) => t.sortOrder))
              : 0;

            const handoffTaskId = await ctx.db.insert("tasks", {
              briefId: task.briefId,
              title: `[Design] ${task.title}`,
              description: handoffNote || `Design handoff for: ${task.title}`,
              assigneeId: targetAssigneeId,
              assignedBy: userId,
              status: "pending",
              sortOrder: maxOrder + 1000,
              creativeCopy: task.creativeCopy,
              caption: task.caption,
              handoffSourceTaskId: task._id,
              ...(task.platform ? { platform: task.platform } : {}),
              ...(task.contentType ? { contentType: task.contentType } : {}),
              ...(task.postDate ? { postDate: task.postDate } : {}),
              ...(task.deadline ? { deadline: task.deadline } : {}),
              ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
            });

            // Record the handoff
            await ctx.db.insert("deliverableHandoffs", {
              sourceDeliverableId: deliverableId,
              sourceTaskId: task._id,
              sourceBriefId: task.briefId,
              targetTaskId: handoffTaskId,
              targetBriefId: task.briefId,
              targetTeamId: task.handoffTargetTeamId,
              handedOffBy: userId,
              handedOffAt: now,
              note: handoffNote || undefined,
            });

            // Ensure target team is linked to brief
            const existingBriefTeams = await ctx.db
              .query("briefTeams")
              .withIndex("by_brief", (q: any) =>
                q.eq("briefId", task.briefId)
              )
              .collect();
            if (
              !existingBriefTeams.some(
                (bt: any) => bt.teamId === task.handoffTargetTeamId
              )
            ) {
              await ctx.db.insert("briefTeams", {
                briefId: task.briefId,
                teamId: task.handoffTargetTeamId!,
              });
            }

            // Notify the design team member
            await ctx.db.insert("notifications", {
              recipientId: targetAssigneeId,
              type: "task_assigned",
              title: "Design handoff received",
              message: `Creative copy for "${task.title}" has been approved and assigned to you for design.`,
              briefId: task.briefId,
              taskId: handoffTaskId,
              triggeredBy: userId,
              read: false,
              createdAt: now,
            });
          }
        }
      }
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

    {
      const updates: Record<string, any> = {
        changesCount: (subTask.changesCount ?? 0) + 1,
      };
      if (subTask.status === "review") {
        updates.status = "in-progress";
      }
      await ctx.db.patch(deliverable.taskId, updates);
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
      // Check if ALL creative-slot deliverables are approved before marking task done
      const allTaskDeliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      const allApproved = allTaskDeliverables.every((d) => d.status === "approved");

      if (allApproved) {
        if (task.clientFacing) {
          await ctx.db.patch(deliverable.taskId, { status: "review" });
          await syncSingleTaskBriefStatus(ctx, task.briefId, "review");
        } else {
          await ctx.db.patch(deliverable.taskId, {
            status: "done",
            completedAt: Date.now(),
          });
          await syncSingleTaskBriefStatus(ctx, task.briefId, "done");
        }
        // Propagate deliverable resources to downstream connected tasks in master brief
        await propagateResourcesToDownstreamTasks(ctx, task._id, task.briefId);
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

    if (task) {
      const updates: Record<string, any> = {
        changesCount: (task.changesCount ?? 0) + 1,
      };
      if (task.status === "review") {
        updates.status = "in-progress";
      }
      await ctx.db.patch(deliverable.taskId, updates);
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

// ─── DELIVERABLE HANDOFF (cross-team pipeline) ──────────

/** Open tasks for an assignee on a brief — pick when handing off to an existing task (master briefs). */
export const listHandoffCandidateTasks = query({
  args: {
    briefId: v.id("briefs"),
    assigneeId: v.id("users"),
  },
  handler: async (ctx, { briefId, assigneeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const brief = await ctx.db.get(briefId);
    if (!brief) return [];

    const user = await ctx.db.get(userId);
    let authorized = user?.role === "admin";
    if (!authorized && brief.brandId) {
      authorized = await isBrandManager(ctx, userId, brief.brandId);
    }
    if (!authorized) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief_assignee", (q) => q.eq("briefId", briefId).eq("assigneeId", assigneeId))
      .collect();

    return tasks
      .filter((t) => t.status !== "done")
      .map((t) => ({
        _id: t._id,
        title: t.title,
        status: t.status,
        deadline: t.deadline,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const handoffDeliverable = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    targetTeamId: v.id("teams"),
    targetAssigneeId: v.id("users"),
    deadline: v.optional(v.number()),
    note: v.optional(v.string()),
    /** Attach deliverable refs to this task instead of creating or reusing a handoff task (master briefs). */
    targetExistingTaskId: v.optional(v.id("tasks")),
    /** When true, always create a new handoff task even if one exists for this source task + team. */
    forceNewHandoffTask: v.optional(v.boolean()),
    newTaskTitle: v.optional(v.string()),
    newTaskDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const {
      deliverableId,
      targetTeamId,
      targetAssigneeId,
      deadline,
      note,
      targetExistingTaskId,
      forceNewHandoffTask,
      newTaskTitle,
      newTaskDescription,
    } = args;
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");

    if (deliverable.status === "rejected") {
      throw new Error("Cannot hand off a rejected deliverable");
    }

    // Fully approved, client-approved, OR team-lead approved and received by brand manager
    // (Brand Deliverables UI offers handoff after “Receive for review” before final Approve.)
    const canHandoff =
      deliverable.status === "approved" ||
      deliverable.clientStatus === "client_approved" ||
      (deliverable.teamLeadStatus === "approved" &&
        deliverable.passedToManagerAt != null);
    if (!canHandoff) {
      throw new Error(
        "Deliverable must be approved by the team lead and received for review, or fully approved, before handoff"
      );
    }

    const sourceTask = await ctx.db.get(deliverable.taskId);
    if (!sourceTask) throw new Error("Source task not found");
    const sourceBrief = await ctx.db.get(sourceTask.briefId);
    if (!sourceBrief) throw new Error("Source brief not found");

    if (targetExistingTaskId && sourceBrief.briefType === "single_task") {
      throw new Error(
        "Cannot attach to an existing task when handing off from a single-task brief. Use create new task instead."
      );
    }

    // Authorization: admin or brand manager
    const user = await ctx.db.get(userId);
    let authorized = user?.role === "admin";
    if (!authorized && sourceBrief.brandId) {
      authorized = await isBrandManager(ctx, userId, sourceBrief.brandId);
    }
    if (!authorized) throw new Error("Only admins or brand managers can hand off deliverables");

    const targetTeam = await ctx.db.get(targetTeamId);
    if (!targetTeam) throw new Error("Target team not found");

    const assigneeOnTeam = await ctx.db
      .query("userTeams")
      .withIndex("by_user_team", (q: any) =>
        q.eq("userId", targetAssigneeId).eq("teamId", targetTeamId)
      )
      .first();
    if (!assigneeOnTeam) {
      throw new Error("Selected user is not on the target team");
    }

    // Determine whether to create task in same brief or new brief
    const isSingleTask = sourceBrief.briefType === "single_task";
    let targetBriefId: any;

    if (isSingleTask) {
      // Create a new single_task brief
      const allBriefs = await ctx.db.query("briefs").collect();
      const globalPriority = allBriefs.length + 1;

      targetBriefId = await ctx.db.insert("briefs", {
        title: `${sourceBrief.title} → ${targetTeam.name} Handoff`,
        description: `Handoff from "${sourceBrief.title}". ${note ?? ""}`.trim(),
        status: "active",
        briefType: "single_task",
        createdBy: userId,
        assignedManagerId: sourceBrief.assignedManagerId,
        globalPriority,
        brandId: sourceBrief.brandId,
        ...(deadline ? { deadline } : {}),
      });

      // Link the target team to the new brief
      await ctx.db.insert("briefTeams", { briefId: targetBriefId, teamId: targetTeamId });
    } else {
      // For master briefs, create task within the same brief
      targetBriefId = sourceBrief._id;

      // Ensure team is linked to the brief
      const existingBriefTeams = await ctx.db
        .query("briefTeams")
        .withIndex("by_brief", (q: any) => q.eq("briefId", targetBriefId))
        .collect();
      const teamAlreadyLinked = existingBriefTeams.some((bt: any) => bt.teamId === targetTeamId);
      if (!teamAlreadyLinked) {
        await ctx.db.insert("briefTeams", { briefId: targetBriefId, teamId: targetTeamId });
      }
    }

    // Build reference links from the source deliverable
    const referenceLinks: string[] = [];
    if (deliverable.link) referenceLinks.push(deliverable.link);

    // Get file URLs from source deliverable
    let sourceFileIds: any[] = [];
    let sourceFileNames: string[] = [];
    if (deliverable.fileIds && deliverable.fileIds.length > 0) {
      sourceFileIds = deliverable.fileIds;
      sourceFileNames = deliverable.fileNames ?? deliverable.fileIds.map(() => "file");
      for (let i = 0; i < deliverable.fileIds.length; i++) {
        const url = await ctx.storage.getUrl(deliverable.fileIds[i]);
        if (url) referenceLinks.push(url);
      }
    }

    // Check if a handoff task already exists for the same source task + target team
    // (prevents duplication when handing off multiple creative deliverables)
    const existingHandoffs = await ctx.db
      .query("deliverableHandoffs")
      .withIndex("by_source_task", (q: any) => q.eq("sourceTaskId", sourceTask._id))
      .collect();
    const existingHandoffForTeam = existingHandoffs.find(
      (h: any) => h.targetTeamId === targetTeamId && h.targetBriefId === targetBriefId
    );

    let targetTaskId: any;
    /** Auto-merge into the handoff task created for this source + team */
    let reusedHandoffTask = false;
    /** User chose an arbitrary existing task on the brief */
    let attachedToChosenTask = false;

    if (targetExistingTaskId) {
      const chosen = await ctx.db.get(targetExistingTaskId);
      if (!chosen) throw new Error("Target task not found");
      if (chosen.assigneeId !== targetAssigneeId) {
        throw new Error("That task is not assigned to the selected team member");
      }
      if (chosen.briefId !== targetBriefId) {
        throw new Error("Task must belong to this brief");
      }
      if (chosen.status === "done") {
        throw new Error("Cannot attach to a completed task");
      }
      targetTaskId = targetExistingTaskId;
      attachedToChosenTask = true;
      const existingLinks = chosen.referenceLinks ?? [];
      const newLinks = referenceLinks.filter((l: string) => !existingLinks.includes(l));
      if (newLinks.length > 0) {
        await ctx.db.patch(targetTaskId, {
          referenceLinks: [...existingLinks, ...newLinks],
        });
      }
    } else if (existingHandoffForTeam && !forceNewHandoffTask) {
      const existingTask = await ctx.db.get(existingHandoffForTeam.targetTaskId);
      if (existingTask && existingTask.status !== "done") {
        targetTaskId = existingHandoffForTeam.targetTaskId;
        reusedHandoffTask = true;
        const existingLinks = existingTask.referenceLinks ?? [];
        const newLinks = referenceLinks.filter((l: string) => !existingLinks.includes(l));
        if (newLinks.length > 0) {
          await ctx.db.patch(targetTaskId, {
            referenceLinks: [...existingLinks, ...newLinks],
          });
        }
      }
    }

    if (!targetTaskId) {
      // Calculate sort order for the new task
      const existingTasks = await ctx.db
        .query("tasks")
        .withIndex("by_assignee_sort", (q: any) => q.eq("assigneeId", targetAssigneeId))
        .collect();
      const maxOrder = existingTasks.length
        ? Math.max(...existingTasks.map((t: any) => t.sortOrder))
        : 0;

      const defaultDescription = `Handed off from "${sourceTask.title}"${
        sourceBrief.title !== sourceTask.title ? ` (${sourceBrief.title})` : ""
      }.\n\n${note ?? ""}${deliverable.message ? `\n\nOriginal deliverable note: ${deliverable.message}` : ""}`.trim();

      const title =
        newTaskTitle?.trim() && newTaskTitle.trim().length > 0
          ? newTaskTitle.trim()
          : `[Handoff] ${sourceTask.title}`;
      const description =
        newTaskDescription?.trim() && newTaskDescription.trim().length > 0
          ? `${newTaskDescription.trim()}\n\n---\n${defaultDescription}`
          : defaultDescription;

      targetTaskId = await ctx.db.insert("tasks", {
        briefId: targetBriefId,
        title,
        description,
        assigneeId: targetAssigneeId,
        assignedBy: userId,
        status: "pending",
        sortOrder: maxOrder + 1000,
        ...(deadline ? { deadline } : {}),
        ...(sourceTask.clientFacing ? { clientFacing: true } : {}),
        ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
        assignedAt: Date.now(),
        sourceDeliverableId: deliverableId,
        handoffSourceTaskId: sourceTask._id,
      });
    }

    const shouldNotifyAssignee = !reusedHandoffTask;

    // Record the handoff
    await ctx.db.insert("deliverableHandoffs", {
      sourceDeliverableId: deliverableId,
      sourceTaskId: sourceTask._id,
      sourceBriefId: sourceBrief._id,
      targetTaskId,
      targetBriefId,
      targetTeamId,
      handedOffBy: userId,
      handedOffAt: Date.now(),
      note,
    });

    if (shouldNotifyAssignee) {
      const taskRow = (await ctx.db.get(targetTaskId)) as { title?: string } | null;
      const taskLabel = taskRow?.title ?? sourceTask.title;
      await ctx.db.insert("notifications", {
        recipientId: targetAssigneeId,
        type: "task_assigned",
        title: attachedToChosenTask ? "Deliverable added to your task" : "Handoff task assigned",
        message: attachedToChosenTask
          ? `${user?.name ?? "Someone"} handed off a deliverable from "${sourceTask.title}" to your task "${taskLabel}"`
          : `${user?.name ?? "Someone"} handed off "${sourceTask.title}" to you for ${targetTeam.name}`,
        briefId: targetBriefId,
        taskId: targetTaskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });

      if (targetTeam.leadId && targetTeam.leadId !== userId && targetTeam.leadId !== targetAssigneeId) {
        await ctx.db.insert("notifications", {
          recipientId: targetTeam.leadId,
          type: "team_added",
          title: attachedToChosenTask ? "Deliverable handoff" : "Handoff task added to your team",
          message: attachedToChosenTask
            ? `"${sourceTask.title}": deliverable handed off to ${targetTeam.name}`
            : `"${sourceTask.title}" was handed off to ${targetTeam.name}`,
          briefId: targetBriefId,
          taskId: targetTaskId,
          triggeredBy: userId,
          read: false,
          createdAt: Date.now(),
        });
      }
    }

    // Activity log
    await ctx.db.insert("activityLog", {
      briefId: sourceBrief._id,
      taskId: sourceTask._id,
      userId,
      action: "deliverable_handed_off",
      details: JSON.stringify({
        targetTeam: targetTeam.name,
        targetAssigneeId,
        targetTaskId,
        targetBriefId,
        note,
      }),
      timestamp: Date.now(),
    });

    return { targetTaskId, targetBriefId };
  },
});

export const getHandoffHistory = query({
  args: { taskId: v.optional(v.id("tasks")), deliverableId: v.optional(v.id("deliverables")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let handoffs: any[] = [];
    if (args.taskId) {
      const asSource = await ctx.db
        .query("deliverableHandoffs")
        .withIndex("by_source_task", (q) => q.eq("sourceTaskId", args.taskId!))
        .collect();
      const asTarget = await ctx.db
        .query("deliverableHandoffs")
        .withIndex("by_target_task", (q) => q.eq("targetTaskId", args.taskId!))
        .collect();
      handoffs = [...asSource, ...asTarget];
    } else if (args.deliverableId) {
      handoffs = await ctx.db
        .query("deliverableHandoffs")
        .withIndex("by_source_deliverable", (q) => q.eq("sourceDeliverableId", args.deliverableId!))
        .collect();
    }

    const users = await ctx.db.query("users").collect();
    const teams = await ctx.db.query("teams").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const briefs = await ctx.db.query("briefs").collect();

    return handoffs.map((h: any) => {
      const handedOffByUser = users.find((u) => u._id === h.handedOffBy);
      const team = teams.find((t) => t._id === h.targetTeamId);
      const sourceTask = tasks.find((t) => t._id === h.sourceTaskId);
      const targetTask = tasks.find((t) => t._id === h.targetTaskId);
      const sourceBrief = briefs.find((b) => b._id === h.sourceBriefId);
      const targetBrief = briefs.find((b) => b._id === h.targetBriefId);
      return {
        ...h,
        handedOffByName: handedOffByUser?.name ?? handedOffByUser?.email ?? "Unknown",
        targetTeamName: team?.name ?? "Unknown",
        sourceTaskTitle: sourceTask?.title ?? "Unknown",
        targetTaskTitle: targetTask?.title ?? "Unknown",
        targetTaskStatus: targetTask?.status ?? "unknown",
        sourceBriefTitle: sourceBrief?.title ?? "Unknown",
        targetBriefTitle: targetBrief?.title ?? "Unknown",
      };
    });
  },
});
