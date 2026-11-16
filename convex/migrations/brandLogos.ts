import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * One-off: give brands that have no logo the logo found for them (13 Nov 2026
 * request: "put in the respective logos"). Driven from a local script that
 * uploads each image with `uploadUrl` and then calls `setLogos`.
 *
 * Never replaces a logo someone already set: such a brand is skipped and the
 * file uploaded for it is removed again. Safe to re-run.
 */
export const uploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const setLogos = internalMutation({
  args: { logos: v.array(v.object({ brandId: v.id("brands"), storageId: v.id("_storage") })) },
  handler: async (ctx, { logos }) => {
    const set: string[] = [];
    const skipped: string[] = [];
    for (const { brandId, storageId } of logos) {
      const brand = await ctx.db.get(brandId);
      if (!brand || brand.logoId) {
        await ctx.storage.delete(storageId);
        skipped.push(brand ? `${brand.name} (already has a logo)` : `${brandId} (no such brand)`);
        continue;
      }
      await ctx.db.patch(brandId, { logoId: storageId });
      set.push(brand.name);
    }
    return { set, skipped };
  },
});
