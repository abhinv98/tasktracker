import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile: (params) => {
        const name = (params.name as string) ?? params.email ?? "User";
        const email = params.email as string;
        if (!email) throw new Error("Email is required");
        // The invite link's token, so sign-up proves it holds the invite and not
        // just its email. Checked and cleared in afterUserCreatedOrUpdated.
        const inviteToken = typeof params.invite === "string" && params.invite ? params.invite : undefined;
        return {
          name,
          email,
          role: "employee" as const,
          ...(inviteToken ? { inviteToken } : {}),
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

      // A new account needs the token of an unused invite made out to its
      // email. Throwing here undoes the whole sign-up: the user and its login
      // are written in this same transaction.
      if (!existingUserId) {
        const token = user.inviteToken;
        const invite = token
          ? await (ctx as unknown as MutationCtx).db
              .query("invites")
              .withIndex("by_token", (q) => q.eq("token", token))
              .first()
          : null;
        if (
          !invite ||
          invite.used ||
          invite.email.trim().toLowerCase() !== user.email?.trim().toLowerCase()
        ) {
          throw new ConvexError("Accounts are by invite only. Ask an admin for an invite link.");
        }

        // Apply invite settings; the token has done its job.
        const updates: Record<string, unknown> = { inviteToken: undefined };
        if (invite.role) updates.role = invite.role;
        if (invite.isFreelancer) updates.isFreelancer = true;
        if (invite.isReviewer) updates.isReviewer = true;
        if (invite.name) updates.name = invite.name;
        if (invite.designation) updates.designation = invite.designation;

        await ctx.db.patch(userId, updates);

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
