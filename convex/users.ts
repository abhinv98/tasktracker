import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/** Shared user teardown (teams, notifications, auth sessions, user row). Used by deleteUser and internal migrations. */
async function removeUserAndCleanup(
  ctx: MutationCtx,
  targetUserId: Id<"users">
): Promise<void> {
  const targetUser = await ctx.db.get(targetUserId);
  if (!targetUser) return;

  const userTeams = await ctx.db
    .query("userTeams")
    .withIndex("by_user", (q) => q.eq("userId", targetUserId))
    .collect();
  for (const ut of userTeams) {
    await ctx.db.delete(ut._id);
  }

  const notifs = await ctx.db
    .query("notifications")
    .withIndex("by_recipient", (q) => q.eq("recipientId", targetUserId))
    .collect();
  for (const n of notifs) {
    await ctx.db.delete(n._id);
  }

  const authAccounts = await ctx.db.query("authAccounts").collect();
  const userAuthAccounts = authAccounts.filter((a: any) => a.userId === targetUserId);
  for (const account of userAuthAccounts) {
    await ctx.db.delete(account._id);
  }
  const authSessions = await ctx.db.query("authSessions").collect();
  const userSessions = authSessions.filter((s: any) => s.userId === targetUserId);
  for (const session of userSessions) {
    const refreshTokens = await ctx.db.query("authRefreshTokens").collect();
    const sessionTokens = refreshTokens.filter((t: any) => t.sessionId === session._id);
    for (const token of sessionTokens) {
      await ctx.db.delete(token._id);
    }
    await ctx.db.delete(session._id);
  }

  if (targetUser.email) {
    const allInvites = await ctx.db.query("invites").collect();
    const invite = allInvites.find((inv: any) => inv.email === targetUser.email && inv.used);
    if (invite) {
      await ctx.db.patch(invite._id, { used: false } as any);
    }
  }

  await ctx.db.delete(targetUserId);
}

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
    if (!currentUser || currentUser.role !== "admin") {
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
    return users.filter((u) => u.role === "admin");
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(
      v.literal("admin"),
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

    const targetUser = await ctx.db.get(userId);
    if (targetUser?.isSuperAdmin && !currentUser.isSuperAdmin) {
      throw new Error("Only super admins can modify super admin roles");
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
    role: v.union(v.literal("admin"), v.literal("employee")),
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

    const targetUser = await ctx.db.get(targetUserId);
    if (targetUser?.isSuperAdmin && !currentUser.isSuperAdmin) {
      throw new Error("Only super admins can delete super admin accounts");
    }
    if (targetUser?.role === "admin") {
      const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
      if (admins.length <= 1) throw new Error("Cannot delete the last admin");
    }

    await removeUserAndCleanup(ctx, targetUserId);
  },
});

/** One-off / maintenance: remove users whose name or email contains any substring (case-insensitive). Default: harshita, samhit. Run: `npx convex run users:removeUsersByNameSubstrings` */
export const removeUsersByNameSubstrings = internalMutation({
  args: {
    substrings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { substrings }) => {
    const patterns = (substrings ?? ["harshita", "samhit"]).map((p) => p.toLowerCase());
    const allUsers = await ctx.db.query("users").collect();
    const toRemove = allUsers.filter((u) => {
      const name = (u.name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      return patterns.some((p) => name.includes(p) || email.includes(p));
    });

    const removed: string[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const u of toRemove) {
      if (u.role === "admin") {
        const admins = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "admin"))
          .collect();
        if (admins.length <= 1) {
          skipped.push({ name: u.name ?? String(u._id), reason: "last admin" });
          continue;
        }
      }
      await removeUserAndCleanup(ctx, u._id);
      removed.push(u.name ?? u.email ?? String(u._id));
    }

    return { removedCount: removed.length, removed, skipped };
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

export const updateProfileImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to get image URL");
    await ctx.db.patch(userId, { avatarUrl: url, image: url });
  },
});

export const removeProfileImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.patch(userId, { avatarUrl: undefined, image: undefined });
  },
});

export const generateProfileUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const setSuperAdmins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    let updated = 0;
    for (const u of allUsers) {
      const name = (u.name ?? "").toLowerCase();
      if (name.includes("mayur") || name.includes("vivek") || name.includes("abhinav")) {
        await ctx.db.patch(u._id, { isSuperAdmin: true });
        updated++;
      }
    }
    return { updated };
  },
});

export const migrateManagersToAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    let migrated = 0;
    for (const u of allUsers) {
      if ((u.role as string) === "manager") {
        await ctx.db.patch(u._id, { role: "admin" });
        migrated++;
      }
    }

    const allInvites = await ctx.db.query("invites").collect();
    let invitesMigrated = 0;
    for (const inv of allInvites) {
      if ((inv.role as string) === "manager") {
        await ctx.db.patch(inv._id, { role: "admin" });
        invitesMigrated++;
      }
    }

    return { migrated, invitesMigrated };
  },
});

export const _cleanOrphanedAuthAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const userIds = new Set(allUsers.map((u) => u._id));

    const authAccounts = await ctx.db.query("authAccounts").collect();
    let cleaned = 0;
    for (const account of authAccounts) {
      if (!userIds.has(account.userId as any)) {
        await ctx.db.delete(account._id);
        cleaned++;
      }
    }

    const authSessions = await ctx.db.query("authSessions").collect();
    for (const session of authSessions) {
      if (!userIds.has(session.userId as any)) {
        const refreshTokens = await ctx.db.query("authRefreshTokens").collect();
        for (const token of refreshTokens) {
          if ((token as any).sessionId === session._id) {
            await ctx.db.delete(token._id);
          }
        }
        await ctx.db.delete(session._id);
        cleaned++;
      }
    }

    // Reset invites for emails of deleted users
    const allInvites = await ctx.db.query("invites").collect();
    const existingEmails = new Set(allUsers.map((u) => u.email).filter(Boolean));
    for (const inv of allInvites) {
      if ((inv as any).used && (inv as any).email && !existingEmails.has((inv as any).email)) {
        await ctx.db.patch(inv._id, { used: false } as any);
        cleaned++;
      }
    }

    return { cleaned };
  },
});
