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
  args: { jsrLinkId: v.id("jsrLinks") },
  handler: async (ctx, { jsrLinkId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Not authorized");

    await ctx.db.patch(jsrLinkId, { isActive: false });
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

    // Get internal tasks from briefs for this brand
    const briefs = await ctx.db.query("briefs").collect();
    const brandBriefs = briefs.filter(
      (b) => b.brandId === jsrLink.brandId && b.status !== "archived"
    );
    const allTasks = await ctx.db.query("tasks").collect();
    const internalTasks = allTasks.filter((t) =>
      brandBriefs.some((b) => b._id === t.briefId)
    );

    // Cumulative deadline = the latest deadline among all internal tasks
    const taskDeadlines = internalTasks
      .map((t) => t.deadline)
      .filter((d): d is number => d !== undefined);
    const cumulativeDeadline =
      taskDeadlines.length > 0 ? Math.max(...taskDeadlines) : null;

    const internalSummary = {
      total: internalTasks.length,
      pending: internalTasks.filter((t) => t.status === "pending").length,
      inProgress: internalTasks.filter((t) => t.status === "in-progress").length,
      review: internalTasks.filter((t) => t.status === "review").length,
      done: internalTasks.filter((t) => t.status === "done").length,
      cumulativeDeadline,
    };

    // Get client-added tasks for this JSR link
    const clientTasks = await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_jsr_link", (q) => q.eq("jsrLinkId", jsrLink._id))
      .collect();

    return {
      brand: { name: brand.name, color: brand.color, description: brand.description },
      internalSummary,
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

    return await ctx.db
      .query("jsrClientTasks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
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

    await ctx.db.patch(taskId, { status });
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
