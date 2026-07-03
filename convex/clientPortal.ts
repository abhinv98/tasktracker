import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireClient, requireInternalUser, ClientUser } from "./lib/guards";
import {
  applyClientApproval,
  applyClientChangesRequested,
  applyClientDenial,
} from "./lib/clientReview";

// ═══════════════════════════════════════════════════════════
// CLIENT PORTAL — authenticated per-brand client dashboard.
// One active portal link per brand; client logins (role "client",
// users.clientBrandId) are the only way in. Merges the legacy
// JSR + intake token pages into a single sidebar dashboard.
// ═══════════════════════════════════════════════════════════

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/** "YYYY-MM" bucket in the app's timezone (IST). */
function monthKeyFromTimestamp(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(ts))
    .substring(0, 7);
}

function taskMonthKey(task: Doc<"tasks">): string {
  if (task.postDate) return task.postDate.substring(0, 7);
  if (task.deadline) return monthKeyFromTimestamp(task.deadline);
  return monthKeyFromTimestamp(task._creationTime);
}

async function getActivePortalForBrand(
  ctx: QueryCtx | MutationCtx,
  brandId: Id<"brands">
): Promise<Doc<"clientPortals"> | null> {
  return await ctx.db
    .query("clientPortals")
    .withIndex("by_brand_active", (q) => q.eq("brandId", brandId).eq("isActive", true))
    .first();
}

/** Non-archived briefs + their tasks for a brand (same scan approach as jsr.ts). */
async function brandBriefsAndTasks(ctx: QueryCtx | MutationCtx, brandId: Id<"brands">) {
  const briefs = await ctx.db.query("briefs").collect();
  const brandBriefs = briefs.filter((b) => b.brandId === brandId && b.status !== "archived");
  const briefIds = new Set(brandBriefs.map((b) => b._id));
  const allTasks = await ctx.db.query("tasks").collect();
  const brandTasks = allTasks.filter((t) => briefIds.has(t.briefId));
  return { brandBriefs, brandTasks };
}

/** Walk deliverable → task → brief and assert it belongs to the client's brand. */
async function getDeliverableInBrand(
  ctx: MutationCtx | QueryCtx,
  deliverableId: Id<"deliverables">,
  brandId: Id<"brands">
) {
  const deliverable = await ctx.db.get(deliverableId);
  if (!deliverable) throw new Error("Deliverable not found");
  const task = await ctx.db.get(deliverable.taskId);
  if (!task) throw new Error("Task not found");
  const brief = await ctx.db.get(task.briefId);
  if (!brief || brief.brandId !== brandId) throw new Error("Not authorized");
  return { deliverable, task, brief };
}

/** Walk task → brief and assert it belongs to the client's brand. */
async function getTaskInBrand(
  ctx: MutationCtx | QueryCtx,
  taskId: Id<"tasks">,
  brandId: Id<"brands">
) {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("Task not found");
  const brief = await ctx.db.get(task.briefId);
  if (!brief || brief.brandId !== brandId) throw new Error("Not authorized");
  return { task, brief };
}

/** Deliverable file links (Convex storage + R2), same shape the JSR page renders. */
async function deliverableFiles(ctx: QueryCtx | MutationCtx, d: Doc<"deliverables">) {
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
  if (d.r2FileKeys && d.r2FileKeys.length > 0) {
    files = [
      ...files,
      ...d.r2FileKeys.map((key, idx) => ({
        name: d.r2FileNames?.[idx] ?? "file",
        url: `/api/r2-file?key=${encodeURIComponent(key)}`,
      })),
    ];
  }
  return files;
}

function remarkShape(r: Doc<"jsrRemarks">) {
  return {
    _id: r._id,
    senderType: r.senderType,
    senderName: r.senderName,
    content: r.content,
    createdAt: r.createdAt,
  };
}

/** Server-side client activity row — the internal "who did what" trail. */
async function logClientActivity(
  ctx: MutationCtx,
  client: ClientUser,
  action: string,
  extra?: {
    details?: Record<string, unknown>;
    taskId?: Id<"tasks">;
    deliverableId?: Id<"deliverables">;
    deckItemId?: Id<"clientDeckItems">;
    clientTaskId?: Id<"jsrClientTasks">;
  }
) {
  await ctx.db.insert("clientActivity", {
    brandId: client.clientBrandId,
    clientUserId: client._id,
    action,
    details: extra?.details ? JSON.stringify(extra.details) : undefined,
    taskId: extra?.taskId,
    deliverableId: extra?.deliverableId,
    deckItemId: extra?.deckItemId,
    clientTaskId: extra?.clientTaskId,
    createdAt: Date.now(),
  });
}

