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
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can generate JSR links");

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
    if (!user || (user.role !== "admin" && user.role !== "manager")) return [];

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
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Not authorized");

    await ctx.db.patch(jsrLinkId, { isActive: false });

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

    // Tasks grouped by brief for client view — title + status only, no assignee
    const briefGroups: Record<string, { briefTitle: string; briefStatus: string; tasks: { _id: string; title: string; status: string }[] }> = {};
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
      briefGroups[key].tasks.push({ _id: t._id, title: t.title, status: t.status });
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

    // Client-added tasks — query by brand so all requests persist across links
    const clientTasks = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_brand", (q) => q.eq("brandId", jsrLink.brandId))
      .collect();

    // Accepted client tasks WITHOUT a linkedTaskId are legacy — count them manually
    const unlinkedActive = clientTasks.filter(
      (t) => !t.linkedTaskId && (t.status === "accepted" || t.status === "in_progress" || t.status === "completed")
    );

    function clientStatusToInternal(s: string) {
      if (s === "accepted") return "pending";
      if (s === "in_progress") return "in-progress";
      if (s === "completed") return "done";
      return "pending";
    }

    // Merge unlinked accepted client tasks into summary
    const combinedSummary = {
      total: internalSummary.total + unlinkedActive.length,
      pending: internalSummary.pending + unlinkedActive.filter((t) => t.status === "accepted").length,
      inProgress: internalSummary.inProgress + unlinkedActive.filter((t) => t.status === "in_progress").length,
      review: internalSummary.review,
      done: internalSummary.done + unlinkedActive.filter((t) => t.status === "completed").length,
      internalDeadline,
    };

    // Add unlinked accepted tasks as a group in tasksByBrief
    if (unlinkedActive.length > 0) {
      tasksByBrief.push({
        briefTitle: "Client Requests",
        briefStatus: "active",
        tasks: unlinkedActive.map((t) => ({
          _id: t._id,
          title: t.title,
          status: clientStatusToInternal(t.status),
        })),
      });
    }

    const clientDeadlines = clientTasks
      .map((t) => t.finalDeadline)
      .filter((d): d is number => d !== undefined);
    const clientTasksDeadline =
      clientDeadlines.length > 0 ? Math.max(...clientDeadlines) : null;

    const allDeadlines = [internalDeadline, clientTasksDeadline].filter(
      (d): d is number => d !== null
    );
    const overallDeadline =
      allDeadlines.length > 0 ? Math.max(...allDeadlines) : null;

    return {
      brand: {
        name: brand.name,
        color: brand.color,
        description: brand.description,
        logoUrl: brand.logoId ? await ctx.storage.getUrl(brand.logoId) : null,
      },
      internalSummary: combinedSummary,
      tasksByBrief,
      taskList,
      calendarList,
      recentActivity,
      lastUpdated,
      clientTasks: clientTasks.map((t) => ({
        _id: t._id,
        title: t.title,
        description: t.description,
        proposedDeadline: t.proposedDeadline,
        finalDeadline: t.finalDeadline,
        status: t.status,
        clientName: t.clientName,
        createdAt: t.createdAt,
      })),
      clientTasksDeadline,
      overallDeadline,
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
    if (!user || (user.role !== "admin" && user.role !== "manager")) return [];

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
    if (!user || (user.role !== "admin" && user.role !== "manager"))
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
    if (!user || (user.role !== "admin" && user.role !== "manager"))
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
    if (!user || (user.role !== "admin" && user.role !== "manager"))
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

export const setCumulativeDeadline = mutation({
  args: {
    jsrLinkId: v.id("jsrLinks"),
    deadline: v.number(),
  },
  handler: async (ctx, { jsrLinkId, deadline }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
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
