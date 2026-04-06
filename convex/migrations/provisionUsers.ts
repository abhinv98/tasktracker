import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

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

function randomPassword(): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@%&";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/**
 * One-off: create Navyaneel + Rishi with random passwords, employee role, Rishi as brand manager on all brands.
 * Run: `npx convex run migrations/provisionUsers:run`
 */
export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const navyEmail = "navyaneel.jagada@ecultify.com";
    const rishiEmail = "akkiofficial22@gmail.com";

    const mod = internal["migrations/provisionUsers"];
    const existingNavy = await ctx.runQuery(mod.getUserByEmail, { email: navyEmail });
    const existingRishi = await ctx.runQuery(mod.getUserByEmail, { email: rishiEmail });
    if (existingNavy || existingRishi) {
      throw new Error(
        `User already exists: ${[existingNavy && navyEmail, existingRishi && rishiEmail].filter(Boolean).join(", ")}`
      );
    }

    const navyPwd = randomPassword();
    const rishiPwd = randomPassword();

    const navy = await createAccount(ctx, {
      provider: "password",
      account: { id: navyEmail, secret: navyPwd },
      profile: {
        email: navyEmail,
        name: "Navyaneel Jagada",
        role: "employee",
      },
    });

    const rishi = await createAccount(ctx, {
      provider: "password",
      account: { id: rishiEmail, secret: rishiPwd },
      profile: {
        email: rishiEmail,
        name: "Rishi",
        role: "employee",
        designation: "Brand Manager",
      },
    });

    await ctx.runMutation(mod.patchUsersToEmployee, {
      userIds: [navy.user._id, rishi.user._id],
    });

    const bm = await ctx.runMutation(mod.linkBrandManagerToAllBrands, {
      userId: rishi.user._id,
    });

    return {
      navyaneel: {
        email: navyEmail,
        password: navyPwd,
        name: "Navyaneel Jagada",
        role: "employee",
      },
      rishi: {
        email: rishiEmail,
        password: rishiPwd,
        name: "Rishi",
        role: "employee",
        designation: "Brand Manager",
        brandManagerLinksAdded: bm.linked,
        brandCount: bm.brandCount,
      },
    };
  },
});
