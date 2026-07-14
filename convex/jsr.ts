import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  applyClientApproval,
  applyClientChangesRequested,
  applyClientDenial,
} from "./lib/clientReview";
import {
  getOrCreateCalendarBrief,
  ensureSheetForMonth,
} from "./contentCalendar";
import type { Id } from "./_generated/dataModel";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export const generateJsrLink = mutation({
  args: {
    brandId: v.id("brands"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can generate JSR links");

    const token = generateToken();
    return await ctx.db.insert("jsrLinks", {
      brandId: args.brandId,
      token,
      createdBy: userId,
      createdAt: Date.now(),
      isActive: true,
      label: args.label,
    });
  },
});

export const listJsrLinks = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    return await ctx.db
      .query("jsrLinks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
  },
});

export const updateJsrHiddenSections = mutation({
  args: {
    brandId: v.id("brands"),
    hiddenSections: v.array(v.string()),
  },
  handler: async (ctx, { brandId, hiddenSections }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const activeLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const link of activeLinks) {
      await ctx.db.patch(link._id, { hiddenSections });
    }
  },
});

export const updateJsrCalendarMonth = mutation({
  args: {
    brandId: v.id("brands"),
    calendarMonth: v.string(),
  },
  handler: async (ctx, { brandId, calendarMonth }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const activeLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const link of activeLinks) {
      await ctx.db.patch(link._id, { calendarMonth: calendarMonth || undefined });
    }
  },
});

export const deactivateJsrLink = mutation({
  args: {
    jsrLinkId: v.id("jsrLinks"),
    deleteTasks: v.optional(v.boolean()),
  },
  handler: async (ctx, { jsrLinkId, deleteTasks }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    await ctx.db.patch(jsrLinkId, { isActive: false });

    const jsrMessages = await ctx.db
      .query("jsrMessages")
      .withIndex("by_jsr_link", (q) => q.eq("jsrLinkId", jsrLinkId))
      .collect();
    for (const msg of jsrMessages) {
      await ctx.db.delete(msg._id);
    }

    const jsrLink = await ctx.db.get(jsrLinkId);
    if (jsrLink) {
      const otherActiveLinks = await ctx.db
        .query("jsrLinks")
        .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
        .filter((q) => q.and(q.eq(q.field("isActive"), true), q.neq(q.field("_id"), jsrLinkId)))
        .collect();
      // Don't wipe remark threads if the brand's authenticated portal is live —
      // portal comments share this table.
      const activePortal = await ctx.db
        .query("clientPortals")
        .withIndex("by_brand_active", (q) =>
          q.eq("brandId", jsrLink.brandId).eq("isActive", true)
        )
        .first();
      if (otherActiveLinks.length === 0 && !activePortal) {
        const jsrRemarks = await ctx.db
          .query("jsrRemarks")
          .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
          .collect();
        for (const remark of jsrRemarks) {
          await ctx.db.delete(remark._id);
        }
      }
    }

    if (deleteTasks) {
      const clientTasks = await ctx.db
        .query("jsrClientTasks")
        .withIndex("by_jsr_link", (q) => q.eq("jsrLinkId", jsrLinkId))
        .collect();

      for (const ct of clientTasks) {
        if (ct.linkedTaskId) {
          const realTask = await ctx.db.get(ct.linkedTaskId);
          if (realTask) {
            await ctx.db.delete(ct.linkedTaskId);
          }
        }
        await ctx.db.delete(ct._id);
      }
    }
  },
});

