import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Marks a brand on hold whose briefs were archived before the hold feature
 * existed, recording each brief's pre-archive status so Resume can restore it.
 * Run: npx convex run migrations/backfillBrandHold:run '{"brandId":"...","statuses":{"<briefId>":"active"}}'
 */
export const run = internalMutation({
  args: { brandId: v.id("brands"), statuses: v.record(v.string(), v.string()) },
  handler: async (ctx, { brandId, statuses }) => {
    let updated = 0;
    for (const [briefId, status] of Object.entries(statuses)) {
      const id = ctx.db.normalizeId("briefs", briefId);
      const brief = id && (await ctx.db.get(id));
      if (!brief || brief.brandId !== brandId || brief.status !== "archived") continue;
      await ctx.db.patch(brief._id, { statusBeforeHold: status });
      updated++;
    }
    await ctx.db.patch(brandId, { onHold: true });
    return { updated };
  },
});
