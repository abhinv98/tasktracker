import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "./lib/internalAuth";
import { canViewBrief } from "./lib/guards";

export const getDeliverablesForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    // Deliverables carry internal review/client notes: internal viewers of the brief only.
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const task = await ctx.db.get(taskId);
    if (!user || !task || !(await canViewBrief(ctx, user, task.briefId))) return [];
    return await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
  },
});
