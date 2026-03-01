import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listDocuments = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const docs = await ctx.db
      .query("brandDocuments")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const filtered =
      user.role === "admin"
        ? docs
        : docs.filter((d) => d.visibility === "all");

    const users = await ctx.db.query("users").collect();
    const result = [];
    for (const doc of filtered) {
      const url = await ctx.storage.getUrl(doc.fileId);
      const uploader = users.find((u) => u._id === doc.uploadedBy);
      result.push({
        ...doc,
        url,
        uploaderName: uploader?.name ?? uploader?.email ?? "Unknown",
      });
    }
    return result;
  },
});

export const uploadDocument = mutation({
  args: {
    brandId: v.id("brands"),
    fileId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.optional(v.string()),
    visibility: v.union(v.literal("all"), v.literal("admin_only")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can upload documents");

    if (args.visibility === "admin_only" && user.role !== "admin")
      throw new Error("Only admins can upload admin-only documents");

    return await ctx.db.insert("brandDocuments", {
      ...args,
      uploadedBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteDocument = mutation({
  args: { documentId: v.id("brandDocuments") },
  handler: async (ctx, { documentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not authenticated");

    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found");

    if (doc.uploadedBy !== userId && user.role !== "admin")
      throw new Error("Not authorized");

    await ctx.storage.delete(doc.fileId);
    await ctx.db.delete(documentId);
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
