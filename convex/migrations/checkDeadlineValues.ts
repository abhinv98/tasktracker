import { internalQuery } from "../_generated/server";

export const run = internalQuery({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const now = Date.now();

    const mar23Tasks = tasks
      .filter((t) => t.deadline && t.status !== "done")
      .map((t) => ({
        title: t.title,
        deadline: t.deadline,
        deadlineISO: new Date(t.deadline!).toISOString(),
        nowISO: new Date(now).toISOString(),
        isPast: t.deadline! < now,
      }))
      .filter((t) => t.deadlineISO.includes("2026-03-23"))
      .slice(0, 10);

    return { now, nowISO: new Date(now).toISOString(), mar23Tasks };
  },
});
