// Self-check: a new task reopens a completed brief (convex/lib/syncBriefStatus.ts),
// against an in-memory stand-in for ctx.db:  node scripts/briefReopen.check.ts
import assert from "node:assert/strict";
import { reopenBriefForNewTask } from "../convex/lib/syncBriefStatus.ts";

type Row = Record<string, unknown> & { _id: string };

function fakeCtx(briefs: Row[], tasks: Row[]) {
  return {
    db: {
      get: async (id: string) => briefs.find((b) => b._id === id) ?? null,
      patch: async (id: string, fields: Record<string, unknown>) =>
        void Object.assign(briefs.find((b) => b._id === id)!, fields),
      // Only tasks.by_brief is queried.
      query: () => ({
        withIndex: (_: string, range: (q: { eq: (f: string, v: unknown) => unknown }) => unknown) => {
          let briefId: unknown;
          range({ eq: (_f, v) => (briefId = v) });
          return { collect: async () => tasks.filter((t) => t.briefId === briefId) };
        },
      }),
    },
  } as never;
}

async function statusAfter(brief: Row, tasks: Row[]) {
  await reopenBriefForNewTask(fakeCtx([brief], tasks), brief._id as never);
  return brief.status;
}
const task = (briefId: string, status: string, extra = {}) => ({ _id: `${briefId}:${status}:${Math.random()}`, briefId, status, ...extra });

// The reported case: a finished content calendar gets new entries.
assert.equal(
  await statusAfter({ _id: "cal", status: "completed", briefType: "content_calendar" }, [task("cal", "done"), task("cal", "pending")]),
  "in-progress"
);
// Same for a single-task brief that gains a second open task.
assert.equal(
  await statusAfter({ _id: "one", status: "completed", briefType: "single_task" }, [task("one", "done"), task("one", "pending")]),
  "in-progress"
);
// Nothing open: stays completed.
assert.equal(await statusAfter({ _id: "fin", status: "completed", briefType: "designing" }, [task("fin", "done")]), "completed");
// Only completed briefs are touched: a draft is not activated, a paused or archived brief stays put.
for (const status of ["draft", "on_hold", "archived"]) {
  assert.equal(await statusAfter({ _id: "x", status, briefType: "designing" }, [task("x", "pending")]), status);
}

console.log("briefReopen: ok");
