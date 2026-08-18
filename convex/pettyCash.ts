import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Petty cash, as a float.
 *
 * HR and the accountant hold an allocated amount. They hand chunks of it to
 * the office boys for errands; the office boy comes back with the remainder
 * and an account of what he bought. Only at that point is anything "spent" —
 * before it, the money is out of the drawer but still the company's.
 *
 *   in hand = allocated − handed out + returned
 *
 * Access is deliberately narrow: this is money. The same rule is mirrored in
 * src/lib/pettyCash.ts for the nav and route guard — Convex bundles
 * separately and can't import from src/.
 * ponytail: duplicated predicate, collapse into a shared module if a third
 * caller appears.
 */
const PETTY_CASH_EMAILS = ["dhriti@ecultify.com"];

function hasAccess(user: any): boolean {
  if (!user) return false;
  return (
    user.isSuperAdmin === true ||
    user.isAccountant === true ||
    user.isHR === true ||
    PETTY_CASH_EMAILS.includes((user.email ?? "").toLowerCase())
  );
}

async function requireAccess(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!hasAccess(user)) throw new Error("Petty cash is restricted");
  return { userId, user };
}

/** Rejects negatives and non-numbers — a bad amount stored as 0 is worse than a failed save. */
function amount(n: number | undefined, field: string): number {
  const value = Number(n ?? 0);
  if (!isFinite(value) || value < 0) {
    throw new Error(`${field} must be a number of 0 or more`);
  }
  return value;
}

function requireDate(d: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`${field} is required`);
  return d;
}

/**
 * Everything the page renders from, in one round trip: the float top-ups, the
 * handouts, and who is allowed to hold a float. Returns empty without access.
 */
export const getLedger = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const me = userId ? await ctx.db.get(userId) : null;
    if (!hasAccess(me)) {
      return { allocations: [], disbursements: [], holders: [] };
    }

    const users = await ctx.db.query("users").collect();
    const nameOf = (id: string) =>
      users.find((u) => u._id === id)?.name ??
      users.find((u) => u._id === id)?.email ??
      "Unknown";

    const allocations = (await ctx.db.query("pettyCashAllocations").collect())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((a) => ({ ...a, holderName: nameOf(a.holderId) }));

    const disbursements = (await ctx.db.query("disbursements").collect())
      .sort((a, b) => b.givenDate.localeCompare(a.givenDate))
      .map((d) => ({ ...d, holderName: nameOf(d.holderId) }));

    // Anyone who may hold a float — the same people who can open this page.
    const holders = users
      .filter((u) => hasAccess(u))
      .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { allocations, disbursements, holders };
  },
});

/** Drives the nav item and the route guard. */
export const canAccessPettyCash = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    return hasAccess(await ctx.db.get(userId));
  },
});

// ── Allocations (float top-ups) ───────────────────────────────────

export const createAllocation = mutation({
  args: {
    holderId: v.id("users"),
    amount: v.number(),
    date: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx);
    const holder = await ctx.db.get(args.holderId);
    if (!hasAccess(holder)) {
      throw new Error("That person can't hold petty cash");
    }
    const value = amount(args.amount, "Amount");
    if (value <= 0) throw new Error("An allocation has to be more than zero");

    return await ctx.db.insert("pettyCashAllocations", {
      holderId: args.holderId,
      amount: value,
      date: requireDate(args.date, "Date"),
      note: args.note?.trim() || undefined,
      createdBy: userId,
    });
  },
});

export const deleteAllocation = mutation({
  args: { id: v.id("pettyCashAllocations") },
  handler: async (ctx, { id }) => {
    await requireAccess(ctx);
    await ctx.db.delete(id);
  },
});

// ── Handouts ──────────────────────────────────────────────────────

