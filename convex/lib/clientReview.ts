import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { syncSingleTaskBriefStatus, syncMultiTaskBriefStatus } from "./syncBriefStatus";

/**
 * Shared bodies for the client deliverable-review actions (approve / request
 * changes / deny). Called from both the legacy token-gated jsr.ts mutations
 * and the authenticated portal mutations so status sync, notifications and
 * activity logging stay identical.
 */

async function getPendingDeliverable(
  ctx: MutationCtx,
  deliverableId: Id<"deliverables">
): Promise<Doc<"deliverables">> {
  const deliverable = await ctx.db.get(deliverableId);
  if (!deliverable || deliverable.clientStatus !== "pending_client") {
    throw new Error("Deliverable not pending client review");
  }
  return deliverable;
}

async function getBrandManagers(ctx: MutationCtx, brandId: Id<"brands">) {
  return await ctx.db
    .query("brandManagers")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId))
    .collect();
}

export async function applyClientApproval(
  ctx: MutationCtx,
  args: {
    deliverableId: Id<"deliverables">;
    brandId: Id<"brands">;
    note?: string;
    reviewerName?: string;
  }
): Promise<Doc<"tasks"> | null> {
  const { deliverableId, brandId, note, reviewerName } = args;
  const deliverable = await getPendingDeliverable(ctx, deliverableId);

  await ctx.db.patch(deliverableId, {
    clientStatus: "client_approved",
    clientNote: note ?? (reviewerName ? `Approved by ${reviewerName}` : "Approved by client"),
    clientReviewedAt: Date.now(),
  });

  const task = await ctx.db.get(deliverable.taskId);
  if (!task) return null;

  await ctx.db.patch(task._id, { status: "done", completedAt: Date.now() });
  await syncSingleTaskBriefStatus(ctx, task.briefId, "done");
  await syncMultiTaskBriefStatus(ctx, task.briefId, task._id);

  const brief = await ctx.db.get(task.briefId);
  const brand = await ctx.db.get(brandId);
  const brandManagers = await getBrandManagers(ctx, brandId);
  for (const bm of brandManagers) {
    await ctx.db.insert("notifications", {
      recipientId: bm.managerId,
      type: "client_approved",
      title: "Client approved deliverable",
      message: `Client approved "${task.title}"${reviewerName ? ` (by ${reviewerName})` : ""}`,
      briefId: task.briefId,
      taskId: task._id,
      triggeredBy: bm.managerId,
      read: false,
      createdAt: Date.now(),
    });
  }

  await ctx.db.insert("activityLog", {
    briefId: task.briefId,
    taskId: task._id,
    userId: brandManagers[0]?.managerId ?? task.assignedBy,
    action: "client_approved",
    details: JSON.stringify({ taskTitle: task.title, briefTitle: brief?.title, brandName: brand?.name }),
    timestamp: Date.now(),
  });

  return task;
}

export async function applyClientChangesRequested(
  ctx: MutationCtx,
  args: {
    deliverableId: Id<"deliverables">;
    brandId: Id<"brands">;
    note: string;
    reviewerName?: string;
  }
): Promise<Doc<"tasks"> | null> {
  const { deliverableId, brandId, note } = args;
  const deliverable = await getPendingDeliverable(ctx, deliverableId);

  // Reset the whole internal review pipeline so the deliverable goes back
  // through team-lead/manager review after rework.
  await ctx.db.patch(deliverableId, {
    clientStatus: "client_changes_requested",
    clientNote: note,
    clientReviewedAt: Date.now(),
    status: "pending",
    teamLeadStatus: undefined,
    teamLeadReviewedBy: undefined,
    teamLeadReviewNote: undefined,
    teamLeadReviewedAt: undefined,
    passedToManagerBy: undefined,
    passedToManagerAt: undefined,
    reviewedBy: undefined,
    reviewNote: undefined,
    reviewedAt: undefined,
    sentToClientAt: undefined,
    sentToClientBy: undefined,
  });

  const task = await ctx.db.get(deliverable.taskId);
  if (!task) return null;

  await ctx.db.patch(task._id, { status: "in-progress" });

  const brandManagers = await getBrandManagers(ctx, brandId);
  for (const bm of brandManagers) {
    await ctx.db.insert("notifications", {
      recipientId: bm.managerId,
      type: "client_changes_requested",
      title: "Client requested changes",
      message: `Client requested changes on "${task.title}": ${note}`,
      briefId: task.briefId,
      taskId: task._id,
      triggeredBy: bm.managerId,
      read: false,
      createdAt: Date.now(),
    });
  }
  await ctx.db.insert("notifications", {
    recipientId: task.assigneeId,
    type: "client_changes_requested",
    title: "Client requested changes",
    message: `Client requested changes on "${task.title}": ${note}`,
    briefId: task.briefId,
    taskId: task._id,
    triggeredBy: task.assigneeId,
    read: false,
    createdAt: Date.now(),
  });

  await ctx.db.insert("activityLog", {
    briefId: task.briefId,
    taskId: task._id,
    userId: brandManagers[0]?.managerId ?? task.assignedBy,
    action: "client_changes_requested",
    details: JSON.stringify({ taskTitle: task.title, note }),
    timestamp: Date.now(),
  });

  return task;
}

export async function applyClientDenial(
  ctx: MutationCtx,
  args: {
    deliverableId: Id<"deliverables">;
    brandId: Id<"brands">;
    note: string;
    reviewerName?: string;
  }
): Promise<Doc<"tasks"> | null> {
  const { deliverableId, brandId, note } = args;
  const deliverable = await getPendingDeliverable(ctx, deliverableId);

  await ctx.db.patch(deliverableId, {
    clientStatus: "client_denied",
    clientNote: note,
    clientReviewedAt: Date.now(),
  });

  const task = await ctx.db.get(deliverable.taskId);
  if (!task) return null;

  const brandManagers = await getBrandManagers(ctx, brandId);
  for (const bm of brandManagers) {
    await ctx.db.insert("notifications", {
      recipientId: bm.managerId,
      type: "client_denied",
      title: "Client denied deliverable",
      message: `Client denied "${task.title}": ${note}`,
      briefId: task.briefId,
      taskId: task._id,
      triggeredBy: bm.managerId,
      read: false,
      createdAt: Date.now(),
    });
  }

  await ctx.db.insert("activityLog", {
    briefId: task.briefId,
    taskId: task._id,
    userId: brandManagers[0]?.managerId ?? task.assignedBy,
    action: "client_denied",
    details: JSON.stringify({ taskTitle: task.title, note }),
    timestamp: Date.now(),
  });

  return task;
}
