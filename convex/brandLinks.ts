import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listLinks = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const links = await ctx.db
      .query("brandLinks")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const users = await ctx.db.query("users").collect();

    return links.map((link) => {
      const creator = users.find((u) => u._id === link.createdBy);
      return {
        ...link,
        creatorName: creator?.name ?? creator?.email ?? "Unknown",
      };
    });
  },
});

export const addLink = mutation({
  args: {
    brandId: v.id("brands"),
    url: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { brandId, url, label, description }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const bms = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const isBrandManager = bms.some((bm) => bm.managerId === userId);

    const user = await ctx.db.get(userId);
    if (!isBrandManager && user?.role !== "admin") {
      throw new Error("Only brand managers or admins can add links");
    }

    return await ctx.db.insert("brandLinks", {
      brandId,
      url,
      label,
      description,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteLink = mutation({
  args: { linkId: v.id("brandLinks") },
  handler: async (ctx, { linkId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const link = await ctx.db.get(linkId);
    if (!link) throw new Error("Link not found");

    const bms = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", link.brandId))
      .collect();
    const isBrandManager = bms.some((bm) => bm.managerId === userId);

    const user = await ctx.db.get(userId);
    if (!isBrandManager && user?.role !== "admin") {
      throw new Error("Only brand managers or admins can delete links");
    }

    await ctx.db.delete(linkId);
  },
});
