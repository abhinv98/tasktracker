import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    let fixed = 0;
    const examples: { id: string; title: string; before: string; after: string }[] = [];

    for (const task of tasks) {
      if (!task.deadline) continue;
      const d = new Date(task.deadline);
      const uh = d.getUTCHours(), um = d.getUTCMinutes(), us = d.getUTCSeconds();

      let newDeadline: number | null = null;

      // Midnight UTC
      if (uh === 0 && um === 0 && us === 0) {
        d.setUTCHours(23, 59, 59, 999);
        newDeadline = d.getTime();
      }
      // Midnight IST (UTC+5:30) = 18:30:00 UTC previous day
      else if (uh === 18 && um === 30 && us === 0) {
        const before = d.toISOString();
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(18, 29, 59, 999);
        newDeadline = d.getTime();
      }

      if (newDeadline !== null) {
        const before = new Date(task.deadline).toISOString();
        await ctx.db.patch(task._id, { deadline: newDeadline });
        fixed++;
        if (examples.length < 15) {
          examples.push({ id: task._id, title: task.title, before, after: new Date(newDeadline).toISOString() });
        }
      }
    }

    return { fixed, total: tasks.filter((t) => t.deadline).length, examples };
  },
});
