import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "./lib/guards";

/** The agency identity singleton (name, GSTIN, bank, numbering). */
export const getAgencyProfile = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const profile = await ctx.db.query("agencyProfile").first();
    if (!profile) return null;
    const logoUrl = profile.logoId
      ? await ctx.storage.getUrl(profile.logoId)
      : null;
    return { ...profile, logoUrl };
  },
});

export const saveAgencyProfile = mutation({
  args: {
    name: v.string(),
    addressLines: v.array(v.string()),
    gstin: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    bankName: v.optional(v.string()),
    accountName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    ifsc: v.optional(v.string()),
    upiId: v.optional(v.string()),
    logoId: v.optional(v.id("_storage")),
    invoicePrefix: v.string(),
    nextInvoiceNumber: v.number(),
    quotePrefix: v.string(),
    nextQuoteNumber: v.number(),
    defaultGstPercent: v.number(),
    termsNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperAdmin(ctx);
    const existing = await ctx.db.query("agencyProfile").first();
    const patch = { ...args, updatedBy: user._id, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("agencyProfile", patch);
  },
});

/** Allocate the next document number, incrementing the counter. Convex
 *  mutations are serialized, so this is race-safe. */
export async function allocateNumber(
  ctx: any,
  kind: "invoice" | "quote"
): Promise<string> {
  const profile = await ctx.db.query("agencyProfile").first();
  if (!profile)
    throw new Error("Set up the agency profile first (Invoices → Settings)");
  const field = kind === "invoice" ? "nextInvoiceNumber" : "nextQuoteNumber";
  const prefix = kind === "invoice" ? profile.invoicePrefix : profile.quotePrefix;
  const n = profile[field] as number;
  await ctx.db.patch(profile._id, { [field]: n + 1 });
  return `${prefix}${String(n).padStart(4, "0")}`;
}
