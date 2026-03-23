import { internalQuery } from "../_generated/server";

export const run = internalQuery({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const match = users.filter((u) =>
      (u.email && (u.email as string).toLowerCase().includes("sanskruti")) ||
      (u.name && u.name.toLowerCase().includes("sanskruti"))
    );
    const authAccounts = await ctx.db.query("authAccounts").collect();
    return match.map((u) => {
      const acc = authAccounts.find((a) => a.userId === u._id);
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        authProviderAccountId: acc?.providerAccountId,
      };
    });
  },
});
