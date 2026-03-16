import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const moms = await ctx.db
      .query("meetingMinutes")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const users = await ctx.db.query("users").collect();

    const results = await Promise.all(
      moms.map(async (mom) => {
        const creator = users.find((u) => u._id === mom.createdBy);
        let transcriptUrl: string | null = null;
        if (mom.transcriptFileId) {
          transcriptUrl = await ctx.storage.getUrl(mom.transcriptFileId);
        }
        return {
          ...mom,
          creatorName: creator?.name ?? creator?.email ?? "Unknown",
          transcriptUrl,
        };
      })
    );

    return results.sort((a, b) => b.meetingDate - a.meetingDate);
  },
});

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    title: v.string(),
    meetingDate: v.number(),
    attendees: v.optional(v.array(v.string())),
    content: v.string(),
    transcriptFileId: v.optional(v.id("_storage")),
    transcriptFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can create meeting minutes");

    return await ctx.db.insert("meetingMinutes", {
      ...args,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    momId: v.id("meetingMinutes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    attendees: v.optional(v.array(v.string())),
    meetingDate: v.optional(v.number()),
  },
  handler: async (ctx, { momId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can update meeting minutes");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.content !== undefined) updates.content = fields.content;
    if (fields.attendees !== undefined) updates.attendees = fields.attendees;
    if (fields.meetingDate !== undefined) updates.meetingDate = fields.meetingDate;

    await ctx.db.patch(momId, updates);
  },
});

export const deleteMom = mutation({
  args: { momId: v.id("meetingMinutes") },
  handler: async (ctx, { momId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can delete meeting minutes");

    const mom = await ctx.db.get(momId);
    if (mom?.transcriptFileId) {
      await ctx.storage.delete(mom.transcriptFileId);
    }
    await ctx.db.delete(momId);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});
