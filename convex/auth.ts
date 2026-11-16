import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
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

      // Portal client accounts are created fully-formed by adminCreateClientUser —
      // skip first-admin promotion and invite matching.
      if (user.role === "client") return;

      // First user becomes admin
      const count = await ctx.db.query("users").collect();
      if (count.length === 1) {
        await ctx.db.patch(userId, { role: "admin" });
        return;
      }

      // A new account needs an unused invite for its email. Throwing here
      // undoes the whole sign-up: the user and its login are written in this
      // same transaction.
      if (!existingUserId) {
        const email = user.email?.trim().toLowerCase();
        const allInvites = await ctx.db.query("invites").collect();
        const invite = email
          ? allInvites.find(
              (inv: Record<string, unknown>) =>
                typeof inv.email === "string" && inv.email.trim().toLowerCase() === email && !inv.used
            )
          : undefined;
        if (!invite) throw new ConvexError("Accounts are by invite only. Ask an admin for an invite link.");

        // Apply invite settings
        const updates: Record<string, unknown> = {};
        if (invite.role) updates.role = invite.role;
        if (invite.isFreelancer) updates.isFreelancer = true;
        if (invite.isReviewer) updates.isReviewer = true;
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
    },
  },
});