/** Notify brand managers + super admins (same fan-out as legacy addClientTask). */
async function notifyBrandTeam(
  ctx: MutationCtx,
  brandId: Id<"brands">,
  payload: {
    type: Doc<"notifications">["type"];
    title: string;
    message: string;
    briefId?: Id<"briefs">;
    taskId?: Id<"tasks">;
    triggeredBy: Id<"users">;
  }
) {
  const brandManagers = await ctx.db
    .query("brandManagers")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId))
    .collect();
  const allUsers = await ctx.db.query("users").collect();
  const superAdmins = allUsers.filter((u) => u.isSuperAdmin === true);

  const recipientIds = new Set<Id<"users">>();
  for (const sa of superAdmins) recipientIds.add(sa._id);
  for (const bm of brandManagers) recipientIds.add(bm.managerId);

  for (const recipientId of recipientIds) {
    await ctx.db.insert("notifications", {
      recipientId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      briefId: payload.briefId,
      taskId: payload.taskId,
      triggeredBy: payload.triggeredBy,
      read: false,
      createdAt: Date.now(),
    });
  }
}

// ═══════════════════════════════════════════════════════════
// ADMIN — portal management (brand page "Client Portal" tab)
// ═══════════════════════════════════════════════════════════

/** Generate the brand's portal link. Only one active at a time — deactivates any existing. */
export const generatePortalLink = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const user = await requireAdmin(ctx);

    const existing = await ctx.db
      .query("clientPortals")
      .withIndex("by_brand_active", (q) => q.eq("brandId", brandId).eq("isActive", true))
      .collect();
    for (const portal of existing) {
      await ctx.db.patch(portal._id, { isActive: false, deactivatedAt: Date.now() });
    }

    return await ctx.db.insert("clientPortals", {
      brandId,
      token: generateToken(),
      isActive: true,
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

export const getActivePortal = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    await requireAdmin(ctx);
    return await getActivePortalForBrand(ctx, brandId);
  },
});

export const deactivatePortal = mutation({
  args: { portalId: v.id("clientPortals") },
  handler: async (ctx, { portalId }) => {
    await requireAdmin(ctx);
    // No cascade deletes — remarks, requests and activity survive re-activation.
    await ctx.db.patch(portalId, { isActive: false, deactivatedAt: Date.now() });
  },
});

export const updatePortalConfig = mutation({
  args: {
    brandId: v.id("brands"),
    hiddenTabs: v.optional(v.array(v.string())),
    calendarMonth: v.optional(v.string()),
  },
  handler: async (ctx, { brandId, hiddenTabs, calendarMonth }) => {
    await requireAdmin(ctx);
    const portal = await getActivePortalForBrand(ctx, brandId);
    if (!portal) throw new Error("No active portal for this brand");
    await ctx.db.patch(portal._id, {
      ...(hiddenTabs !== undefined ? { hiddenTabs } : {}),
      ...(calendarMonth !== undefined ? { calendarMonth: calendarMonth || undefined } : {}),
    });
  },
});

