import { internalQuery } from "../_generated/server";

export const run = internalQuery({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const matches = users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes("faiz")) ||
        (u.name && u.name.toLowerCase().includes("shaikh")) ||
        ((u as any).email && (u as any).email.toLowerCase().includes("faiz"))
    );
    return matches.map((u) => ({
      _id: u._id,
      name: u.name,
      email: (u as any).email,
      role: u.role,
    }));
  },
});
