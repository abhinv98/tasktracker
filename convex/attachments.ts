import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAttachments = query({
  args: {
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
  },
  handler: async (ctx, { parentType, parentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_parent", (q) =>
        q.eq("parentType", parentType).eq("parentId", parentId)
      )
      .collect();

    const users = await ctx.db.query("users").collect();

    const result = [];
    for (const att of attachments) {
      const uploader = users.find((u) => u._id === att.uploadedBy);
      const url = await ctx.storage.getUrl(att.fileId);
      result.push({
        ...att,
        url,
        uploaderName: uploader?.name ?? uploader?.email ?? "Unknown",
        uploaderDesignation: uploader?.designation ?? "",
      });
    }
    return result;
  },
});

export const addAttachment = mutation({
  args: {
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
    fileId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("attachments", {
      ...args,
      uploadedBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteAttachment = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, { attachmentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const att = await ctx.db.get(attachmentId);
    if (!att) throw new Error("Attachment not found");
    const user = await ctx.db.get(userId);
    if (att.uploadedBy !== userId && user?.role !== "admin") {
      throw new Error("Not authorized");
    }
    await ctx.storage.delete(att.fileId);
    await ctx.db.delete(attachmentId);
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