/** Internal "who did what" feed for a brand's portal clients. */
export const listClientActivity = query({
  args: { brandId: v.id("brands"), limit: v.optional(v.number()) },
  handler: async (ctx, { brandId, limit }) => {
    await requireInternalUser(ctx);
    const rows = await ctx.db
      .query("clientActivity")
      .withIndex("by_brand_time", (q) => q.eq("brandId", brandId))
      .order("desc")
      .take(limit ?? 50);

    const userIds = [...new Set(rows.map((r) => r.clientUserId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const nameById = new Map(
      users.filter(Boolean).map((u) => [u!._id, u!.name ?? u!.email ?? "Client"])
    );

    return rows.map((r) => ({
      _id: r._id,
      action: r.action,
      details: r.details,
      clientName: nameById.get(r.clientUserId) ?? "Removed client",
      createdAt: r.createdAt,
    }));
  },
});

export const addDeckItem = mutation({
  args: {
    brandId: v.id("brands"),
    title: v.string(),
    url: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("clientDeckItems")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    return await ctx.db.insert("clientDeckItems", {
      ...args,
      approvalStatus: args.requiresApproval ? "pending_client" : undefined,
      isVisible: true,
      sortOrder: existing.length,
      createdBy: user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateDeckItem = mutation({
  args: {
    deckItemId: v.id("clientDeckItems"),
    title: v.optional(v.string()),
    url: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    isVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, { deckItemId, ...patch }) => {
    await requireAdmin(ctx);
    const item = await ctx.db.get(deckItemId);
    if (!item) throw new Error("Deck item not found");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) updates[k] = val;
    }
    // Toggling approval on resets the review; toggling off clears it.
    if (patch.requiresApproval === true && !item.requiresApproval) {
      updates.approvalStatus = "pending_client";
      updates.approvalNote = undefined;
      updates.reviewedByClientId = undefined;
      updates.reviewedAt = undefined;
    } else if (patch.requiresApproval === false && item.requiresApproval) {
      updates.approvalStatus = undefined;
    }
    await ctx.db.patch(deckItemId, updates);
  },
});

export const deleteDeckItem = mutation({
  args: { deckItemId: v.id("clientDeckItems") },
  handler: async (ctx, { deckItemId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(deckItemId);
  },
});

/** Admin/manager view of all deck items for a brand (incl. hidden). */
export const listDeckItems = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    await requireInternalUser(ctx);
    const items = await ctx.db
      .query("clientDeckItems")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const reviewerIds = [...new Set(items.map((i) => i.reviewedByClientId).filter(Boolean))];
    const reviewers = await Promise.all(reviewerIds.map((id) => ctx.db.get(id!)));
    const nameById = new Map(
      reviewers.filter(Boolean).map((u) => [u!._id, u!.name ?? u!.email ?? "Client"])
    );
    return items
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((i) => ({
        ...i,
        reviewedByName: i.reviewedByClientId ? nameById.get(i.reviewedByClientId) ?? null : null,
      }));
  },
});

/** Manager reply on a task-level remark thread. */
export const addManagerTaskRemark = mutation({
  args: { taskId: v.id("tasks"), content: v.string() },
  handler: async (ctx, { taskId, content }) => {
    const user = await requireInternalUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const brief = await ctx.db.get(task.briefId);
    if (!brief?.brandId) throw new Error("Task has no brand");

    await ctx.db.insert("jsrRemarks", {
      taskId,
      brandId: brief.brandId,
      senderType: "manager",
      senderName: user.name ?? user.email ?? "Manager",
      senderId: user._id,
      content,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════
// PUBLIC — branded login screen (token only, no data beyond branding)
// ═══════════════════════════════════════════════════════════

export const getPortalPublicInfo = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const portal = await ctx.db
      .query("clientPortals")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!portal) return null;

    const brand = await ctx.db.get(portal.brandId);
    if (!brand) return null;

    return {
      isActive: portal.isActive,
      brandName: brand.name,
      brandColor: brand.color,
      logoUrl: brand.logoId ? await ctx.storage.getUrl(brand.logoId) : null,
    };
  },
});

// ═══════════════════════════════════════════════════════════
// CLIENT — authenticated portal (all guarded by requireClient,
// all data scoped to the client's own brand)
// ═══════════════════════════════════════════════════════════

/** Layout bootstrap: identity, brand, portal config and sidebar badge counts. */
export const getPortalSession = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const brand = await ctx.db.get(client.clientBrandId);
    if (!brand) return null;
    const portal = await getActivePortalForBrand(ctx, client.clientBrandId);

    // Sidebar badge counts
    const { brandTasks } = await brandBriefsAndTasks(ctx, client.clientBrandId);
    const taskIds = new Set(brandTasks.map((t) => t._id));
    const allDeliverables = await ctx.db.query("deliverables").collect();
    const pendingApprovals = allDeliverables.filter(
      (d) => d.clientStatus === "pending_client" && taskIds.has(d.taskId)
    ).length;
    const inputRequests = brandTasks.filter(
      (t) => t.clientFacing && t.needsClientInput
    ).length;
    const deckItems = await ctx.db
      .query("clientDeckItems")
      .withIndex("by_brand", (q) => q.eq("brandId", client.clientBrandId))
      .collect();
    const pendingDeck = deckItems.filter(
      (i) => i.isVisible && i.requiresApproval && i.approvalStatus === "pending_client"
    ).length;

    return {
      user: { _id: client._id, name: client.name, email: client.email },
      brand: {
        _id: brand._id,
        name: brand.name,
        color: brand.color,
        logoUrl: brand.logoId ? await ctx.storage.getUrl(brand.logoId) : null,
      },
      portalActive: !!portal,
      hiddenTabs: portal?.hiddenTabs ?? [],
      calendarMonth: portal?.calendarMonth ?? "",
      pendingCounts: {
        clientPending: pendingApprovals + inputRequests + pendingDeck,
        deck: pendingDeck,
      },
    };
  },
});

/** Client-fired events (login / tab views). Everything else is logged server-side. */
export const logPortalEvent = mutation({
  args: { action: v.string(), details: v.optional(v.string()) },
  handler: async (ctx, { action, details }) => {
    const client = await requireClient(ctx);
    if (action !== "login" && action !== "view_tab") {
      throw new Error("Unsupported event");
    }
    // Dedupe: skip if the same user+action+details fired within 30 minutes.
    const recent = await ctx.db
      .query("clientActivity")
      .withIndex("by_user", (q) => q.eq("clientUserId", client._id))
      .order("desc")
      .take(20);
    const cutoff = Date.now() - 30 * 60 * 1000;
    if (recent.some((r) => r.action === action && r.details === details && r.createdAt > cutoff)) {
      return;
    }
    await ctx.db.insert("clientActivity", {
      brandId: client.clientBrandId,
      clientUserId: client._id,
      action,
      details,
      createdAt: Date.now(),
    });
  },
});

/**
 * JSR Track — the classic Job Status Report, keyed by the client's brand.
 * Ported from jsr.getJsrByToken with month keys and task-level remark threads.
 */
export const getJsrTrack = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const brandId = client.clientBrandId;
    const { brandBriefs, brandTasks } = await brandBriefsAndTasks(ctx, brandId);

    const ccBriefIds = new Set(
      brandBriefs.filter((b) => b.briefType === "content_calendar").map((b) => b._id)
    );
    const regularTasks = brandTasks.filter((t) => !ccBriefIds.has(t.briefId));

    const taskDeadlines = brandTasks
      .map((t) => t.deadline)
      .filter((d): d is number => d !== undefined);
    const internalDeadline = taskDeadlines.length > 0 ? Math.max(...taskDeadlines) : null;

    const internalSummary = {
      total: brandTasks.length,
      pending: brandTasks.filter((t) => t.status === "pending").length,
      inProgress: brandTasks.filter((t) => t.status === "in-progress").length,
      review: brandTasks.filter((t) => t.status === "review").length,
      done: brandTasks.filter((t) => t.status === "done").length,
      internalDeadline,
    };

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const allRemarks = await ctx.db
      .query("jsrRemarks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const taskDeliverableMap: Record<string, unknown[]> = {};
    for (const t of brandTasks) {
      if (t.status !== "done") continue;
      const dels = allDeliverables.filter((d) => d.taskId === t._id);
      if (dels.length === 0) continue;
      taskDeliverableMap[t._id] = await Promise.all(
        dels.map(async (d) => ({
          _id: d._id,
          message: d.message,
          link: d.link,
          status: d.status,
          submittedAt: d.submittedAt,
          files: await deliverableFiles(ctx, d),
          remarks: allRemarks
            .filter((r) => r.deliverableId === d._id)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(remarkShape),
        }))
      );
    }

    // Tasks grouped by brief, each task carrying its month key + remark thread
    const briefGroups: Record<
      string,
      { briefTitle: string; briefStatus: string; tasks: unknown[] }
    > = {};
    for (const t of regularTasks) {
      const brief = brandBriefs.find((b) => b._id === t.briefId);
      if (!briefGroups[t.briefId]) {
        briefGroups[t.briefId] = {
          briefTitle: brief?.title ?? "Untitled",
          briefStatus: brief?.status ?? "active",
          tasks: [],
        };
      }
      briefGroups[t.briefId].tasks.push({
        _id: t._id,
        title: t.title,
        status: t.status,
        deadline: t.deadline,
        monthKey: taskMonthKey(t),
        remarks: allRemarks
          .filter((r) => r.taskId === t._id)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(remarkShape),
        ...(taskDeliverableMap[t._id] ? { deliverables: taskDeliverableMap[t._id] } : {}),
      });
    }

    // Recent activity (same label mapping as the legacy JSR page)
    const briefIds = brandBriefs.map((b) => b._id);
    const allActivity = await ctx.db.query("activityLog").collect();
    const brandActivity = allActivity
      .filter((a) => briefIds.includes(a.briefId))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
    const recentActivity = brandActivity.map((a) => {
      const brief = brandBriefs.find((b) => b._id === a.briefId);
      let label = a.action;
      if (a.action === "changed_status" && a.details) {
        try { const d = JSON.parse(a.details); label = `Status → ${d.status}`; } catch {}
      } else if (a.action === "created_task") {
        try { const d = JSON.parse(a.details!); label = `Task created: ${d.title}`; } catch { label = "Task created"; }
      } else if (a.action === "reassigned_task") {
        label = "Task reassigned";
      } else if (a.action === "updated_task") {
        label = "Task updated";
      } else if (a.action === "deleted_task") {
        label = "Task removed";
      }
      return { label, briefTitle: brief?.title ?? "", timestamp: a.timestamp };
    });

    // Brand-level message thread (shared with legacy links)
    const messages = await ctx.db
      .query("jsrMessages")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    return {
      internalSummary,
      tasksByBrief: Object.values(briefGroups),
      recentActivity,
      lastUpdated: brandActivity.length > 0 ? brandActivity[0].timestamp : null,
      overallDeadline: internalDeadline,
      messages: messages
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((m) => ({
          _id: m._id,
          senderType: m.senderType,
          senderName: m.senderName,
          content: m.content,
          createdAt: m.createdAt,
        })),
    };
  },
});

