import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Inspect every content_calendar brief that currently has a top-level
 * deadline set. Read-only — run BEFORE the destructive cousin below.
 */
export const findContentCalendarDeadlines = internalQuery({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    return briefs
      .filter(
        (b) => b.briefType === "content_calendar" && b.deadline !== undefined
      )
      .map((b) => ({
        id: b._id,
        title: b.title,
        deadline: b.deadline,
        brandId: b.brandId ?? null,
      }));
  },
});

/**
 * Clear the top-level deadline on every content_calendar brief. Idempotent.
 */
export const clearContentCalendarDeadlines = internalMutation({
  handler: async (ctx) => {
    const briefs = await ctx.db.query("briefs").collect();
    const targets = briefs.filter(
      (b) => b.briefType === "content_calendar" && b.deadline !== undefined
    );
    for (const b of targets) {
      await ctx.db.patch(b._id, { deadline: undefined });
    }
    return { cleared: targets.length, briefIds: targets.map((b) => b._id) };
  },
});
