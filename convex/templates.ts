import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db.query("briefTemplates").collect();
  },
});

export const saveAsTemplate = mutation({
  args: {
    briefId: v.id("briefs"),
    name: v.string(),
  },
  handler: async (ctx, { briefId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins can create templates");

    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();

    return await ctx.db.insert("briefTemplates", {
      name,
      description: brief.description,
      tasks: tasks.map((t) => ({
        title: t.title,
        description: t.description,
        duration: t.duration,
        durationMinutes: t.durationMinutes,
      })),
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const createFromTemplate = mutation({
  args: {
    templateId: v.id("briefTemplates"),
    title: v.string(),
    brandId: v.optional(v.id("brands")),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, { templateId, title, brandId, deadline }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins can create briefs");

    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");

    const count = (await ctx.db.query("briefs").collect()).length;

    const briefId = await ctx.db.insert("briefs", {
      title,
      description: template.description,
      status: "draft",
      createdBy: userId,
      globalPriority: count + 1,
      deadline,
      brandId,
    });

    await ctx.db.insert("activityLog", {
      briefId,
      userId,
      action: "created_brief",
      details: JSON.stringify({ title, fromTemplate: template.name }),
      timestamp: Date.now(),
    });

    return briefId;
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id("briefTemplates") },
  handler: async (ctx, { templateId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins can delete templates");
    await ctx.db.delete(templateId);
  },
});