// Public query - no auth required, validated by token
export const getJsrByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive) return null;

    const brand = await ctx.db.get(jsrLink.brandId);
    if (!brand) return null;

    const briefs = await ctx.db.query("briefs").collect();
    const brandBriefs = briefs.filter(
      (b) => b.brandId === jsrLink.brandId && b.status !== "archived"
    );

    const allTasks = await ctx.db.query("tasks").collect();
    const internalTasks = allTasks.filter((t) =>
      brandBriefs.some((b) => b._id === t.briefId)
    );

    // Split tasks: regular tasks vs content calendar tasks
    const ccBriefIds = new Set(
      brandBriefs.filter((b) => b.briefType === "content_calendar").map((b) => b._id)
    );
    const regularTasks = internalTasks.filter((t) => !ccBriefIds.has(t.briefId));
    const calendarTasks = internalTasks.filter((t) => ccBriefIds.has(t.briefId));

    // Cumulative deadline = latest deadline among ALL internal tasks
    const taskDeadlines = internalTasks
      .map((t) => t.deadline)
      .filter((d): d is number => d !== undefined);
    const internalDeadline =
      taskDeadlines.length > 0 ? Math.max(...taskDeadlines) : null;

    const internalSummary = {
      total: internalTasks.length,
      pending: internalTasks.filter((t) => t.status === "pending").length,
      inProgress: internalTasks.filter((t) => t.status === "in-progress").length,
      review: internalTasks.filter((t) => t.status === "review").length,
      done: internalTasks.filter((t) => t.status === "done").length,
      internalDeadline,
    };

    // Fetch deliverables and remarks for completed tasks
    const allDeliverables = await ctx.db.query("deliverables").collect();
    const allRemarks = await ctx.db
      .query("jsrRemarks")
      .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
      .collect();

    const taskDeliverableMap: Record<string, any[]> = {};
    for (const t of internalTasks) {
      if (t.status !== "done") continue;
      const dels = allDeliverables.filter((d) => d.taskId === t._id);
      if (dels.length === 0) continue;
      taskDeliverableMap[t._id] = await Promise.all(
        dels.map(async (d) => {
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
            const r2Files = d.r2FileKeys.map((key, idx) => ({
              name: d.r2FileNames?.[idx] ?? "file",
              url: `/api/r2-file?key=${encodeURIComponent(key)}`,
            }));
            files = [...files, ...r2Files];
          }
          const remarks = allRemarks
            .filter((r) => r.deliverableId === d._id)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((r) => ({
              _id: r._id,
              senderType: r.senderType,
              senderName: r.senderName,
              content: r.content,
              createdAt: r.createdAt,
            }));
          return {
            _id: d._id,
            message: d.message,
            link: d.link,
            status: d.status,
            submittedAt: d.submittedAt,
            files,
            remarks,
          };
        })
      );
    }

    // Tasks grouped by brief for client view
    const briefGroups: Record<string, { briefTitle: string; briefStatus: string; tasks: { _id: string; title: string; status: string; deliverables?: any[] }[] }> = {};
    for (const t of regularTasks) {
      const brief = brandBriefs.find((b) => b._id === t.briefId);
      const key = t.briefId;
      if (!briefGroups[key]) {
        briefGroups[key] = {
          briefTitle: brief?.title ?? "Untitled",
          briefStatus: brief?.status ?? "active",
          tasks: [],
        };
      }
      briefGroups[key].tasks.push({
        _id: t._id,
        title: t.title,
        status: t.status,
        ...(taskDeliverableMap[t._id] ? { deliverables: taskDeliverableMap[t._id] } : {}),
      });
    }
    const tasksByBrief = Object.values(briefGroups);

    // Flat task list (for backward compat)
    const taskList = regularTasks.map((t) => {
      const brief = brandBriefs.find((b) => b._id === t.briefId);
      return { _id: t._id, title: t.title, status: t.status, briefTitle: brief?.title ?? "" };
    });

    // Content calendar entries — title, platform, postDate, status.
    // This token page is client-facing: curated post title wins over raw.
    const calendarList = calendarTasks.map((t) => ({
      _id: t._id,
      title: t.postTitle?.trim() ? t.postTitle : t.title,
      postDescription: t.postDescription ?? null,
      platform: t.platform ?? "",
      contentType: t.contentType ?? "",
      postDate: t.postDate ?? "",
      status: t.status,
    }));

    // Recent activity — last 5 status changes across brand briefs
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
      return {
        label,
        briefTitle: brief?.title ?? "",
        timestamp: a.timestamp,
      };
    });

    const lastUpdated = brandActivity.length > 0 ? brandActivity[0].timestamp : null;

    const overallDeadline = internalDeadline;

    // Messages
    const messages = await ctx.db
      .query("jsrMessages")
      .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
      .collect();
    const sortedMessages = messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({
        _id: m._id,
        senderType: m.senderType,
        senderName: m.senderName,
        content: m.content,
        createdAt: m.createdAt,
      }));

    // Ecultify Requests: tasks flagged as needing client input
    const ecultifyRequests = internalTasks
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

    // Ready for Review: deliverables with clientStatus === "pending_client"
    const readyForReview = await Promise.all(
      allDeliverables
        .filter((d) => d.clientStatus === "pending_client")
        .filter((d) => internalTasks.some((t) => t._id === d.taskId))
        .map(async (d) => {
          const task = internalTasks.find((t) => t._id === d.taskId);
          const brief = task ? brandBriefs.find((b) => b._id === task.briefId) : null;
          let files: { name: string; url: string }[] = [];
          if (d.fileIds && d.fileIds.length > 0) {
            files = (await Promise.all(
              d.fileIds.map(async (fileId, idx) => {
                const url = await ctx.storage.getUrl(fileId);
                return { name: d.fileNames?.[idx] ?? "file", url: url ?? "" };
              })
            )).filter((f) => f.url);
          }
          if (d.r2FileKeys && d.r2FileKeys.length > 0) {
            const r2Files = d.r2FileKeys.map((key, idx) => ({
              name: d.r2FileNames?.[idx] ?? "file",
              url: `/api/r2-file?key=${encodeURIComponent(key)}`,
            }));
            files = [...files, ...r2Files];
          }
          return {
            deliverableId: d._id,
            taskId: task?._id ?? "",
            taskTitle: task?.title ?? "",
            taskDescription: task?.description ?? "",
            briefTitle: brief?.title ?? "",
            message: d.message,
            link: d.link,
            files,
            sentToClientAt: d.sentToClientAt,
          };
        })
    );

    return {
      brand: {
        name: brand.name,
        color: brand.color,
        description: brand.description,
        logoUrl: brand.logoId ? await ctx.storage.getUrl(brand.logoId) : null,
      },
      internalSummary,
      tasksByBrief,
      taskList,
      calendarList,
      recentActivity,
      lastUpdated,
      overallDeadline,
      messages: sortedMessages,
      ecultifyRequests,
      readyForReview,
      hiddenSections: jsrLink.hiddenSections ?? [],
      calendarMonth: jsrLink.calendarMonth ?? "",
    };
  },
});

