// Who sees a recruitment brief, its tasks, and a candidate. Run:
// npx esbuild scripts/recruitAccess.check.ts --bundle --platform=node --format=esm --log-level=error | node --input-type=module -
import assert from "node:assert";
import { canViewBrief, canViewTask, canViewThread, guardRecruitment, guardRecruitmentManager, myCandidate, recruitmentBriefView, visibleTasks } from "../convex/lib/guards";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;
const tables: Record<string, Row[]> = {
  teams: [{ _id: "hr", name: "HR" }],
  briefTeams: [],
  recruitJobs: [{ sourceId: 1 }, { sourceId: 2, parentSourceId: 1 }, { sourceId: 3 }],
  hrRecords: [
    { _id: "r1", tracker: "rounds", fields: { job: "2" } },
    { _id: "r3", tracker: "rounds", fields: { job: "3" } },
    { _id: "c1", tracker: "pipeline", fields: { name: "A", job: "1", reqId: "r1" } },
    { _id: "c3", tracker: "pipeline", fields: { name: "B", job: "1", reqId: "r3" } },
    { _id: "c0", tracker: "pipeline", fields: { name: "C", job: "1" } },
    { _id: "i1", tracker: "interviews", fields: { candidateId: "c1" } },
  ],
  briefs: [
    { _id: "b1", briefType: "recruitment", hiringRoundId: "r1", createdBy: "hrUser" },
    { _id: "b3", briefType: "recruitment", hiringRoundId: "r3", createdBy: "hrUser" },
    { _id: "b0", briefType: "recruitment", createdBy: "hrUser", assignedManagerId: "manager" },
    { _id: "bd", briefType: "recruitment", createdBy: "delegate" },
    { _id: "d", briefType: "designing", createdBy: "admin" },
  ],
  tasks: [
    { _id: "t1", briefId: "b1", assigneeId: "designer", assignedBy: "hrUser" },
    { _id: "t2", briefId: "b1", assigneeId: "other", assignedBy: "hrUser", candidateId: "c1" },
    { _id: "t3", briefId: "bd", assigneeId: "other", assignedBy: "delegate", candidateId: "c1" },
    { _id: "t4", briefId: "bd", assigneeId: "other", assignedBy: "hrUser", candidateId: "c3" },
    { _id: "t5", briefId: "d", assigneeId: "other", assignedBy: "admin" },
  ],
};
const ctx: any = {
  db: {
    get: async (id: string) => Object.values(tables).flat().find((r) => r._id === id) ?? null,
    normalizeId: (_t: string, id: string) => id || null,
    query: (t: string) => {
      let rows = tables[t];
      const eq = { eq: (k: string, v: any) => ((rows = rows.filter((r) => r[k] === v)), eq) };
      const api: any = { withIndex: (_: string, f: any) => (f(eq), api), collect: async () => rows, first: async () => rows[0] ?? null };
      return api;
    },
  },
};
const brief = (id: string) => tables.briefs.find((b) => b._id === id)!;
const task = (id: string) => tables.tasks.find((t) => t._id === id)!;
const who: Record<string, Row> = {
  sa: { _id: "sa", role: "admin", isSuperAdmin: true },
  hrUser: { _id: "hrUser", role: "admin", isHR: true },
  manager: { _id: "manager", role: "admin" },
  admin: { _id: "admin", role: "admin" },
  delegate: { _id: "delegate", role: "admin", recruitJobs: [1] },
  designer: { _id: "designer", role: "employee" },
  stranger: { _id: "stranger", role: "employee" },
  client: { _id: "client", role: "client" },
  reviewer: { _id: "reviewer", role: "employee", isReviewer: true },
};
const view = (u: string, b: string) => recruitmentBriefView(ctx, who[u], brief(b));

