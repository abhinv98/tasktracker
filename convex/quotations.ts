import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "./lib/guards";
import { allocateNumber } from "./agencyProfile";

const lineItemValidator = v.array(
  v.object({
    description: v.string(),
    qty: v.number(),
    rate: v.number(),
    amount: v.number(),
  })
);

/** Server-side money math — never trust client-computed totals. */
function computeTotals<T extends { qty: number; rate: number }>(
  lineItems: T[],
  gstPercent: number
) {
  const subtotal = lineItems.reduce(
    (sum, li) => sum + Math.round(li.qty * li.rate * 100) / 100,
    0
  );
  const taxAmount = Math.round(subtotal * gstPercent) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const items = lineItems.map((li) => ({
    ...li,
    amount: Math.round(li.qty * li.rate * 100) / 100,
  }));
  return { subtotal, taxAmount, total, items };
}

export const listQuotations = query({
  args: {
    brandId: v.optional(v.id("brands")),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("sent"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("invoiced")
      )
    ),
  },
  handler: async (ctx, { brandId, status }) => {
    await requireSuperAdmin(ctx);
    let quotations = brandId
      ? await ctx.db
          .query("quotations")
          .withIndex("by_brand", (q) => q.eq("brandId", brandId))
          .collect()
      : await ctx.db.query("quotations").collect();
    if (status) quotations = quotations.filter((q) => q.status === status);

    const brands = await ctx.db.query("brands").collect();
    const brandMap = new Map(brands.map((b) => [b._id, b]));
    return quotations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((q) => {
        const brand = brandMap.get(q.brandId);
        return {
          ...q,
          brandName: brand?.name ?? "Unknown",
          brandColor: brand?.color ?? "#6b7280",
        };
      });
  },
});

export const getQuotation = query({
  args: { quotationId: v.id("quotations") },
  handler: async (ctx, { quotationId }) => {
    await requireSuperAdmin(ctx);
    const q = await ctx.db.get(quotationId);
    if (!q) return null;
    const brand = await ctx.db.get(q.brandId);
    return {
      ...q,
      brandName: brand?.name ?? "Unknown",
      brandColor: brand?.color ?? "#6b7280",
    };
  },
});

