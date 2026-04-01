import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Queries ─────────────────────────────────

/**
 * Get all users as contacts, with unread counts and last message preview.
 * Sorted: unread-first, then by most-recent message.
 */
export const getContacts = query({
  handler: async (ctx) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return [];

    const allUsers = await ctx.db.query("users").collect();
    const contacts: Array<{
      _id: string;
      name: string;
      email: string | null;
      role: string;
      avatarUrl: string | null;
      lastMessage: string | null;
      lastMessageTime: number | null;
      unreadCount: number;
    }> = [];

    for (const u of allUsers) {
      if (u._id === authId) continue;

      // Unread: messages sent TO me by this user where readAt is undefined
      const unreadMessages = await ctx.db
        .query("directMessages")
        .withIndex("by_sender_recipient", (q) =>
          q.eq("senderId", u._id).eq("recipientId", authId)
        )
        .collect();
      const unreadCount = unreadMessages.filter((m) => !m.readAt).length;

      // Last message between us (either direction)
      const sentByThem = await ctx.db
        .query("directMessages")
        .withIndex("by_sender_recipient", (q) =>
          q.eq("senderId", u._id).eq("recipientId", authId)
        )
        .order("desc")
        .first();

      const sentByMe = await ctx.db
        .query("directMessages")
        .withIndex("by_sender_recipient", (q) =>
          q.eq("senderId", authId).eq("recipientId", u._id)
        )
        .order("desc")
        .first();

      let lastMessage: string | null = null;
      let lastMessageTime: number | null = null;

      if (sentByThem && sentByMe) {
        if (sentByThem.createdAt > sentByMe.createdAt) {
          lastMessage = sentByThem.content;
          lastMessageTime = sentByThem.createdAt;
        } else {
          lastMessage = sentByMe.content;
          lastMessageTime = sentByMe.createdAt;
        }
      } else if (sentByThem) {
        lastMessage = sentByThem.content;
        lastMessageTime = sentByThem.createdAt;
      } else if (sentByMe) {
        lastMessage = sentByMe.content;
        lastMessageTime = sentByMe.createdAt;
      }

      contacts.push({
        _id: u._id,
        name: u.name ?? u.email ?? "Unknown",
        email: u.email ?? null,
        role: u.role ?? "employee",
        avatarUrl: u.avatarUrl ?? u.image ?? null,
        lastMessage,
        lastMessageTime,
        unreadCount,
      });
    }

    // Notes to self: prefer ctx.db.get(authId) so we always have a row even if collect() is odd
    const selfUser = (await ctx.db.get(authId)) ?? allUsers.find((u) => u._id === authId);
    if (selfUser) {
      // Use by_recipient then filter — reliable when senderId === recipientId (some index paths are finicky)
      const toMe = await ctx.db
        .query("directMessages")
        .withIndex("by_recipient", (q) => q.eq("recipientId", authId))
        .collect();
      const selfThread = toMe.filter((m) => m.senderId === authId);
      const unreadCount = selfThread.filter((m) => !m.readAt).length;
      let lastMessage: string | null = null;
      let lastMessageTime: number | null = null;
      if (selfThread.length > 0) {
        const last = selfThread.reduce((a, b) =>
          a.createdAt > b.createdAt ? a : b
        );
        lastMessage = last.content;
        lastMessageTime = last.createdAt;
      }
      const selfLabel =
        selfUser.name ?? selfUser.email?.split("@")[0] ?? "You";
      contacts.push({
        _id: authId,
        name: `${selfLabel} (You)`,
        email: selfUser.email ?? null,
        role: selfUser.role ?? "employee",
        avatarUrl: selfUser.avatarUrl ?? selfUser.image ?? null,
        lastMessage,
        lastMessageTime,
        unreadCount,
      });
    }

    // Sort: yourself first, then unread first, then by last message time (most recent first)
    contacts.sort((a, b) => {
      const aSelf = a._id === authId ? 1 : 0;
      const bSelf = b._id === authId ? 1 : 0;
      if (aSelf !== bSelf) return bSelf - aSelf;
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      if (a.lastMessageTime && b.lastMessageTime) return b.lastMessageTime - a.lastMessageTime;
      if (a.lastMessageTime) return -1;
      if (b.lastMessageTime) return 1;
      return a.name.localeCompare(b.name);
    });

    return contacts;
  },
});

