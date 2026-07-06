import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "./lib/guards";
import { allocateNumber } from "./agencyProfile";
import type { Doc } from "./_generated/dataModel";

const lineItemValidator = v.array(
  v.object({
    description: v.string(),
    qty: v.number(),
    rate: v.number(),
    amount: v.number(),
  })
);

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

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "overdue" is derived, never stored — self-corrects when dueDate changes
 *  or a payment lands. */
function effectiveStatus(inv: Doc<"invoices">): string {
  if (
    inv.status !== "paid" &&
    inv.status !== "draft" &&
    inv.dueDate &&
    inv.dueDate < startOfToday()
  )
    return "overdue";
  return inv.status;
}

export const listInvoices = query({
  args: {
    brandId: v.optional(v.id("brands")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { brandId, status }) => {
    await requireSuperAdmin(ctx);
    const invoices = brandId
      ? await ctx.db
          .query("invoices")
          .withIndex("by_brand", (q) => q.eq("brandId", brandId))
          .collect()
      : await ctx.db.query("invoices").collect();

    const brands = await ctx.db.query("brands").collect();
    const brandMap = new Map(brands.map((b) => [b._id, b]));

    let rows = invoices.map((inv) => {
      const brand = brandMap.get(inv.brandId);
      return {
        ...inv,
        effectiveStatus: effectiveStatus(inv),
        balance: Math.round((inv.total - inv.amountPaid) * 100) / 100,
        brandName: brand?.name ?? "Unknown",
        brandColor: brand?.color ?? "#6b7280",
      };
    });
    if (status) rows = rows.filter((r) => r.effectiveStatus === status);
    return rows.sort((a, b) => b.issueDate - a.issueDate);
  },
});

export const getInvoice = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    await requireSuperAdmin(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) return null;
    const brand = await ctx.db.get(inv.brandId);
    const payments = await ctx.db
      .query("invoicePayments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .collect();
    const quotation = inv.quotationId ? await ctx.db.get(inv.quotationId) : null;
    const users = await ctx.db.query("users").collect();
    const pdfUrl = inv.pdfStorageId
      ? await ctx.storage.getUrl(inv.pdfStorageId)
      : null;
    return {
      ...inv,
      effectiveStatus: effectiveStatus(inv),
      balance: Math.round((inv.total - inv.amountPaid) * 100) / 100,
      brandName: brand?.name ?? "Unknown",
      brandColor: brand?.color ?? "#6b7280",
      quotation: quotation
        ? { _id: quotation._id, quoteNumber: quotation.quoteNumber, projectName: quotation.projectName }
        : null,
      pdfUrl,
      payments: payments
        .sort((a, b) => b.paidOn - a.paidOn)
        .map((p) => {
          const u = users.find((x) => x._id === p.recordedBy);
          return { ...p, recordedByName: u?.name ?? u?.email ?? "Unknown" };
        }),
    };
  },
});