// Public mutation - no auth required, validated by token
export const addClientTask = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    proposedDeadline: v.optional(v.number()),
    clientName: v.optional(v.string()),
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
  handler: async (ctx, { token, ...taskData }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive)
      throw new Error("Invalid or inactive intake link");

    const taskId = await ctx.db.insert("jsrClientTasks", {
      brandId: jsrLink.brandId,
      jsrLinkId: jsrLink._id,
      title: taskData.title,
      description: taskData.description,
      proposedDeadline: taskData.proposedDeadline,
      references: taskData.references,
      status: "pending_review",
      clientName: taskData.clientName,
      createdAt: Date.now(),
    });

    // Notify brand managers + super admins (not all admins)
    const brandManagers = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
      .collect();
    const allUsers = await ctx.db.query("users").collect();
    const superAdmins = allUsers.filter((u) => u.isSuperAdmin === true);
    const brand = await ctx.db.get(jsrLink.brandId);
    const brandName = brand?.name ?? "Unknown";

    const recipientIds = new Set<string>();
    for (const sa of superAdmins) recipientIds.add(sa._id);
    for (const bm of brandManagers) recipientIds.add(bm.managerId);

    // Use the JSR link creator as triggeredBy since there's no auth user
    for (const recipientId of recipientIds) {
      await ctx.db.insert("notifications", {
        recipientId: recipientId as any,
        type: "jsr_task_added",
        title: "New client request",
        message: `Client${taskData.clientName ? ` (${taskData.clientName})` : ""} added a task "${taskData.title}" for ${brandName}`,
        triggeredBy: jsrLink.createdBy,
        read: false,
        createdAt: Date.now(),
      });
    }

    return taskId;
  },
});

export const listClientTasks = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const tasks = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const users = await ctx.db.query("users").collect();
    const result = [];
    for (const task of tasks) {
      let assigneeName: string | null = null;
      let assigneeId: string | null = null;
      if (task.linkedTaskId) {
        const realTask = await ctx.db.get(task.linkedTaskId);
        if (realTask) {
          assigneeId = realTask.assigneeId;
          const assignee = users.find((u) => u._id === realTask.assigneeId);
          assigneeName = assignee?.name ?? assignee?.email ?? null;
        }
      }
      result.push({ ...task, assigneeName, assigneeId });
    }
    return result;
  },
});