/** Content Calendar — content_calendar-brief tasks grouped by month. */
export const getContentCalendar = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const portal = await getActivePortalForBrand(ctx, client.clientBrandId);
    const { brandBriefs, brandTasks } = await brandBriefsAndTasks(ctx, client.clientBrandId);

    const ccBriefIds = new Set(
      brandBriefs.filter((b) => b.briefType === "content_calendar").map((b) => b._id)
    );
    const calendarTasks = brandTasks.filter((t) => ccBriefIds.has(t.briefId));

    const entries = calendarTasks.map((t) => ({
      _id: t._id,
      title: t.title,
      platform: t.platform ?? "",
      contentType: t.contentType ?? "",
      postDate: t.postDate ?? "",
      status: t.status,
      monthKey: t.postDate ? t.postDate.substring(0, 7) : "unscheduled",
    }));

    const months = [...new Set(entries.map((e) => e.monthKey))].sort();

    return {
      entries,
      months,
      pinnedMonth: portal?.calendarMonth ?? "",
    };
  },
});

/** Client Deck — visible admin-shared links, with approval state. */
export const getDeckItems = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const items = await ctx.db
      .query("clientDeckItems")
      .withIndex("by_brand", (q) => q.eq("brandId", client.clientBrandId))
      .collect();
    return items
      .filter((i) => i.isVisible)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((i) => ({
        _id: i._id,
        title: i.title,
        url: i.url,
        description: i.description,
        category: i.category,
        requiresApproval: i.requiresApproval,
        approvalStatus: i.approvalStatus,
        approvalNote: i.approvalNote,
        reviewedAt: i.reviewedAt,
        createdAt: i.createdAt,
      }));
  },
});

