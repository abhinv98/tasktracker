import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ─── CONVERSATIONS ─────────────────────────

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const convos = await ctx.db
      .query("chatConversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return convos.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const createConversation = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    return await ctx.db.insert("chatConversations", {
      userId,
      title: args.title ?? "New chat",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const convo = await ctx.db.get(conversationId);
    if (!convo || convo.userId !== userId) throw new Error("Not authorized");

    // Delete all messages in this conversation
    const msgs = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    for (const msg of msgs) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(conversationId);
  },
});

export const renameConversation = mutation({
  args: { conversationId: v.id("chatConversations"), title: v.string() },
  handler: async (ctx, { conversationId, title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const convo = await ctx.db.get(conversationId);
    if (!convo || convo.userId !== userId) throw new Error("Not authorized");
    await ctx.db.patch(conversationId, { title });
  },
});

// ─── MESSAGES ──────────────────────────────

// Get messages for a specific conversation
export const getConversationMessages = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();

    return messages.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// Legacy: get all messages for user (used by AI action for backward compat)
export const getChatHistory = query({
  args: { conversationId: v.optional(v.id("chatConversations")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    if (args.conversationId) {
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId!)
        )
        .collect();
      return messages.sort((a, b) => a.createdAt - b.createdAt).slice(-50);
    }

    // Fallback: all user messages
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return messages.sort((a, b) => a.createdAt - b.createdAt).slice(-50);
  },
});

// Store a chat message (called from AI action)
export const storeChatMessage = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.optional(v.id("chatConversations")),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    fileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    toolSteps: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const msgId = await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: Date.now(),
    });

    // Update conversation's updatedAt and auto-title on first user message
    if (args.conversationId) {
      const convo = await ctx.db.get(args.conversationId);
      if (convo) {
        await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
        // Auto-title from first user message
        if (args.role === "user" && convo.title === "New chat") {
          const title = args.content.slice(0, 50) + (args.content.length > 50 ? "..." : "");
          await ctx.db.patch(args.conversationId, { title });
        }
      }
    }

    return msgId;
  },
});

// Clear all messages in a conversation
export const clearChatHistory = mutation({
  args: { conversationId: v.optional(v.id("chatConversations")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.conversationId) {
      const msgs = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId!)
        )
        .collect();
      for (const msg of msgs) {
        await ctx.db.delete(msg._id);
      }
      return;
    }

    // Legacy: clear all
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
  },
});

// Generate an upload URL for file uploads
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});
