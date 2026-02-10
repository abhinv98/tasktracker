import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { DataModel } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile: (params) => {
        const name = (params.name as string) ?? params.email ?? "User";
        const email = params.email as string;
        if (!email) throw new Error("Email is required");
        return {
          name,
          email,
          role: "employee" as const,
        };
      },
    }),
  ],
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, { userId, existingUserId }) => {
      const user = await ctx.db.get(userId);
      if (!user) return;

      // First user becomes admin
      const count = await ctx.db.query("users").collect();
      if (count.length === 1) {
        await ctx.db.patch(userId, { role: "admin" });
        return;
      }

      // Check if there's an invite for this email
      if (user.email && !existingUserId) {
        const allInvites = await ctx.db.query("invites").collect();
        const invite = allInvites.find(
          (inv: Record<string, unknown>) => inv.email === user.email && !inv.used
        );

        if (invite) {
          // Apply invite settings
          const updates: Record<string, unknown> = {};
          if (invite.role) updates.role = invite.role;
          if (invite.name) updates.name = invite.name;
          if (invite.designation) updates.designation = invite.designation;

          if (Object.keys(updates).length > 0) {
            await ctx.db.patch(userId, updates);
          }

          // Add to team if specified
          if (invite.teamId) {
            const allUserTeams = await ctx.db.query("userTeams").collect();
            const existing = allUserTeams.find(
              (ut: Record<string, unknown>) => ut.userId === userId && ut.teamId === invite.teamId
            );
            if (!existing) {
              await ctx.db.insert("userTeams", {
                userId,
                teamId: invite.teamId,
                joinedAt: Date.now(),
              });
            }
          }

          // Mark invite as used
          await ctx.db.patch(invite._id, { used: true } as Record<string, unknown>);
        }
      }
    },
  },
});