export const approveDeckItem = mutation({
  args: { deckItemId: v.id("clientDeckItems") },
  handler: async (ctx, { deckItemId }) => {
    const client = await requireClient(ctx);
    const item = await ctx.db.get(deckItemId);
    if (!item || item.brandId !== client.clientBrandId) throw new Error("Not authorized");
    if (!item.requiresApproval || item.approvalStatus !== "pending_client")
      throw new Error("Item is not pending approval");

    await ctx.db.patch(deckItemId, {
      approvalStatus: "client_approved",
      approvalNote: undefined,
      reviewedByClientId: client._id,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const clientName = client.name ?? client.email ?? "Client";
    await logClientActivity(ctx, client, "approve_deck", {
      deckItemId,
      details: { title: item.title },
    });
    await notifyBrandTeam(ctx, client.clientBrandId, {
      type: "deck_approved",
      title: "Client approved document",
      message: `${clientName} approved "${item.title}"`,
      triggeredBy: client._id,
    });
  },
});

export const requestDeckChanges = mutation({
  args: { deckItemId: v.id("clientDeckItems"), note: v.string() },
  handler: async (ctx, { deckItemId, note }) => {
    const client = await requireClient(ctx);
    const item = await ctx.db.get(deckItemId);
    if (!item || item.brandId !== client.clientBrandId) throw new Error("Not authorized");
    if (!item.requiresApproval || item.approvalStatus !== "pending_client")
      throw new Error("Item is not pending approval");

    await ctx.db.patch(deckItemId, {
      approvalStatus: "client_changes_requested",
      approvalNote: note,
      reviewedByClientId: client._id,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const clientName = client.name ?? client.email ?? "Client";
    await logClientActivity(ctx, client, "request_deck_changes", {
      deckItemId,
      details: { title: item.title, note },
    });
    await notifyBrandTeam(ctx, client.clientBrandId, {
      type: "deck_changes_requested",
      title: "Client requested changes on document",
      message: `${clientName} requested changes on "${item.title}": ${note}`,
      triggeredBy: client._id,
    });
  },
});

/** New Task — portal version of the intake form. Feeds the same /client-requests queue. */
export const submitTaskRequest = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    proposedDeadline: v.optional(v.number()),
    references: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("image"),
            v.literal("document"),
            v.literal("video"),
            v.literal("link")
          ),
          name: v.optional(v.string()),
          url: v.optional(v.string()),
          fileKey: v.optional(v.string()),
          contentType: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const client = await requireClient(ctx);
    const portal = await getActivePortalForBrand(ctx, client.clientBrandId);
    if (!portal) throw new Error("Portal is not active");

    const clientName = client.name ?? client.email ?? "Client";
    const requestId = await ctx.db.insert("jsrClientTasks", {
      brandId: client.clientBrandId,
      portalId: portal._id,
      submittedByClientId: client._id,
      title: args.title,
      description: args.description,
      proposedDeadline: args.proposedDeadline,
      references: args.references,
      status: "pending_review",
      clientName,
      createdAt: Date.now(),
    });

    const brand = await ctx.db.get(client.clientBrandId);
    await logClientActivity(ctx, client, "submit_request", {
      clientTaskId: requestId,
      details: { title: args.title },
    });
    await notifyBrandTeam(ctx, client.clientBrandId, {
      type: "jsr_task_added",
      title: "New client request",
      message: `Client (${clientName}) added a task "${args.title}" for ${brand?.name ?? "Unknown"}`,
      triggeredBy: client._id,
    });

    return requestId;
  },
});