export const reassignClientTask = mutation({
  args: {
    clientTaskId: v.id("jsrClientTasks"),
    assigneeId: v.id("users"),
  },
  handler: async (ctx, { clientTaskId, assigneeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    const clientTask = await ctx.db.get(clientTaskId);
    if (!clientTask) throw new Error("Task not found");
    if (!clientTask.linkedTaskId) throw new Error("Task has not been accepted yet");

    await ctx.db.patch(clientTask.linkedTaskId, { assigneeId, assignedBy: userId });
    // Track the assignment explicitly so the Client Requests queue reflects it
    // regardless of the placeholder assignee used on accept.
    await ctx.db.patch(clientTaskId, { assignedTo: assigneeId });

    // Send notification to the assignee
    const brand = await ctx.db.get(clientTask.brandId);
    await ctx.db.insert("notifications", {
      recipientId: assigneeId,
      type: "task_assigned",
      title: "New task assigned",
      message: `You've been assigned "${clientTask.title}" from ${brand?.name ?? "Unknown"} client requests`,
      briefId: clientTask.linkedBriefId,
      taskId: clientTask.linkedTaskId,
      triggeredBy: userId,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const updateClientTaskDeadline = mutation({
  args: {
    taskId: v.id("jsrClientTasks"),
    finalDeadline: v.number(),
  },
  handler: async (ctx, { taskId, finalDeadline }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    await ctx.db.patch(taskId, { finalDeadline });

    // Sync deadline to linked real task
    const clientTask = await ctx.db.get(taskId);
    if (clientTask?.linkedTaskId) {
      await ctx.db.patch(clientTask.linkedTaskId, { deadline: finalDeadline });
    }
  },
});

/** Campaign briefs of a brand an accepted request can be routed into —
 *  everything except calendar and single-task briefs. */
export const listCampaignBriefsForBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const allBriefs = await ctx.db.query("briefs").collect();
    return allBriefs
      .filter(
        (b) =>
          b.brandId === brandId &&
          b.status !== "archived" &&
          b.briefType !== "content_calendar" &&
          b.briefType !== "single_task"
      )
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((b) => ({
        _id: b._id,
        title: b.title,
        briefType: b.briefType,
        status: b.status,
      }));
  },
});

/**
 * Accept a client request and route it to a destination:
 *  - existing_brief:      add the task into an existing campaign brief
 *  - new_campaign_brief:  create a campaign (flow-canvas) brief, task inside
 *  - individual_task:     create a single_task brief around the task
 *  - calendar:            create a calendar entry on the given postDate
 */
export const acceptClientRequest = mutation({
  args: {
    requestId: v.id("jsrClientTasks"),
    tag: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    destination: v.union(
      v.object({ kind: v.literal("existing_brief"), briefId: v.id("briefs") }),
      v.object({
        kind: v.literal("new_campaign_brief"),
        title: v.string(),
        description: v.optional(v.string()),
      }),
      v.object({ kind: v.literal("individual_task") }),
      v.object({
        kind: v.literal("calendar"),
        postDate: v.string(),
        platform: v.optional(v.string()),
        contentType: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { requestId, tag, assigneeId, destination }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");
    if (request.linkedTaskId) throw new Error("Already accepted");

    // Client references → links the assignee can open (R2 files via /api/r2-file).
    const referenceLinks = (request.references ?? [])
      .map((r) =>
        r.fileKey
          ? `/api/r2-file?key=${encodeURIComponent(r.fileKey)}`
          : r.url ?? null
      )
      .filter((u): u is string => !!u);

    const assignee = assigneeId ?? userId;
    let briefId: Id<"briefs">;
    let taskId: Id<"tasks">;

    if (destination.kind === "calendar") {
      briefId = await getOrCreateCalendarBrief(ctx, request.brandId, userId);
      await ensureSheetForMonth(
        ctx,
        briefId,
        destination.postDate.substring(0, 7),
        userId
      );
      const existingTasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      const maxOrder = existingTasks.length
        ? Math.max(...existingTasks.map((t) => t.sortOrder))
        : 0;
      taskId = await ctx.db.insert("tasks", {
        briefId,
        title: request.title,
        description: request.description,
        assigneeId: assignee,
        assignedBy: userId,
        status: "pending",
        sortOrder: maxOrder + 1000,
        duration: "1d",
        durationMinutes: 480,
        deadline: request.finalDeadline,
        platform: destination.platform ?? "TBD",
        contentType: destination.contentType ?? "Post",
        postDate: destination.postDate,
        ...(assigneeId ? { assignedAt: Date.now() } : {}),
        ...(tag?.trim() ? { tag: tag.trim() } : {}),
        ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
      });
    } else {
      // Resolve the target brief for the three non-calendar destinations.
      if (destination.kind === "existing_brief") {
        const brief = await ctx.db.get(destination.briefId);
        if (!brief || brief.brandId !== request.brandId)
          throw new Error("Brief not found for this brand");
        if (brief.status === "archived") throw new Error("Brief is archived");
        if (
          brief.briefType === "content_calendar" ||
          brief.briefType === "single_task"
        )
          throw new Error("Pick a campaign brief");
        briefId = brief._id;
      } else {
        const allBriefs = await ctx.db.query("briefs").collect();
        const maxPriority = allBriefs.length
          ? Math.max(...allBriefs.map((b) => b.globalPriority))
          : 0;
        const isCampaign = destination.kind === "new_campaign_brief";
        briefId = await ctx.db.insert("briefs", {
          title: isCampaign ? destination.title : request.title,
          description:
            (isCampaign ? destination.description : request.description) ?? "",
          status: "active",
          briefType: isCampaign ? "developmental" : "single_task",
          createdBy: userId,
          assignedManagerId: userId,
          globalPriority: maxPriority + 1,
          deadline: request.finalDeadline,
          brandId: request.brandId,
        });
        await ctx.db.insert("activityLog", {
          briefId,
          userId,
          action: "created_brief",
          details: `Created from client request: ${request.title}`,
          timestamp: Date.now(),
        });
      }

      const existingTasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      taskId = await ctx.db.insert("tasks", {
        briefId,
        title: request.title,
        description: request.description,
        assigneeId: assignee,
        assignedBy: userId,
        status: "pending",
        sortOrder: existingTasks.length,
        duration: "2 Hours",
        durationMinutes: 120,
        deadline: request.finalDeadline,
        ...(assigneeId ? { assignedAt: Date.now() } : {}),
        ...(tag?.trim() ? { tag: tag.trim() } : {}),
        ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
      });
    }

    await ctx.db.patch(requestId, {
      status: "accepted",
      acceptedDestination:
        destination.kind === "existing_brief" ||
        destination.kind === "new_campaign_brief"
          ? "campaign_brief"
          : destination.kind,
      linkedTaskId: taskId,
      linkedBriefId: briefId,
      heldAt: undefined,
      heldBy: undefined,
      // Client-visible status snapshot: from here on, internal status changes
      // stay hidden from the portal until explicitly published.
      publishedTaskStatus: "pending",
      ...(assigneeId ? { assignedTo: assigneeId } : {}),
    });

    if (assigneeId) {
      const brand = await ctx.db.get(request.brandId);
      await ctx.db.insert("notifications", {
        recipientId: assigneeId,
        type: "task_assigned",
        title: "New task assigned",
        message: `You've been assigned "${request.title}" from ${brand?.name ?? "Unknown"} client requests`,
        briefId,
        taskId,
        triggeredBy: userId,
        read: false,
        createdAt: Date.now(),
      });
    }

    return { taskId, briefId };
  },
});

/** Park a request in the visible On Hold bucket until a routing decision. */
export const holdClientRequest = mutation({
  args: { requestId: v.id("jsrClientTasks") },
  handler: async (ctx, { requestId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending_review")
      throw new Error("Only pending requests can be held");

    await ctx.db.patch(requestId, {
      status: "on_hold",
      heldAt: Date.now(),
      heldBy: userId,
    });
  },
});

/** Return a held request to the pending queue. */
export const resumeClientRequest = mutation({
  args: { requestId: v.id("jsrClientTasks") },
  handler: async (ctx, { requestId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "on_hold") throw new Error("Request is not on hold");

    await ctx.db.patch(requestId, {
      status: "pending_review",
      heldAt: undefined,
      heldBy: undefined,
    });
  },
});

export const updateClientTaskStatus = mutation({
  args: {
    taskId: v.id("jsrClientTasks"),
    status: v.union(
      v.literal("pending_review"),
      v.literal("accepted"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
    /** Category tag applied to the real task on accept (portal segregation). */
    tag: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, status, tag }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    const clientTask = await ctx.db.get(taskId);
    if (!clientTask) throw new Error("Task not found");

    await ctx.db.patch(taskId, { status });

    // LEGACY fallback: accepting without a routing destination lands in the
    // consolidated "{Brand} - Client Requests" brief. The current UI accepts
    // via acceptClientRequest instead; this branch only serves old clients
    // still running the previous frontend. Safe to delete once all frontends
    // are updated.
    if (status === "accepted" && !clientTask.linkedTaskId) {
      const brand = await ctx.db.get(clientTask.brandId);
      const brandName = brand?.name ?? "Unknown";
      const briefTitle = `${brandName} - Client Requests`;

      const allBriefs = await ctx.db.query("briefs").collect();
      const brief = allBriefs.find(
        (b) => b.brandId === clientTask.brandId && b.title === briefTitle && b.status !== "archived"
      );

      let briefId;
      if (brief) {
        briefId = brief._id;
      } else {
        const maxPriority = allBriefs.length > 0
          ? Math.max(...allBriefs.map((b) => b.globalPriority))
          : 0;
        briefId = await ctx.db.insert("briefs", {
          title: briefTitle,
          description: `Consolidated brief for client requests from ${brandName}`,
          status: "active",
          briefType: "developmental",
          createdBy: userId,
          assignedManagerId: userId,
          globalPriority: maxPriority + 1,
          deadline: clientTask.finalDeadline,
          brandId: clientTask.brandId,
        });
      }

      const existingTasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();

      const referenceLinks = (clientTask.references ?? [])
        .map((r) =>
          r.fileKey
            ? `/api/r2-file?key=${encodeURIComponent(r.fileKey)}`
            : r.url ?? null
        )
        .filter((u): u is string => !!u);

      const realTaskId = await ctx.db.insert("tasks", {
        briefId,
        title: clientTask.title,
        description: clientTask.description,
        assigneeId: userId,
        assignedBy: userId,
        status: "pending",
        sortOrder: existingTasks.length,
        duration: "2 Hours",
        durationMinutes: 120,
        deadline: clientTask.finalDeadline,
        ...(tag?.trim() ? { tag: tag.trim() } : {}),
        ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
      });

      await ctx.db.patch(taskId, { linkedTaskId: realTaskId, linkedBriefId: briefId });
    }

    // Tag can also be set/updated when re-acting on an already-linked request
    if (tag?.trim() && clientTask.linkedTaskId) {
      await ctx.db.patch(clientTask.linkedTaskId, { tag: tag.trim() });
    }

    // Sync status to linked real task if it exists
    if (clientTask.linkedTaskId) {
      const statusMap: Record<string, string> = {
        accepted: "pending",
        in_progress: "in-progress",
        completed: "done",
      };
      const mappedStatus = statusMap[status];
      if (mappedStatus) {
        await ctx.db.patch(clientTask.linkedTaskId, {
          status: mappedStatus as "pending" | "in-progress" | "review" | "done",
          ...(status === "completed" ? { completedAt: Date.now() } : {}),
        });
        // An explicit request-level status change IS a publish: the admin is
        // deliberately setting what the client should see.
        await ctx.db.patch(taskId, { publishedTaskStatus: mappedStatus });
      }
    }
  },
});

/** Push the linked task's CURRENT internal status to the client portal.
 *  Client-originated tasks hold a published snapshot (set at accept time);
 *  internal status changes stay invisible to the client until an admin
 *  reflects them with this. */
export const publishClientTaskStatus = mutation({
  args: { clientTaskId: v.id("jsrClientTasks") },
  handler: async (ctx, { clientTaskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const clientTask = await ctx.db.get(clientTaskId);
    if (!clientTask) throw new Error("Client request not found");
    if (!clientTask.linkedTaskId) throw new Error("Request has no linked task yet");
    const task = await ctx.db.get(clientTask.linkedTaskId);
    if (!task) throw new Error("Linked task no longer exists");

    await ctx.db.patch(clientTaskId, {
      publishedTaskStatus: task.status,
      // Keep the request-level status coherent with what we just published.
      ...(task.status === "done" ? { status: "completed" as const } : {}),
      ...(task.status === "in-progress" && clientTask.status === "accepted"
        ? { status: "in_progress" as const }
        : {}),
    });
    return task.status;
  },
});

export const deleteClientTask = mutation({
  args: { clientTaskId: v.id("jsrClientTasks") },
  handler: async (ctx, { clientTaskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    const clientTask = await ctx.db.get(clientTaskId);
    if (!clientTask) throw new Error("Client task not found");

    if (clientTask.linkedTaskId) {
      const realTask = await ctx.db.get(clientTask.linkedTaskId);
      if (realTask) {
        await ctx.db.delete(clientTask.linkedTaskId);
      }
    }

    await ctx.db.delete(clientTaskId);
  },
});

export const setCumulativeDeadline = mutation({
  args: {
    jsrLinkId: v.id("jsrLinks"),
    deadline: v.number(),
  },
  handler: async (ctx, { jsrLinkId, deadline }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    const tasks = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_jsr_link", (q) => q.eq("jsrLinkId", jsrLinkId))
      .collect();

    for (const task of tasks) {
      if (!task.finalDeadline) {
        await ctx.db.patch(task._id, { cumulativeDeadline: deadline });
      }
    }
  },
});

// ─── JSR MESSAGES ────────────────────────────────

export const sendClientMessage = mutation({
  args: {
    token: v.string(),
    content: v.string(),
    senderName: v.optional(v.string()),
  },
  handler: async (ctx, { token, content, senderName }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive)
      throw new Error("Invalid or inactive JSR link");

    await ctx.db.insert("jsrMessages", {
      brandId: jsrLink.brandId,
      jsrLinkId: jsrLink._id,
      senderType: "client",
      senderName,
      content,
      createdAt: Date.now(),
    });
  },
});

export const sendManagerMessage = mutation({
  args: {
    brandId: v.id("brands"),
    content: v.string(),
  },
  handler: async (ctx, { brandId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const activeLink = jsrLinks.find((l) => l.isActive);
    const activePortal = await ctx.db
      .query("clientPortals")
      .withIndex("by_brand_active", (q) => q.eq("brandId", brandId).eq("isActive", true))
      .first();
    if (!activeLink && !activePortal)
      throw new Error("No active JSR link or client portal for this brand");

    await ctx.db.insert("jsrMessages", {
      brandId,
      ...(activeLink ? { jsrLinkId: activeLink._id } : { portalId: activePortal!._id }),
      senderType: "manager",
      senderName: user.name ?? user.email ?? "Manager",
      senderId: userId,
      content,
      createdAt: Date.now(),
    });
  },
});

export const listJsrMessages = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const messages = await ctx.db
      .query("jsrMessages")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    return messages.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// ─── JSR REMARKS (client feedback on deliverables) ──

export const addJsrRemark = mutation({
  args: {
    token: v.string(),
    deliverableId: v.id("deliverables"),
    content: v.string(),
    senderName: v.optional(v.string()),
  },
  handler: async (ctx, { token, deliverableId, content, senderName }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive)
      throw new Error("Invalid or inactive JSR link");

    await ctx.db.insert("jsrRemarks", {
      deliverableId,
      brandId: jsrLink.brandId,
      senderType: "client",
      senderName,
      content,
      createdAt: Date.now(),
    });
  },
});

export const addManagerRemark = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    brandId: v.id("brands"),
    content: v.string(),
  },
  handler: async (ctx, { deliverableId, brandId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    await ctx.db.insert("jsrRemarks", {
      deliverableId,
      brandId,
      senderType: "manager",
      senderName: user.name ?? user.email ?? "Manager",
      senderId: userId,
      content,
      createdAt: Date.now(),
    });
  },
});

// ─── CLIENT COLLABORATION MUTATIONS ──────────────

export const markNeedsClientInput = mutation({
  args: {
    taskId: v.id("tasks"),
    message: v.string(),
  },
  handler: async (ctx, { taskId, message }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(taskId, {
      needsClientInput: true,
      clientInputMessage: message,
    });
  },
});

export const clearClientInputFlag = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    await ctx.db.patch(taskId, {
      needsClientInput: false,
      clientInputMessage: undefined,
    });
  },
});

export const sendToClient = mutation({
  args: { deliverableId: v.id("deliverables") },
  handler: async (ctx, { deliverableId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Not authorized");

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");
    if (deliverable.status !== "approved") throw new Error("Deliverable must be internally approved first");

    const task = await ctx.db.get(deliverable.taskId);
    if (!task || !task.clientFacing) throw new Error("Task is not client-facing");

    await ctx.db.patch(deliverableId, {
      clientStatus: "pending_client",
      sentToClientAt: Date.now(),
      sentToClientBy: userId,
    });
  },
});

export const clientApproveDeliverable = mutation({
  args: {
    token: v.string(),
    deliverableId: v.id("deliverables"),
    note: v.optional(v.string()),
    senderName: v.optional(v.string()),
  },
  handler: async (ctx, { token, deliverableId, note, senderName }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive) throw new Error("Invalid or inactive JSR link");

    await applyClientApproval(ctx, {
      deliverableId,
      brandId: jsrLink.brandId,
      note,
      reviewerName: senderName,
    });
  },
});

export const clientRequestChanges = mutation({
  args: {
    token: v.string(),
    deliverableId: v.id("deliverables"),
    note: v.string(),
    senderName: v.optional(v.string()),
  },
  handler: async (ctx, { token, deliverableId, note, senderName }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive) throw new Error("Invalid or inactive JSR link");

    await applyClientChangesRequested(ctx, {
      deliverableId,
      brandId: jsrLink.brandId,
      note,
      reviewerName: senderName,
    });
  },
});

export const clientDenyDeliverable = mutation({
  args: {
    token: v.string(),
    deliverableId: v.id("deliverables"),
    note: v.string(),
    senderName: v.optional(v.string()),
  },
  handler: async (ctx, { token, deliverableId, note, senderName }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive) throw new Error("Invalid or inactive JSR link");

    await applyClientDenial(ctx, {
      deliverableId,
      brandId: jsrLink.brandId,
      note,
      reviewerName: senderName,
    });
  },
});

// ─── QUERIES FOR BRAND PAGE CLIENT TASK MANAGEMENT ──

export const listBrandTasksForClient = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const briefs = await ctx.db.query("briefs").collect();
    const brandBriefs = briefs.filter((b) => b.brandId === brandId && b.status !== "archived");
    const briefIds = new Set(brandBriefs.map((b) => b._id));

    const allTasks = await ctx.db.query("tasks").collect();
    const brandTasks = allTasks.filter((t) => briefIds.has(t.briefId) && !t.parentTaskId);

    const allDeliverables = await ctx.db.query("deliverables").collect();

    return brandTasks.map((t) => {
      const brief = brandBriefs.find((b) => b._id === t.briefId);
      const latestDeliverable = allDeliverables
        .filter((d) => d.taskId === t._id)
        .sort((a, b) => b.submittedAt - a.submittedAt)[0];
      return {
        _id: t._id,
        title: t.title,
        status: t.status,
        clientFacing: t.clientFacing ?? false,
        needsClientInput: t.needsClientInput ?? false,
        clientInputMessage: t.clientInputMessage,
        briefTitle: brief?.title ?? "",
        deliverableId: latestDeliverable?._id,
        deliverableStatus: latestDeliverable?.status,
        clientStatus: latestDeliverable?.clientStatus,
      };
    });
  },
});

