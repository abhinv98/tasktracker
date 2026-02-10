import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user;
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const currentUser = await ctx.db.get(userId);
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "manager")) {
      return null;
    }
    const users = await ctx.db.query("users").collect();
    const userTeams = await ctx.db.query("userTeams").collect();
    const teams = await ctx.db.query("teams").collect();

    return users.map((user) => {
      const teamsForUser = userTeams
        .filter((ut) => ut.userId === user._id)
        .map((ut) => teams.find((t) => t._id === ut.teamId))
        .filter(Boolean);
      return { ...user, teams: teamsForUser };
    });
  },
});

export const listEmployees = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.role === "employee");
  },
});

export const listManagers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.role === "manager");
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("employee")
    ),
  },
  handler: async (ctx, { userId, newRole }) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Not authenticated");
    const currentUser = await ctx.db.get(currentUserId);
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Only admins can change roles");
    }
    if (userId === currentUserId && newRole !== "admin") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      if (admins.length <= 1) {
        throw new Error("Cannot demote the last admin");
      }
    }
    await ctx.db.patch(userId, { role: newRole });
  },
});

export const getUserWorkload = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee_sort", (q) => q.eq("assigneeId", userId))
      .collect();
    const briefs = await ctx.db.query("briefs").collect();
    return tasks
      .filter((t) => {
        const brief = briefs.find((b) => b._id === t.briefId);
        return brief && brief.status !== "archived";
      })
      .map((t) => {
        const brief = briefs.find((b) => b._id === t.briefId);
        return {
          ...t,
          briefName: brief?.title ?? "Unknown",
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const createInvite = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    designation: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("employee")),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") throw new Error("Only admins can create invites");

    // Generate a random token
    const token = Array.from({ length: 32 }, () =>
      "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
    ).join("");

    const inviteId = await ctx.db.insert("invites", {
      ...args,
      token,
      createdBy: userId,
      createdAt: Date.now(),
      used: false,
    });

    return { inviteId, token };
  },
});

export const getInviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!invite || invite.used) return null;
    return invite;
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Not authenticated");
    const currentUser = await ctx.db.get(currentUserId);
    if (!currentUser || currentUser.role !== "admin") throw new Error("Only admins can delete users");
    if (targetUserId === currentUserId) throw new Error("Cannot delete yourself");

    // Check if user is last admin
    const targetUser = await ctx.db.get(targetUserId);
    if (targetUser?.role === "admin") {
      const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
      if (admins.length <= 1) throw new Error("Cannot delete the last admin");
    }

    // Remove from all teams
    const userTeams = await ctx.db.query("userTeams").withIndex("by_user", (q) => q.eq("userId", targetUserId)).collect();
    for (const ut of userTeams) {
      await ctx.db.delete(ut._id);
    }

    // Delete notifications
    const notifs = await ctx.db.query("notifications").withIndex("by_recipient", (q) => q.eq("recipientId", targetUserId)).collect();
    for (const n of notifs) {
      await ctx.db.delete(n._id);
    }

    await ctx.db.delete(targetUserId);
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { name, avatarUrl }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const updates: { name?: string; avatarUrl?: string; image?: string } = { name };
    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl;
      updates.image = avatarUrl;
    }
    await ctx.db.patch(userId, updates);
  },
});