/** The brand's request list (shared across the brand's client users). */
export const listMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const tasks = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_brand", (q) => q.eq("brandId", client.clientBrandId))
      .collect();
    return tasks
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((t) => ({
        _id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        proposedDeadline: t.proposedDeadline,
        // Only reveal the committed date once we've accepted the request.
        finalDeadline: t.status === "pending_review" ? undefined : t.finalDeadline,
        referenceCount: (t.references ?? []).length,
        clientName: t.clientName,
        createdAt: t.createdAt,
        monthKey: monthKeyFromTimestamp(t.createdAt),
      }));
  },
});

/** Monthly Log — completed work bucketed by month. */
export const getMonthlyLog = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const { brandBriefs, brandTasks } = await brandBriefsAndTasks(ctx, client.clientBrandId);

    const doneTasks = brandTasks.filter((t) => t.status === "done");
    const allDeliverables = await ctx.db.query("deliverables").collect();

    const entries = doneTasks.map((t) => {
      const brief = brandBriefs.find((b) => b._id === t.briefId);
      const completedAt = t.completedAt ?? t.deadline ?? t._creationTime;
      return {
        _id: t._id,
        title: t.title,
        briefTitle: brief?.title ?? "",
        completedAt,
        monthKey: monthKeyFromTimestamp(completedAt),
        deliverableCount: allDeliverables.filter((d) => d.taskId === t._id).length,
      };
    });

    const months = [...new Set(entries.map((e) => e.monthKey))].sort().reverse();
    return { entries: entries.sort((a, b) => b.completedAt - a.completedAt), months };
  },
});

/** Client Pending Work — everything waiting on the CLIENT. */
export const getClientPendingWork = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const { brandBriefs, brandTasks } = await brandBriefsAndTasks(ctx, client.clientBrandId);
    const taskById = new Map(brandTasks.map((t) => [t._id, t]));

    // Deliverables awaiting client approval
    const allDeliverables = await ctx.db.query("deliverables").collect();
    const pendingDeliverables = await Promise.all(
      allDeliverables
        .filter((d) => d.clientStatus === "pending_client" && taskById.has(d.taskId))
        .map(async (d) => {
          const task = taskById.get(d.taskId)!;
          const brief = brandBriefs.find((b) => b._id === task.briefId);
          return {
            deliverableId: d._id,
            taskId: task._id,
            taskTitle: task.title,
            taskDescription: task.description ?? "",
            briefTitle: brief?.title ?? "",
            message: d.message,
            link: d.link,
            files: await deliverableFiles(ctx, d),
            sentToClientAt: d.sentToClientAt,
          };
        })
    );

    // Tasks where the team asked the client for input
    const inputRequests = brandTasks
      .filter((t) => t.clientFacing && t.needsClientInput)
      .map((t) => {
        const brief = brandBriefs.find((b) => b._id === t.briefId);
        return {
          _id: t._id,
          title: t.title,
          briefTitle: brief?.title ?? "",
          clientInputMessage: t.clientInputMessage ?? "",
          status: t.status,
        };
      });

    // Deck items awaiting approval
    const deckItems = await ctx.db
      .query("clientDeckItems")
      .withIndex("by_brand", (q) => q.eq("brandId", client.clientBrandId))
      .collect();
    const pendingDeck = deckItems
      .filter((i) => i.isVisible && i.requiresApproval && i.approvalStatus === "pending_client")
      .map((i) => ({ _id: i._id, title: i.title, url: i.url, category: i.category }));

    return { pendingDeliverables, inputRequests, pendingDeck };
  },
});

/** Ecultify Pending Work — everything in flight on the agency side, by month. */
export const getEcultifyPendingWork = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const { brandBriefs, brandTasks } = await brandBriefsAndTasks(ctx, client.clientBrandId);

    const openTasks = brandTasks
      .filter((t) => t.status === "pending" || t.status === "in-progress" || t.status === "review")
      .map((t) => {
        const brief = brandBriefs.find((b) => b._id === t.briefId);
        return {
          _id: t._id,
          title: t.title,
          status: t.status,
          briefTitle: brief?.title ?? "",
          deadline: t.deadline,
          monthKey: taskMonthKey(t),
        };
      });

    // Accepted client requests not yet completed
    const requests = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_brand", (q) => q.eq("brandId", client.clientBrandId))
      .collect();
    const openRequests = requests
      .filter((r) => r.status === "accepted" || r.status === "in_progress")
      .map((r) => ({
        _id: r._id,
        title: r.title,
        status: r.status,
        finalDeadline: r.finalDeadline,
        monthKey: monthKeyFromTimestamp(r.finalDeadline ?? r.createdAt),
      }));

    const months = [
      ...new Set([...openTasks.map((t) => t.monthKey), ...openRequests.map((r) => r.monthKey)]),
    ].sort();

    return { openTasks, openRequests, months };
  },
});