export const createDisbursement = mutation({
  args: {
    holderId: v.id("users"),
    recipient: v.string(),
    purpose: v.string(),
    amountGiven: v.number(),
    givenDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx);
    const recipient = args.recipient.trim();
    const purpose = args.purpose.trim();
    if (!recipient) throw new Error("Who is the cash going to?");
    if (!purpose) throw new Error("What is the cash for?");
    const given = amount(args.amountGiven, "Amount given");
    if (given <= 0) throw new Error("A handout has to be more than zero");

    return await ctx.db.insert("disbursements", {
      holderId: args.holderId,
      recipient,
      purpose,
      amountGiven: given,
      givenDate: requireDate(args.givenDate, "Given date"),
      settled: false,
      createdBy: userId,
    });
  },
});

/**
 * Close out a handout: the remainder came back and the spend is explained.
 * The explanation is required — an unexplained settlement is exactly the hole
 * this page exists to close.
 */
export const settleDisbursement = mutation({
  args: {
    id: v.id("disbursements"),
    amountReturned: v.number(),
    spentOn: v.string(),
  },
  handler: async (ctx, { id, amountReturned, spentOn }) => {
    await requireAccess(ctx);
    const d = await ctx.db.get(id);
    if (!d) throw new Error("That handout no longer exists");

    const returned = amount(amountReturned, "Amount returned");
    if (returned > d.amountGiven) {
      throw new Error(
        `Can't return more than was handed out (₹${d.amountGiven})`
      );
    }
    const explanation = spentOn.trim();
    if (!explanation) {
      throw new Error("Say what the money was spent on");
    }

    await ctx.db.patch(id, {
      settled: true,
      amountReturned: returned,
      spentOn: explanation,
      settledAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Undo a settlement — the cash goes back to being out. */
export const reopenDisbursement = mutation({
  args: { id: v.id("disbursements") },
  handler: async (ctx, { id }) => {
    await requireAccess(ctx);
    await ctx.db.patch(id, {
      settled: false,
      amountReturned: undefined,
      spentOn: undefined,
      settledAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const updateDisbursement = mutation({
  args: {
    id: v.id("disbursements"),
    holderId: v.optional(v.id("users")),
    recipient: v.optional(v.string()),
    purpose: v.optional(v.string()),
    amountGiven: v.optional(v.number()),
    givenDate: v.optional(v.string()),
    amountReturned: v.optional(v.number()),
    spentOn: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await requireAccess(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("That handout no longer exists");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (rest.holderId !== undefined) patch.holderId = rest.holderId;
    if (rest.recipient !== undefined) {
      const v2 = rest.recipient.trim();
      if (!v2) throw new Error("Who is the cash going to?");
      patch.recipient = v2;
    }
    if (rest.purpose !== undefined) {
      const v2 = rest.purpose.trim();
      if (!v2) throw new Error("What is the cash for?");
      patch.purpose = v2;
    }
    if (rest.amountGiven !== undefined) {
      const given = amount(rest.amountGiven, "Amount given");
      if (given <= 0) throw new Error("A handout has to be more than zero");
      patch.amountGiven = given;
    }
    if (rest.givenDate !== undefined) {
      patch.givenDate = requireDate(rest.givenDate, "Given date");
    }
    if (rest.amountReturned !== undefined) {
      patch.amountReturned = amount(rest.amountReturned, "Amount returned");
    }
    if (rest.spentOn !== undefined) patch.spentOn = rest.spentOn.trim() || undefined;

    // Editing a settled handout must not let the returned amount drift above
    // what was given — that would mint cash into the float.
    const given =
      (patch.amountGiven as number | undefined) ?? existing.amountGiven;
    const returned =
      (patch.amountReturned as number | undefined) ?? existing.amountReturned ?? 0;
    if (existing.settled && returned > given) {
      throw new Error(`Returned can't be more than the ₹${given} handed out`);
    }

    await ctx.db.patch(id, patch);
  },
});

export const deleteDisbursement = mutation({
  args: { id: v.id("disbursements") },
  handler: async (ctx, { id }) => {
    await requireAccess(ctx);
    await ctx.db.delete(id);
  },
});