async function main() {
  for (const b of ["b1", "b3", "b0"]) {
    assert.equal(await view("sa", b), "all");
    assert.equal(await view("hrUser", b), "all", "HR sees them although they are not on the HR team");
    for (const u of ["stranger", "client", "reviewer", "admin"]) assert.equal(await view(u, b), null, `${u} ${b}`);
  }
  assert.equal(await view("manager", "b0"), "all");
  assert.equal(await view("manager", "b1"), null);
  assert.equal(await view("delegate", "b1"), "all", "a sub-role of their position");
  assert.equal(await view("delegate", "b3"), null, "somebody else's position");
  assert.equal(await view("delegate", "b0"), null, "HR's general brief");
  assert.equal(await view("designer", "b1"), "own");
  assert.equal(await canViewBrief(ctx, who.designer, "b1" as any), true);
  assert.equal(await canViewBrief(ctx, who.admin, "b1" as any), false);
  assert.equal(await canViewTask(ctx, who.designer, task("t1")), true);
  assert.equal(await canViewTask(ctx, who.designer, task("t2")), false, "only their own");
  assert.equal(await canViewTask(ctx, who.hrUser, task("t2")), true);
  // Every other brief keeps the rule it had.
  assert.equal(await canViewBrief(ctx, who.admin, "d" as any), true);
  assert.equal(await canViewBrief(ctx, who.hrUser, "d" as any), false);

  // Someone hiring for a few positions: their own general brief, but not another position's candidate in it.
  assert.equal(await view("delegate", "bd"), "all");
  const seen = async (u: string, b: string) => (await visibleTasks(ctx, who[u], brief(b), tables.tasks.filter((t) => t.briefId === b))).map((t) => t._id);
  assert.deepEqual(await seen("delegate", "bd"), ["t3"]);
  assert.deepEqual(await seen("hrUser", "bd"), ["t3", "t4"]);
  assert.deepEqual(await seen("stranger", "bd"), []);
  assert.deepEqual(await seen("admin", "d"), ["t5"], "other briefs are not filtered");
  // Discussion and files: the brief's own only for who runs it, a task's for who sees the task.
  const thread = (u: string, type: "brief" | "task", id: string) => canViewThread(ctx, who[u]._id, type, id);
  tables.users = Object.values(who);
  assert.deepEqual([await thread("designer", "brief", "b1"), await thread("designer", "task", "t1"), await thread("designer", "task", "t2")], [false, true, false]);
  assert.deepEqual([await thread("admin", "brief", "b1"), await thread("admin", "brief", "d"), await thread("stranger", "task", "t5")], [false, true, true]);
  // Running it: an admin who is not part of it cannot take it over, archive or delete it.
  await assert.rejects(() => guardRecruitment(ctx, "admin" as any, "b1" as any));
  await assert.rejects(() => guardRecruitment(ctx, "designer" as any, "b1" as any));
  await assert.rejects(() => guardRecruitment(ctx, "delegate" as any, "bd" as any, task("t4")), "not a task they cannot see");
  await assert.rejects(() => guardRecruitment(ctx, "delegate" as any, "bd" as any), "nor a whole brief holding one");
  await assert.rejects(() => guardRecruitmentManager(ctx, "delegate" as any, "b1" as any), "managers see everything: HR's to choose");
  await guardRecruitmentManager(ctx, "hrUser" as any, "b1" as any);
  await guardRecruitmentManager(ctx, "admin" as any, "d" as any);
  assert.equal(await guardRecruitment(ctx, "delegate" as any, "b1" as any), true, "all of it is theirs");
  assert.equal(await guardRecruitment(ctx, "hrUser" as any, "b1" as any), true);
  assert.equal(await guardRecruitment(ctx, "admin" as any, "d" as any), false, "other briefs keep their own rules");

  const full: any = { full: true, jobs: new Set() };
  const scoped: any = { full: false, jobs: new Set([1, 2]) };
  assert.ok(await myCandidate(ctx, "c3" as any, full));
  assert.ok(await myCandidate(ctx, "c1" as any, scoped));
  assert.ok(await myCandidate(ctx, "c0" as any, scoped));
  assert.equal(await myCandidate(ctx, "c3" as any, scoped), null, "placed in someone else's opening");
  assert.equal(await myCandidate(ctx, "i1" as any, full), null, "not a candidate");
  assert.equal(await myCandidate(ctx, "c1" as any, null), null);
  console.log("recruitAccess: ok");
}
main();