/** Deliverable review — portal versions with real identity. */
export const approveDeliverable = mutation({
  args: { deliverableId: v.id("deliverables"), note: v.optional(v.string()) },
  handler: async (ctx, { deliverableId, note }) => {
    const client = await requireClient(ctx);
    await getDeliverableInBrand(ctx, deliverableId, client.clientBrandId);
    const clientName = client.name ?? client.email ?? "Client";
    const task = await applyClientApproval(ctx, {
      deliverableId,
      brandId: client.clientBrandId,
      note,
      reviewerName: clientName,
    });
    await logClientActivity(ctx, client, "approve_deliverable", {
      deliverableId,
      taskId: task?._id,
      details: { taskTitle: task?.title, note },
    });
  },
});

export const requestChanges = mutation({
  args: { deliverableId: v.id("deliverables"), note: v.string() },
  handler: async (ctx, { deliverableId, note }) => {
    const client = await requireClient(ctx);
    await getDeliverableInBrand(ctx, deliverableId, client.clientBrandId);
    const clientName = client.name ?? client.email ?? "Client";
    const task = await applyClientChangesRequested(ctx, {
      deliverableId,
      brandId: client.clientBrandId,
      note,
      reviewerName: clientName,
    });
    await logClientActivity(ctx, client, "request_changes", {
      deliverableId,
      taskId: task?._id,
      details: { taskTitle: task?.title, note },
    });
  },
});

export const denyDeliverable = mutation({
  args: { deliverableId: v.id("deliverables"), note: v.string() },
  handler: async (ctx, { deliverableId, note }) => {
    const client = await requireClient(ctx);
    await getDeliverableInBrand(ctx, deliverableId, client.clientBrandId);
    const clientName = client.name ?? client.email ?? "Client";
    const task = await applyClientDenial(ctx, {
      deliverableId,
      brandId: client.clientBrandId,
      note,
      reviewerName: clientName,
    });
    await logClientActivity(ctx, client, "deny_deliverable", {
      deliverableId,
      taskId: task?._id,
      details: { taskTitle: task?.title, note },
    });
  },
});

/** Comment threads — task-level and deliverable-level, with real identity. */
export const addTaskRemark = mutation({
  args: { taskId: v.id("tasks"), content: v.string() },
  handler: async (ctx, { taskId, content }) => {
    const client = await requireClient(ctx);
    const { task } = await getTaskInBrand(ctx, taskId, client.clientBrandId);
    const clientName = client.name ?? client.email ?? "Client";

    await ctx.db.insert("jsrRemarks", {
      taskId,
      brandId: client.clientBrandId,
      senderType: "client",
      senderName: clientName,
      senderId: client._id,
      content,
      createdAt: Date.now(),
    });

    await logClientActivity(ctx, client, "add_remark", {
      taskId,
      details: { taskTitle: task.title, note: content.slice(0, 200) },
    });
    await notifyBrandTeam(ctx, client.clientBrandId, {
      type: "comment",
      title: "Client commented on a task",
      message: `${clientName} commented on "${task.title}": ${content.slice(0, 140)}`,
      briefId: task.briefId,
      taskId,
      triggeredBy: client._id,
    });
  },
});

export const addDeliverableRemark = mutation({
  args: { deliverableId: v.id("deliverables"), content: v.string() },
  handler: async (ctx, { deliverableId, content }) => {
    const client = await requireClient(ctx);
    const { task } = await getDeliverableInBrand(ctx, deliverableId, client.clientBrandId);
    const clientName = client.name ?? client.email ?? "Client";

    await ctx.db.insert("jsrRemarks", {
      deliverableId,
      brandId: client.clientBrandId,
      senderType: "client",
      senderName: clientName,
      senderId: client._id,
      content,
      createdAt: Date.now(),
    });

    await logClientActivity(ctx, client, "add_remark", {
      deliverableId,
      taskId: task._id,
      details: { taskTitle: task.title, note: content.slice(0, 200) },
    });
    await notifyBrandTeam(ctx, client.clientBrandId, {
      type: "comment",
      title: "Client commented on a deliverable",
      message: `${clientName} commented on "${task.title}": ${content.slice(0, 140)}`,
      briefId: task.briefId,
      taskId: task._id,
      triggeredBy: client._id,
    });
  },
});

