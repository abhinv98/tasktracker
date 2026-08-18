import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Petty cash ledger. Cash moves allocator → giver → recipient; the recipient
 * spends some and returns the remainder.
 *
 * Access is deliberately narrow: this is money, and the row set is small
 * enough that "everyone with a login" would be a real disclosure. The same
 * rule is mirrored in src/lib/pettyCash.ts for the nav and route guard —
 * Convex bundles separately and can't import from src/, so the two copies are
 * kept in step by hand.
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

/** Every disbursement, newest given-date first. Returns [] without access. */
export const listDisbursements = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!hasAccess(user)) return [];

    const rows = await ctx.db.query("disbursements").collect();
    const users = await ctx.db.query("users").collect();

    return rows
      .sort((a, b) => b.givenDate.localeCompare(a.givenDate))
      .map((d) => ({
        ...d,
        createdByName:
          users.find((u) => u._id === d.createdBy)?.name ?? undefined,
      }));
  },
});

/** Drives the nav item and the page's own guard. */
export const canAccessPettyCash = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    return hasAccess(await ctx.db.get(userId));
  },
});

function clean(s: string): string {
  return s.trim();
}

/** Rejects negatives and non-numbers — a bad amount silently stored as 0 is worse than a failed save. */
function amount(n: number | undefined, field: string): number {
  const value = Number(n ?? 0);
  if (!isFinite(value) || value < 0) {
    throw new Error(`${field} must be a number of 0 or more`);
  }
  return value;
}

export const createDisbursement = mutation({
  args: {
    allocator: v.string(),
    giver: v.string(),
    recipient: v.string(),
    amountAllocated: v.optional(v.number()),
    amountGiven: v.number(),
    amountSpent: v.optional(v.number()),
    givenDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx);

    const allocator = clean(args.allocator);
    const giver = clean(args.giver);
    const recipient = clean(args.recipient);
    if (!allocator) throw new Error("Allocator is required");
    if (!giver || !recipient) throw new Error("Giver and recipient are required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.givenDate)) {
      throw new Error("Given date is required");
    }

    return await ctx.db.insert("disbursements", {
      allocator,
      giver,
      recipient,
      amountAllocated: amount(args.amountAllocated, "Amount allocated"),
      amountGiven: amount(args.amountGiven, "Amount given"),
      amountSpent: amount(args.amountSpent, "Amount spent"),
      givenDate: args.givenDate,
      remainderReturned: false,
      notes: args.notes?.trim() || undefined,
      createdBy: userId,
    });
  },
});

export const updateDisbursement = mutation({
  args: {
    id: v.id("disbursements"),
    allocator: v.optional(v.string()),
    giver: v.optional(v.string()),
    recipient: v.optional(v.string()),
    amountAllocated: v.optional(v.number()),
    amountGiven: v.optional(v.number()),
    amountSpent: v.optional(v.number()),
    givenDate: v.optional(v.string()),
    remainderReturned: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await requireAccess(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("That disbursement no longer exists");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };

    if (rest.allocator !== undefined) {
      const v2 = clean(rest.allocator);
      if (!v2) throw new Error("Allocator is required");
      patch.allocator = v2;
    }
    if (rest.giver !== undefined) {
      const v2 = clean(rest.giver);
      if (!v2) throw new Error("Giver is required");
      patch.giver = v2;
    }
    if (rest.recipient !== undefined) {
      const v2 = clean(rest.recipient);
      if (!v2) throw new Error("Recipient is required");
      patch.recipient = v2;
    }
    if (rest.amountAllocated !== undefined)
      patch.amountAllocated = amount(rest.amountAllocated, "Amount allocated");
    if (rest.amountGiven !== undefined)
      patch.amountGiven = amount(rest.amountGiven, "Amount given");
    if (rest.amountSpent !== undefined)
      patch.amountSpent = amount(rest.amountSpent, "Amount spent");
    if (rest.givenDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rest.givenDate)) {
        throw new Error("Given date must be a calendar date");
      }
      patch.givenDate = rest.givenDate;
    }
    if (rest.notes !== undefined) patch.notes = rest.notes.trim() || undefined;
    if (rest.remainderReturned !== undefined) {
      patch.remainderReturned = rest.remainderReturned;
      // Stamp when it came back, clear it when the toggle is undone — a
      // returned_at left behind on an un-returned record reads as a fact.
      patch.returnedAt = rest.remainderReturned ? Date.now() : undefined;
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