/**
 * Get conversation (all messages) between current user and another user.
 */
export const getConversation = query({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return [];

    if (otherUserId === authId) {
      const toMe = await ctx.db
        .query("directMessages")
        .withIndex("by_recipient", (q) => q.eq("recipientId", authId))
        .collect();
      const selfMsgs = toMe.filter((m) => m.senderId === authId);
      const allMessages = [...selfMsgs].sort((a, b) => a.createdAt - b.createdAt);
      return allMessages.map((m) => ({
        _id: m._id,
        senderId: m.senderId,
        recipientId: m.recipientId,
        content: m.content,
        createdAt: m.createdAt,
        readAt: m.readAt,
        isMine: true,
      }));
    }

    // Messages sent by me to them
    const sentByMe = await ctx.db
      .query("directMessages")
      .withIndex("by_sender_recipient", (q) =>
        q.eq("senderId", authId).eq("recipientId", otherUserId)
      )
      .collect();

    // Messages sent by them to me
    const sentByThem = await ctx.db
      .query("directMessages")
      .withIndex("by_sender_recipient", (q) =>
        q.eq("senderId", otherUserId).eq("recipientId", authId)
      )
      .collect();

    const allMessages = [...sentByMe, ...sentByThem].sort(
      (a, b) => a.createdAt - b.createdAt
    );

    return allMessages.map((m) => ({
      _id: m._id,
      senderId: m.senderId,
      recipientId: m.recipientId,
      content: m.content,
      createdAt: m.createdAt,
      readAt: m.readAt,
      isMine: m.senderId === authId,
    }));
  },
});

/**
 * Total unread DM count for current user (for sidebar badge).
 */
export const getUnreadTotal = query({
  handler: async (ctx) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) return 0;

    const incomingMessages = await ctx.db
      .query("directMessages")
      .withIndex("by_recipient", (q) => q.eq("recipientId", authId))
      .collect();

    return incomingMessages.filter((m) => !m.readAt).length;
  },
});

// ─── Mutations ───────────────────────────────

/**
 * Send a DM to another user.
 */
export const sendMessage = mutation({
  args: {
    recipientId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, { recipientId, content }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");
    if (!content.trim()) throw new Error("Message cannot be empty");

    const sender = await ctx.db.get(authId);

    await ctx.db.insert("directMessages", {
      senderId: authId,
      recipientId,
      content: content.trim(),
      createdAt: Date.now(),
    });

    if (recipientId !== authId) {
      await ctx.db.insert("notifications", {
        recipientId,
        type: "direct_message",
        title: "New message",
        message: `${sender?.name ?? sender?.email ?? "Someone"}: ${content.trim().slice(0, 100)}`,
        triggeredBy: authId,
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Mark all messages from a specific user as read.
 */
export const markConversationRead = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const authId = await getAuthUserId(ctx);
    if (!authId) throw new Error("Not authenticated");

    const now = Date.now();

    if (otherUserId === authId) {
      const toMe = await ctx.db
        .query("directMessages")
        .withIndex("by_recipient", (q) => q.eq("recipientId", authId))
        .collect();
      const selfMsgs = toMe.filter((m) => m.senderId === authId);
      for (const msg of selfMsgs) {
        if (!msg.readAt) {
          await ctx.db.patch(msg._id, { readAt: now });
        }
      }
      return;
    }

    const unreadMessages = await ctx.db
      .query("directMessages")
      .withIndex("by_sender_recipient", (q) =>
        q.eq("senderId", otherUserId).eq("recipientId", authId)
      )
      .collect();

    for (const msg of unreadMessages) {
      if (!msg.readAt) {
        await ctx.db.patch(msg._id, { readAt: now });
      }
    }
  },
});
