import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
  },
});

export const linkBrandManagerToAllBrands = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const brands = await ctx.db.query("brands").collect();
    let linked = 0;
    for (const brand of brands) {
      const existing = await ctx.db
        .query("brandManagers")
        .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
        .collect();
      if (existing.some((e) => e.managerId === userId)) continue;
      await ctx.db.insert("brandManagers", { brandId: brand._id, managerId: userId });
      linked++;
    }
    return { linked, brandCount: brands.length };
  },
});

export const patchUsersToEmployee = internalMutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    for (const id of userIds) {
      await ctx.db.patch(id, { role: "employee" });
    }
  },
});