export const getClientApprovalCounts = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { approved: 0, pendingClient: 0, changesRequested: 0, denied: 0 };
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return { approved: 0, pendingClient: 0, changesRequested: 0, denied: 0 };

    const myBrandAssignments = await ctx.db
      .query("brandManagers")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .collect();
    if (myBrandAssignments.length === 0) return { approved: 0, pendingClient: 0, changesRequested: 0, denied: 0 };

    const myBrandIds = new Set(myBrandAssignments.map((bm) => bm.brandId));
    const briefs = await ctx.db.query("briefs").collect();
    const brandBriefs = briefs.filter((b) => b.brandId && myBrandIds.has(b.brandId));
    const briefIds = new Set(brandBriefs.map((b) => b._id));

    const allTasks = await ctx.db.query("tasks").collect();
    const brandTasks = allTasks.filter((t) => briefIds.has(t.briefId) && t.clientFacing);
    const taskIds = new Set(brandTasks.map((t) => t._id));

    const allDeliverables = await ctx.db.query("deliverables").collect();
    const clientDeliverables = allDeliverables.filter((d) => taskIds.has(d.taskId) && d.clientStatus);

    return {
      approved: clientDeliverables.filter((d) => d.clientStatus === "client_approved").length,
      pendingClient: clientDeliverables.filter((d) => d.clientStatus === "pending_client").length,
      changesRequested: clientDeliverables.filter((d) => d.clientStatus === "client_changes_requested").length,
      denied: clientDeliverables.filter((d) => d.clientStatus === "client_denied").length,
    };
  },
});

