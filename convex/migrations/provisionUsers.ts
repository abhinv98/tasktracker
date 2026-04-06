import { internalAction } from "../_generated/server";
import { createAccount } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";

const getUserByEmail = makeFunctionReference<
  "query",
  { email: string },
  Doc<"users"> | null
>("migrations/provisionUsersInternals:getUserByEmail");

const patchUsersToEmployee = makeFunctionReference<
  "mutation",
  { userIds: Id<"users">[] },
  void
>("migrations/provisionUsersInternals:patchUsersToEmployee");

const linkBrandManagerToAllBrands = makeFunctionReference<
  "mutation",
  { userId: Id<"users"> },
  { linked: number; brandCount: number }
>("migrations/provisionUsersInternals:linkBrandManagerToAllBrands");

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

    const existingNavy = await ctx.runQuery(getUserByEmail, { email: navyEmail });
    const existingRishi = await ctx.runQuery(getUserByEmail, { email: rishiEmail });
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

    await ctx.runMutation(patchUsersToEmployee, {
      userIds: [navy.user._id, rishi.user._id],
    });

    const bm = await ctx.runMutation(linkBrandManagerToAllBrands, {
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