export const createInvoice = mutation({
  args: {
    brandId: v.id("brands"),
    source: v.union(v.literal("generated"), v.literal("external")),
    issueDate: v.number(),
    dueDate: v.optional(v.number()),
    quotationId: v.optional(v.id("quotations")),
    briefIds: v.optional(v.array(v.id("briefs"))),
    notes: v.optional(v.string()),
    // Generated invoices:
    lineItems: v.optional(lineItemValidator),
    gstPercent: v.optional(v.number()),
    // External invoices:
    invoiceNumber: v.optional(v.string()),
    total: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperAdmin(ctx);
    const now = Date.now();

    if (args.source === "generated") {
      if (!args.lineItems || args.lineItems.length === 0)
        throw new Error("Add at least one line item");
      const gst = args.gstPercent ?? 0;
      const { subtotal, taxAmount, total, items } = computeTotals(
        args.lineItems,
        gst
      );
      const invoiceNumber = await allocateNumber(ctx, "invoice");
      return await ctx.db.insert("invoices", {
        brandId: args.brandId,
        quotationId: args.quotationId,
        briefIds: args.briefIds,
        invoiceNumber,
        source: "generated",
        status: "draft",
        lineItems: items,
        gstPercent: gst,
        subtotal,
        taxAmount,
        total,
        amountPaid: 0,
        issueDate: args.issueDate,
        dueDate: args.dueDate,
        notes: args.notes,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    // External: tracked, not generated.
    if (!args.invoiceNumber?.trim()) throw new Error("Invoice number required");
    if (args.total === undefined || args.total <= 0)
      throw new Error("Invoice amount required");
    return await ctx.db.insert("invoices", {
      brandId: args.brandId,
      quotationId: args.quotationId,
      briefIds: args.briefIds,
      invoiceNumber: args.invoiceNumber.trim(),
      source: "external",
      status: "unpaid",
      total: args.total,
      amountPaid: 0,
      issueDate: args.issueDate,
      dueDate: args.dueDate,
      pdfStorageId: args.pdfStorageId,
      notes: args.notes,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateInvoice = mutation({
  args: {
    invoiceId: v.id("invoices"),
    issueDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    briefIds: v.optional(v.array(v.id("briefs"))),
    lineItems: v.optional(lineItemValidator),
    gstPercent: v.optional(v.number()),
    invoiceNumber: v.optional(v.string()),
    total: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { invoiceId, ...updates }) => {
    await requireSuperAdmin(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Invoice not found");

    if (inv.source === "generated") {
      // Line items lock once finalized; metadata (due date, notes) stays editable.
      if (
        inv.status !== "draft" &&
        (updates.lineItems || updates.gstPercent !== undefined)
      )
        throw new Error("Finalized invoices can't change line items");
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (updates.lineItems) {
        const gst = updates.gstPercent ?? inv.gstPercent ?? 0;
        const { subtotal, taxAmount, total, items } = computeTotals(
          updates.lineItems,
          gst
        );
        Object.assign(patch, {
          lineItems: items,
          gstPercent: gst,
          subtotal,
          taxAmount,
          total,
        });
      }
      if (updates.issueDate !== undefined) patch.issueDate = updates.issueDate;
      if (updates.dueDate !== undefined) patch.dueDate = updates.dueDate;
      if (updates.notes !== undefined) patch.notes = updates.notes;
      if (updates.briefIds !== undefined) patch.briefIds = updates.briefIds;
      await ctx.db.patch(invoiceId, patch);
      return;
    }

    // External invoices stay fully editable.
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.invoiceNumber !== undefined)
      patch.invoiceNumber = updates.invoiceNumber.trim();
    if (updates.total !== undefined) patch.total = updates.total;
    if (updates.issueDate !== undefined) patch.issueDate = updates.issueDate;
    if (updates.dueDate !== undefined) patch.dueDate = updates.dueDate;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.briefIds !== undefined) patch.briefIds = updates.briefIds;
    if (updates.pdfStorageId !== undefined)
      patch.pdfStorageId = updates.pdfStorageId;
    await ctx.db.patch(invoiceId, patch);
    // Total may have changed — re-derive the paid status.
    await recomputePaymentState(ctx, invoiceId);
  },
});

/** Draft → unpaid; locks a generated invoice's line items. */
export const finalizeInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    await requireSuperAdmin(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status !== "draft") throw new Error("Invoice is already finalized");
    await ctx.db.patch(invoiceId, { status: "unpaid", updatedAt: Date.now() });
  },
});

async function recomputePaymentState(ctx: any, invoiceId: any) {
  const inv = await ctx.db.get(invoiceId);
  if (!inv || inv.status === "draft") return;
  const payments = await ctx.db
    .query("invoicePayments")
    .withIndex("by_invoice", (q: any) => q.eq("invoiceId", invoiceId))
    .collect();
  const amountPaid =
    Math.round(
      payments.reduce((s: number, p: any) => s + p.amount, 0) * 100
    ) / 100;
  const status =
    amountPaid >= inv.total ? "paid" : amountPaid > 0 ? "partially_paid" : "unpaid";
  await ctx.db.patch(invoiceId, { amountPaid, status, updatedAt: Date.now() });
}

export const recordPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    amount: v.number(),
    paidOn: v.number(),
    method: v.optional(v.string()),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperAdmin(ctx);
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "draft")
      throw new Error("Finalize the invoice before recording payments");
    if (args.amount <= 0) throw new Error("Payment amount must be positive");

    await ctx.db.insert("invoicePayments", {
      invoiceId: args.invoiceId,
      amount: args.amount,
      paidOn: args.paidOn,
      method: args.method,
      reference: args.reference,
      note: args.note,
      recordedBy: user._id,
      createdAt: Date.now(),
    });
    await recomputePaymentState(ctx, args.invoiceId);
  },
});

