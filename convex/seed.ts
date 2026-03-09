import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Seeds 2 teams and 4 dummy members for testing.
 * Run this once as an admin (e.g. from the Convex dashboard or a "Seed" button).
 * Dummy members cannot log in—they exist only for assignment testing.
 */
export const seedTestData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can run seed");
    }

    const existingTeams = await ctx.db.query("teams").collect();
    if (existingTeams.some((t) => t.name === "Frontend Team")) {
      return { message: "Seed already run. Teams exist." };
    }

    const dummyUsers = [
      { name: "Alex Chen", email: "alex@test.example", role: "employee" as const },
      { name: "Jordan Kim", email: "jordan@test.example", role: "employee" as const },
      { name: "Sam Rivera", email: "sam@test.example", role: "employee" as const },
      { name: "Taylor Morgan", email: "taylor@test.example", role: "employee" as const },
    ];

    const insertedUserIds: string[] = [];
    for (const u of dummyUsers) {
      const id = await ctx.db.insert("users", u);
      insertedUserIds.push(id);
    }

    const frontendTeamId = await ctx.db.insert("teams", {
      name: "Frontend Team",
      description: "Web and mobile frontend development",
      leadId: userId,
      color: "#6a9bcc",
      createdBy: userId,
    });

    const designTeamId = await ctx.db.insert("teams", {
      name: "Design Team",
      description: "UI/UX and visual design",
      leadId: userId,
      color: "#788c5d",
      createdBy: userId,
    });

    const now = Date.now();

    await ctx.db.insert("userTeams", {
      userId,
      teamId: frontendTeamId,
      joinedAt: now,
    });
    await ctx.db.insert("userTeams", {
      userId: insertedUserIds[0] as Id<"users">,
      teamId: frontendTeamId,
      joinedAt: now,
    });
    await ctx.db.insert("userTeams", {
      userId: insertedUserIds[1] as Id<"users">,
      teamId: frontendTeamId,
      joinedAt: now,
    });

    await ctx.db.insert("userTeams", {
      userId,
      teamId: designTeamId,
      joinedAt: now,
    });
    await ctx.db.insert("userTeams", {
      userId: insertedUserIds[2] as Id<"users">,
      teamId: designTeamId,
      joinedAt: now,
    });
    await ctx.db.insert("userTeams", {
      userId: insertedUserIds[3] as Id<"users">,
      teamId: designTeamId,
      joinedAt: now,
    });

    return {
      message: "Seed complete",
      teams: ["Frontend Team", "Design Team"],
      members: dummyUsers.map((u) => u.name),
    };
  },
});
