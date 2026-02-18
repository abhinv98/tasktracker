import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listTeams = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const teams = await ctx.db.query("teams").collect();
    const leads = await ctx.db.query("users").collect();
    const userTeams = await ctx.db.query("userTeams").collect();

    return teams.map((team) => {
      const lead = leads.find((l) => l._id === team.leadId);
      const memberCount = userTeams.filter((ut) => ut.teamId === team._id).length;
      return {
        ...team,
        leadName: lead?.name ?? lead?.email ?? "Unknown",
        memberCount,
      };
    });
  },
});

export const getTeamMembers = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const userTeams = await ctx.db
      .query("userTeams")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const users = await ctx.db.query("users").collect();
    return userTeams
      .map((ut) => users.find((u) => u._id === ut.userId))
      .filter(Boolean);
  },
});

export const getTeamsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const userTeams = await ctx.db
      .query("userTeams")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = await ctx.db.query("teams").collect();
    return userTeams
      .map((ut) => teams.find((t) => t._id === ut.teamId))
      .filter(Boolean);
  },
});

export const createTeam = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    leadId: v.id("users"),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can create teams");
    }
    return await ctx.db.insert("teams", {
      ...args,
      createdBy: userId,
    });
  },
});

export const addUserToTeam = mutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, { userId, teamId }) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Not authenticated");
    const user = await ctx.db.get(currentUserId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Only admins and managers can add users to teams");
    }
    const existing = await ctx.db
      .query("userTeams")
      .withIndex("by_user_team", (q) =>
        q.eq("userId", userId).eq("teamId", teamId)
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("userTeams", {
      userId,
      teamId,
      joinedAt: Date.now(),
    });
  },
});

export const removeUserFromTeam = mutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, { userId, teamId }) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Not authenticated");
    const user = await ctx.db.get(currentUserId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can remove users from teams");
    }
    const existing = await ctx.db
      .query("userTeams")
      .withIndex("by_user_team", (q) =>
        q.eq("userId", userId).eq("teamId", teamId)
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const updateTeam = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    leadId: v.optional(v.id("users")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { teamId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can update teams");
    }
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.leadId !== undefined) updates.leadId = fields.leadId;
    if (fields.color !== undefined) updates.color = fields.color;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(teamId, updates);
    }
  },
});

export const deleteTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can delete teams");
    }
    const briefTeams = await ctx.db
      .query("briefTeams")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const briefs = await ctx.db.query("briefs").collect();
    const activeBriefs = briefTeams.filter((bt) => {
      const brief = briefs.find((b) => b._id === bt.briefId);
      return brief && !["archived", "completed"].includes(brief.status);
    });
    if (activeBriefs.length > 0) {
      throw new Error(
        "Remove team from active briefs before deleting. " +
          `${activeBriefs.length} active brief(s) assigned.`
      );
    }
    const userTeams = await ctx.db
      .query("userTeams")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const ut of userTeams) {
      await ctx.db.delete(ut._id);
    }
    await ctx.db.delete(teamId);
  },
});