export const createQuotation = mutation({
  args: {
    brandId: v.id("brands"),
    projectName: v.string(),
    lineItems: lineItemValidator,
    gstPercent: v.number(),
    notes: v.optional(v.string()),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperAdmin(ctx);
    if (args.lineItems.length === 0)
      throw new Error("Add at least one line item");
    const { subtotal, taxAmount, total, items } = computeTotals(
      args.lineItems,
      args.gstPercent
    );
    const quoteNumber = await allocateNumber(ctx, "quote");
    const now = Date.now();
    return await ctx.db.insert("quotations", {
      brandId: args.brandId,
      projectName: args.projectName,
      quoteNumber,
      status: "draft",
      lineItems: items,
      gstPercent: args.gstPercent,
      subtotal,
      taxAmount,
      total,
      notes: args.notes,
      validUntil: args.validUntil,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Drafts only — sent/approved documents are immutable (use Revise). */
export const updateQuotation = mutation({
  args: {
    quotationId: v.id("quotations"),
    projectName: v.optional(v.string()),
    lineItems: v.optional(lineItemValidator),
    gstPercent: v.optional(v.number()),
    notes: v.optional(v.string()),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, { quotationId, ...updates }) => {
    await requireSuperAdmin(ctx);
    const q = await ctx.db.get(quotationId);
    if (!q) throw new Error("Quotation not found");
    if (q.status !== "draft")
      throw new Error("Only draft quotations can be edited. Use Revise instead.");

    const lineItems = updates.lineItems ?? q.lineItems;
    const gstPercent = updates.gstPercent ?? q.gstPercent;
    const { subtotal, taxAmount, total, items } = computeTotals(
      lineItems,
      gstPercent
    );
    await ctx.db.patch(quotationId, {
      ...(updates.projectName !== undefined
        ? { projectName: updates.projectName }
        : {}),
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      ...(updates.validUntil !== undefined
        ? { validUntil: updates.validUntil }
        : {}),
      lineItems: items,
      gstPercent,
      subtotal,
      taxAmount,
      total,
      updatedAt: Date.now(),
    });
  },
});

export const setQuotationStatus = mutation({
  args: {
    quotationId: v.id("quotations"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("approved"),
      v.literal("rejected")
    ),
  },
  handler: async (ctx, { quotationId, status }) => {
    await requireSuperAdmin(ctx);
    const q = await ctx.db.get(quotationId);
    if (!q) throw new Error("Quotation not found");

    const legal: Record<string, string[]> = {
      draft: ["sent"],
      sent: ["approved", "rejected", "draft"],
      approved: [],
      rejected: [],
      invoiced: [],
    };
    if (!legal[q.status]?.includes(status))
      throw new Error(`Cannot move a ${q.status} quotation to ${status}`);

    const now = Date.now();
    await ctx.db.patch(quotationId, {
      status,
      updatedAt: now,
      ...(status === "sent" ? { sentAt: now } : {}),
      ...(status === "approved" ? { approvedAt: now } : {}),
      ...(status === "rejected" ? { rejectedAt: now } : {}),
    });
  },
});

/** Clone into a fresh draft (new number, revisionOf chain). The original
 *  stays untouched for the audit trail. */
export const reviseQuotation = mutation({
  args: { quotationId: v.id("quotations") },
  handler: async (ctx, { quotationId }) => {
    const user = await requireSuperAdmin(ctx);
    const q = await ctx.db.get(quotationId);
    if (!q) throw new Error("Quotation not found");
    if (q.status === "draft") throw new Error("Draft is already editable");

    const quoteNumber = await allocateNumber(ctx, "quote");
    const now = Date.now();
    return await ctx.db.insert("quotations", {
      brandId: q.brandId,
      projectName: q.projectName,
      quoteNumber,
      status: "draft",
      lineItems: q.lineItems,
      gstPercent: q.gstPercent,
      subtotal: q.subtotal,
      taxAmount: q.taxAmount,
      total: q.total,
      notes: q.notes,
      validUntil: q.validUntil,
      revisionOf: quotationId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const convertQuotationToInvoice = mutation({
  args: {
    quotationId: v.id("quotations"),
    issueDate: v.number(),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, { quotationId, issueDate, dueDate }) => {
    const user = await requireSuperAdmin(ctx);
    const q = await ctx.db.get(quotationId);
    if (!q) throw new Error("Quotation not found");
    if (q.status !== "approved")
      throw new Error("Only approved quotations can be invoiced");
    if (q.invoiceId) throw new Error("Already invoiced");

    const invoiceNumber = await allocateNumber(ctx, "invoice");
    const now = Date.now();
    const invoiceId = await ctx.db.insert("invoices", {
      brandId: q.brandId,
      quotationId,
      invoiceNumber,
      source: "generated",
      status: "draft",
      lineItems: q.lineItems,
      gstPercent: q.gstPercent,
      subtotal: q.subtotal,
      taxAmount: q.taxAmount,
      total: q.total,
      amountPaid: 0,
      issueDate,
      dueDate,
      notes: q.notes,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(quotationId, {
      status: "invoiced",
      invoiceId,
      updatedAt: now,
    });
    return invoiceId;
  },
});

export const deleteQuotation = mutation({
  args: { quotationId: v.id("quotations") },
  handler: async (ctx, { quotationId }) => {
    await requireSuperAdmin(ctx);
    const q = await ctx.db.get(quotationId);
    if (!q) throw new Error("Quotation not found");
    if (q.invoiceId)
      throw new Error("This quotation has an invoice. Delete the invoice first.");
    await ctx.db.delete(quotationId);
  },
});
