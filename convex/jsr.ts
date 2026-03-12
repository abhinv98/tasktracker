import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
      if (otherActiveLinks.length === 0) {
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

    // Content calendar entries — title, platform, postDate, status
    const calendarList = calendarTasks.map((t) => ({
      _id: t._id,
      title: t.title,
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
  },
  handler: async (ctx, { token, ...taskData }) => {
    const jsrLinks = await ctx.db
      .query("jsrLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .collect();
    const jsrLink = jsrLinks[0];
    if (!jsrLink || !jsrLink.isActive)
      throw new Error("Invalid or inactive JSR link");

    const taskId = await ctx.db.insert("jsrClientTasks", {
      brandId: jsrLink.brandId,
      jsrLinkId: jsrLink._id,
      title: taskData.title,
      description: taskData.description,
      proposedDeadline: taskData.proposedDeadline,
      status: "pending_review",
      clientName: taskData.clientName,
      createdAt: Date.now(),
    });

    // Notify admins and brand managers
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    const brandManagers = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
      .collect();
    const brand = await ctx.db.get(jsrLink.brandId);
    const brandName = brand?.name ?? "Unknown";

    const recipientIds = new Set<string>();
    for (const a of admins) recipientIds.add(a._id);
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
  },
  handler: async (ctx, { taskId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Not authorized");

    const clientTask = await ctx.db.get(taskId);
    if (!clientTask) throw new Error("Task not found");

    await ctx.db.patch(taskId, { status });

    // On accept: create a real task under a consolidated "Client Requests" brief
    if (status === "accepted" && !clientTask.linkedTaskId) {
      const brand = await ctx.db.get(clientTask.brandId);
      const brandName = brand?.name ?? "Unknown";
      const briefTitle = `${brandName} - Client Requests`;

      // Find or create the consolidated brief
      const allBriefs = await ctx.db.query("briefs").collect();
      let brief = allBriefs.find(
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

      // Count existing tasks in this brief for sort order
      const existingTasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();

      // Create the real task (unassigned initially — assigneeId = current user as placeholder)
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
      });

      // Link back
      await ctx.db.patch(taskId, { linkedTaskId: realTaskId, linkedBriefId: briefId });
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
      }
    }
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
    if (!activeLink) throw new Error("No active JSR link for this brand");

    await ctx.db.insert("jsrMessages", {
      brandId,
      jsrLinkId: activeLink._id,
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

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable || deliverable.clientStatus !== "pending_client")
      throw new Error("Deliverable not pending client review");

    await ctx.db.patch(deliverableId, {
      clientStatus: "client_approved",
      clientNote: note ?? (senderName ? `Approved by ${senderName}` : "Approved by client"),
      clientReviewedAt: Date.now(),
    });

    const task = await ctx.db.get(deliverable.taskId);
    if (task) {
      await ctx.db.patch(task._id, { status: "done", completedAt: Date.now() });

      const brief = await ctx.db.get(task.briefId);
      const brand = await ctx.db.get(jsrLink.brandId);
      const brandManagers = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
        .collect();
      for (const bm of brandManagers) {
        await ctx.db.insert("notifications", {
          recipientId: bm.managerId,
          type: "client_approved",
          title: "Client approved deliverable",
          message: `Client approved "${task.title}"${senderName ? ` (by ${senderName})` : ""}`,
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
    }
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

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable || deliverable.clientStatus !== "pending_client")
      throw new Error("Deliverable not pending client review");

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
    if (task) {
      await ctx.db.patch(task._id, { status: "in-progress" });

      const brandManagers = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
        .collect();
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
    }
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

    const deliverable = await ctx.db.get(deliverableId);
    if (!deliverable || deliverable.clientStatus !== "pending_client")
      throw new Error("Deliverable not pending client review");

    await ctx.db.patch(deliverableId, {
      clientStatus: "client_denied",
      clientNote: note,
      clientReviewedAt: Date.now(),
    });

    const task = await ctx.db.get(deliverable.taskId);
    if (task) {
      const brandManagers = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
        .collect();
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
    }
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