/** Brand-level message from the client (shared thread with legacy JSR). */
export const sendPortalMessage = mutation({
  args: { content: v.string() },
  handler: async (ctx, { content }) => {
    const client = await requireClient(ctx);
    const portal = await getActivePortalForBrand(ctx, client.clientBrandId);
    if (!portal) throw new Error("Portal is not active");

    await ctx.db.insert("jsrMessages", {
      brandId: client.clientBrandId,
      portalId: portal._id,
      senderType: "client",
      senderName: client.name ?? client.email ?? "Client",
      senderId: client._id,
      content,
      createdAt: Date.now(),
    });
  },
});

/** Feedback Log — merged history of everything the client has flagged. */
export const getFeedbackLog = query({
  args: {},
  handler: async (ctx) => {
    const client = await requireClient(ctx);
    const brandId = client.clientBrandId;
    const { brandTasks } = await brandBriefsAndTasks(ctx, brandId);
    const taskById = new Map(brandTasks.map((t) => [t._id, t]));

    type FeedbackEntry = {
      kind: "feedback" | "remark" | "deliverable_changes" | "deck_changes";
      content: string;
      authorName: string;
      context: string;
      createdAt: number;
    };
    const entries: FeedbackEntry[] = [];

    // Freeform feedback entries
    const feedback = await ctx.db
      .query("clientFeedback")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const authorIds = [...new Set(feedback.map((f) => f.clientUserId))];
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
    const authorById = new Map(
      authors.filter(Boolean).map((u) => [u!._id, u!.name ?? u!.email ?? "Client"])
    );
    for (const f of feedback) {
      const task = f.taskId ? taskById.get(f.taskId) : undefined;
      entries.push({
        kind: "feedback",
        content: f.content,
        authorName: authorById.get(f.clientUserId) ?? "Client",
        context: task ? `Task: ${task.title}` : "General feedback",
        createdAt: f.createdAt,
      });
    }

    // Client comments (task + deliverable threads)
    const remarks = await ctx.db
      .query("jsrRemarks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const allDeliverables = await ctx.db.query("deliverables").collect();
    for (const r of remarks) {
      if (r.senderType !== "client") continue;
      let context = "Comment";
      if (r.taskId && taskById.has(r.taskId)) {
        context = `Task: ${taskById.get(r.taskId)!.title}`;
      } else if (r.deliverableId) {
        const d = allDeliverables.find((x) => x._id === r.deliverableId);
        const task = d ? taskById.get(d.taskId) : undefined;
        context = task ? `Deliverable on: ${task.title}` : "Deliverable comment";
      }
      entries.push({
        kind: "remark",
        content: r.content,
        authorName: r.senderName ?? "Client",
        context,
        createdAt: r.createdAt,
      });
    }

    // Deliverable change requests / denials
    for (const d of allDeliverables) {
      if (!taskById.has(d.taskId)) continue;
      if (
        (d.clientStatus === "client_changes_requested" || d.clientStatus === "client_denied") &&
        d.clientNote
      ) {
        entries.push({
          kind: "deliverable_changes",
          content: d.clientNote,
          authorName: "Client",
          context: `${d.clientStatus === "client_denied" ? "Denied" : "Changes requested"}: ${taskById.get(d.taskId)!.title}`,
          createdAt: d.clientReviewedAt ?? d.submittedAt,
        });
      }
    }

    // Deck change requests
    const deckItems = await ctx.db
      .query("clientDeckItems")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    for (const i of deckItems) {
      if (i.approvalStatus === "client_changes_requested" && i.approvalNote) {
        entries.push({
          kind: "deck_changes",
          content: i.approvalNote,
          authorName: i.reviewedByClientId
            ? authorById.get(i.reviewedByClientId) ?? "Client"
            : "Client",
          context: `Document: ${i.title}`,
          createdAt: i.reviewedAt ?? i.updatedAt,
        });
      }
    }

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const submitFeedback = mutation({
  args: { content: v.string(), taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, { content, taskId }) => {
    const client = await requireClient(ctx);
    if (taskId) await getTaskInBrand(ctx, taskId, client.clientBrandId);

    await ctx.db.insert("clientFeedback", {
      brandId: client.clientBrandId,
      clientUserId: client._id,
      content,
      taskId,
      createdAt: Date.now(),
    });

    const clientName = client.name ?? client.email ?? "Client";
    await logClientActivity(ctx, client, "submit_feedback", {
      taskId,
      details: { note: content.slice(0, 200) },
    });
    await notifyBrandTeam(ctx, client.clientBrandId, {
      type: "client_feedback",
      title: "New client feedback",
      message: `${clientName}: ${content.slice(0, 140)}`,
      taskId,
      triggeredBy: client._id,
    });
  },
});
