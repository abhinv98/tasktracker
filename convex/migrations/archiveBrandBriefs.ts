import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Archives every brief of a brand (the brand itself is kept). Archived briefs
 * and their tasks drop out of employee and brand-manager dashboards; restore
 * from Archive if needed.
 * Run: npx convex run migrations/archiveBrandBriefs:run '{"brandId":"..."}'
 */
export const run = internalMutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const briefs = (await ctx.db.query("briefs").collect()).filter(
      (b) => b.brandId === brandId && b.status !== "archived"
    );
    const now = Date.now();
    let openTasks = 0;
    for (const b of briefs) {
      await ctx.db.patch(b._id, { status: "archived", archivedAt: now });
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", b._id))
        .collect();
      openTasks += tasks.filter((t) => t.status !== "done").length;
    }
    return { archivedBriefs: briefs.length, openTasksHidden: openTasks };
  },
});