export const listJsrRemarks = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const remarks = await ctx.db
      .query("jsrRemarks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const deliverables = await ctx.db.query("deliverables").collect();
    const tasks = await ctx.db.query("tasks").collect();

    return remarks
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => {
        const deliverable = deliverables.find((d) => d._id === r.deliverableId);
        const task = deliverable ? tasks.find((t) => t._id === deliverable.taskId) : null;
        return {
          ...r,
          taskTitle: task?.title ?? "Unknown",
        };
      });
  },
});

// ═══════════════════════════════════════════════════════════
// CLIENT INTAKE — dedicated per-brand task-request page + queue
// ═══════════════════════════════════════════════════════════

/** Generate a shareable client intake link for a brand. */
export const generateIntakeLink = mutation({
  args: { brandId: v.id("brands"), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can generate intake links");

    const token = generateToken();
    return await ctx.db.insert("jsrLinks", {
      brandId: args.brandId,
      token,
      createdBy: userId,
      createdAt: Date.now(),
      isActive: true,
      label: args.label,
      linkType: "intake",
    });
  },
});

/**
 * Public — resolve an intake link by token. Returns brand branding and the
 * tasks this client has submitted through this link (with their status).
 */
export const getIntakeByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const links = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const link = links[0];
    if (!link || !link.isActive) return null;

    const brand = await ctx.db.get(link.brandId);
    if (!brand) return null;

    const logoUrl = brand.logoId ? await ctx.storage.getUrl(brand.logoId) : null;

    const tasks = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_jsr_link", (q) => q.eq("jsrLinkId", link._id))
      .collect();

    return {
      brand: {
        name: brand.name,
        color: brand.color,
        logoUrl,
      },
      tasks: tasks
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((t) => ({
          _id: t._id,
          title: t.title,
          description: t.description,
          status: t.status,
          proposedDeadline: t.proposedDeadline,
          // Only reveal the committed date once we've accepted the request.
          finalDeadline:
            t.status === "pending_review" || t.status === "on_hold"
              ? undefined
              : t.finalDeadline,
          referenceCount: (t.references ?? []).length,
          createdAt: t.createdAt,
        })),
    };
  },
});

