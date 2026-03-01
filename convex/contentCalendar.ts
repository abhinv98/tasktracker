import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listForBrief = query({
  args: {
    briefId: v.id("briefs"),
    month: v.optional(v.string()), // "YYYY-MM"
  },
  handler: async (ctx, { briefId, month }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let items = await ctx.db
      .query("contentCalendarItems")
      .withIndex("by_brief", (q) => q.eq("briefId", briefId))
      .collect();

    if (month) {
      items = items.filter((item) => item.date.startsWith(month));
    }

    const users = await ctx.db.query("users").collect();
    return items.map((item) => {
      const assignee = item.assigneeId
        ? users.find((u) => u._id === item.assigneeId)
        : null;
      return {
        ...item,
        assigneeName: assignee?.name ?? assignee?.email ?? undefined,
      };
    });
  },
});

export const createItem = mutation({
  args: {
    briefId: v.id("briefs"),
    date: v.string(),
    platform: v.string(),
    contentType: v.string(),
    caption: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("review"),
        v.literal("approved"),
        v.literal("published")
      )
    ),
    assigneeId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can manage content calendar");

    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");
    if (!brief.brandId) throw new Error("Brief must be associated with a brand");

    return await ctx.db.insert("contentCalendarItems", {
      briefId: args.briefId,
      brandId: brief.brandId,
      date: args.date,
      platform: args.platform,
      contentType: args.contentType,
      caption: args.caption,
      status: args.status ?? "planned",
      assigneeId: args.assigneeId,
      notes: args.notes,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id("contentCalendarItems"),
    date: v.optional(v.string()),
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    caption: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("review"),
        v.literal("approved"),
        v.literal("published")
      )
    ),
    assigneeId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Not authorized");

    const updates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) updates[k] = val;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(itemId, updates);
    }
  },
});

export const deleteItem = mutation({
  args: { itemId: v.id("contentCalendarItems") },
  handler: async (ctx, { itemId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Not authorized");

    await ctx.db.delete(itemId);
  },
});
