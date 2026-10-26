import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * updateTaskStatus that shows the new status at once. A Convex mutation only
 * resolves after every open query has re-run with its write, which takes
 * seconds on a busy server, so the task modal and the brief board are patched
 * locally first. Convex drops the local patch if the mutation throws.
 */
export function useUpdateTaskStatus() {
  return useMutation(api.tasks.updateTaskStatus).withOptimisticUpdate(
    (store, { taskId, newStatus }) => {
      for (const { args, value } of store.getAllQueries(api.tasks.getTaskDetail)) {
        if (value && args.taskId === taskId) {
          store.setQuery(api.tasks.getTaskDetail, args, {
            ...value,
            task: { ...value.task, status: newStatus },
          });
        }
      }
      for (const { args, value } of store.getAllQueries(api.tasks.listTasksForUser)) {
        if (value?.some((t) => t._id === taskId)) {
          store.setQuery(
            api.tasks.listTasksForUser,
            args,
            value.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t))
          );
        }
      }
      for (const { args, value } of store.getAllQueries(api.tasks.listTasksForBrief)) {
        if (!value?.tasks.some((t) => t._id === taskId)) continue;
        const patch = <T extends { _id: string; status: string }>(t: T): T =>
          t._id === taskId ? { ...t, status: newStatus } : t;
        store.setQuery(api.tasks.listTasksForBrief, args, {
          ...value,
          tasks: value.tasks.map(patch),
          byTeam: Object.fromEntries(
            Object.entries(value.byTeam).map(([team, rows]) => [
              team,
              rows.map((r) => ({ ...r, task: patch(r.task) })),
            ])
          ),
        });
      }
    }
  );
}