/** Brand ids the current admin may see client requests for. null = all (super admin). */
async function visibleBrandIdsForRequests(
  ctx: any,
  userId: string
): Promise<Set<string> | null> {
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin") return new Set();
  if (user.isSuperAdmin) return null; // all brands
  const assignments = await ctx.db
    .query("brandManagers")
    .withIndex("by_manager", (q: any) => q.eq("managerId", userId))
    .collect();
  return new Set(assignments.map((a: any) => a.brandId));
}

/**
 * Client-request queue for the dashboard. Super admins see every brand;
 * brand managers see only brands they manage.
 */
export const listPendingClientRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const visible = await visibleBrandIdsForRequests(ctx, userId);
    if (visible !== null && visible.size === 0) return [];

    const all = await ctx.db.query("jsrClientTasks").collect();
    const relevant = all.filter(
      (t) =>
        t.status !== "declined" &&
        t.status !== "completed" &&
        (visible === null || visible.has(t.brandId))
    );

    const users = await ctx.db.query("users").collect();
    const result = [];
    for (const t of relevant) {
      const brand = await ctx.db.get(t.brandId);
      let assigneeName: string | null = null;
      if (t.assignedTo) {
        const a = users.find((u) => u._id === t.assignedTo);
        assigneeName = a?.name ?? a?.email ?? null;
      }
      // Live internal status of the linked task, so the panel can show when
      // it has drifted from what the client currently sees (publishedTaskStatus).
      let liveTaskStatus: string | null = null;
      if (t.linkedTaskId) {
        const task = await ctx.db.get(t.linkedTaskId);
        liveTaskStatus = task?.status ?? null;
      }
      result.push({
        ...t,
        brandName: brand?.name ?? "Unknown",
        brandColor: brand?.color ?? "#171717",
        assigneeName,
        assigned: !!t.assignedTo,
        viaPortal: !!t.submittedByClientId,
        liveTaskStatus,
      });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Badge count — number of requests still awaiting first review. */
export const countPendingClientRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const visible = await visibleBrandIdsForRequests(ctx, userId);
    if (visible !== null && visible.size === 0) return 0;
    const all = await ctx.db.query("jsrClientTasks").collect();
    return all.filter(
      (t) =>
        t.status === "pending_review" &&
        (visible === null || visible.has(t.brandId))
    ).length;
  },
});