export const deletePayment = mutation({
  args: { paymentId: v.id("invoicePayments") },
  handler: async (ctx, { paymentId }) => {
    await requireSuperAdmin(ctx);
    const payment = await ctx.db.get(paymentId);
    if (!payment) throw new Error("Payment not found");
    await ctx.db.delete(paymentId);
    await recomputePaymentState(ctx, payment.invoiceId);
  },
});

/** Cascade-deletes payments; a linked quotation reverts to approved so it
 *  can be re-invoiced. */
export const deleteInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    await requireSuperAdmin(ctx);
    const inv = await ctx.db.get(invoiceId);
    if (!inv) throw new Error("Invoice not found");

    const payments = await ctx.db
      .query("invoicePayments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .collect();
    for (const p of payments) await ctx.db.delete(p._id);

    if (inv.quotationId) {
      const q = await ctx.db.get(inv.quotationId);
      if (q && q.invoiceId === invoiceId) {
        await ctx.db.patch(inv.quotationId, {
          status: "approved",
          invoiceId: undefined,
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.db.delete(invoiceId);
  },
});

/** Stat tiles for the Overview tab. */
export const financeOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const invoices = await ctx.db.query("invoices").collect();
    const quotations = await ctx.db.query("quotations").collect();
    const payments = await ctx.db.query("invoicePayments").collect();
    const brands = await ctx.db.query("brands").collect();
    const brandMap = new Map(brands.map((b) => [b._id, b.name]));
    const invoiceMap = new Map(invoices.map((i) => [i._id, i]));

    const today = startOfToday();
    let outstanding = 0;
    let overdueTotal = 0;
    let overdueCount = 0;
    let draftCount = 0;
    for (const inv of invoices) {
      if (inv.status === "draft") {
        draftCount++;
        continue;
      }
      const balance = inv.total - inv.amountPaid;
      if (balance > 0) {
        outstanding += balance;
        if (inv.dueDate && inv.dueDate < today) {
          overdueTotal += balance;
          overdueCount++;
        }
      }
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const collectedThisMonth = payments
      .filter((p) => p.paidOn >= monthStart.getTime())
      .reduce((s, p) => s + p.amount, 0);

    const recentPayments = payments
      .sort((a, b) => b.paidOn - a.paidOn)
      .slice(0, 8)
      .map((p) => {
        const inv = invoiceMap.get(p.invoiceId);
        return {
          ...p,
          invoiceNumber: inv?.invoiceNumber ?? "—",
          brandName: inv ? brandMap.get(inv.brandId) ?? "Unknown" : "Unknown",
        };
      });

    return {
      outstanding: Math.round(outstanding * 100) / 100,
      overdueTotal: Math.round(overdueTotal * 100) / 100,
      overdueCount,
      collectedThisMonth: Math.round(collectedThisMonth * 100) / 100,
      draftCount,
      quotesAwaiting: quotations.filter((q) => q.status === "sent").length,
      recentPayments,
    };
  },
});

/** Upload slot for an external invoice PDF (Convex storage). */
export const generateInvoicePdfUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
