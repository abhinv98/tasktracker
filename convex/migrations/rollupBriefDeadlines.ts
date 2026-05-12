import { internalMutation } from "../_generated/server";
import { recomputeBriefDeadline } from "../lib/recomputeBriefDeadline";

/**
 * One-time backfill: roll every non-content-calendar brief's top-level
 * deadline up to the latest deadline among its top-level tasks ("last
 * node in sequence"). Briefs with no task deadlines are left alone.
 */
export const run = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    let scanned = 0;
    let updated = 0;

    for (const brief of briefs) {
      if (brief.briefType === "content_calendar") continue;
      scanned++;

      const before = brief.deadline;
      await recomputeBriefDeadline(ctx, brief._id);
      const after = (await ctx.db.get(brief._id))?.deadline;

      if (before !== after) updated++;
    }

    return { scanned, updated };
  },
});
