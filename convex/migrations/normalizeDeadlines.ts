import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let briefCount = 0;
    let taskCount = 0;

    const briefs = await ctx.db.query("briefs").collect();
    for (const brief of briefs) {
      if (brief.deadline !== undefined) {
        const d = new Date(brief.deadline);
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
          d.setHours(23, 59, 59, 999);
          await ctx.db.patch(brief._id, { deadline: d.getTime() });
          briefCount++;
        }
      }
    }

    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      if (task.deadline !== undefined) {
        const d = new Date(task.deadline);
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
          d.setHours(23, 59, 59, 999);
          await ctx.db.patch(task._id, { deadline: d.getTime() });
          taskCount++;
        }
      }
    }

    console.log(`Normalized ${briefCount} brief deadlines and ${taskCount} task deadlines to 23:59:59.999`);
    return { briefCount, taskCount };
  },
});
