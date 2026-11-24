// Shortlisting: applicants land on Candidates once, in the right open position, with an unused ID.
// Run: npx tsx scripts/candidates.check.ts
import assert from "node:assert";
import { addToCandidates, followApplication, followCandidate, placeInRound, standing } from "../convex/lib/candidates";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;
const tables: Record<string, Row[]> = {
  recruitCandidates: [],
  recruitActivity: [],
  recruitJobs: [
    { _id: "j1", sourceId: 1, name: "Design" },
    { _id: "j2", sourceId: 2, name: "Motion", parentSourceId: 1 },
    { _id: "j3", sourceId: 3, name: "Copy" },
    { _id: "j4", sourceId: 4, name: "Accounts" },
    { _id: "j5", sourceId: 5, name: "Social Intern", parentSourceId: 4 },
  ],
  hrRecords: [
    { _id: "r1", tracker: "rounds", code: "REQ-26-001", fields: { job: "1", hiringStatus: "Open" } },
    { _id: "r2", tracker: "rounds", code: "REQ-26-002", fields: { job: "1", hiringStatus: "Open" } },
    { _id: "r3", tracker: "rounds", code: "REQ-26-003", fields: { job: "3", hiringStatus: "Closed - Filled" } },
    { _id: "r4", tracker: "rounds", code: "REQ-26-004", fields: { job: "5", hiringStatus: "Open" } },
    { _id: "old", tracker: "archived:pipeline", code: `C-${new Date().getFullYear() % 100}-156`, fields: { name: "Old" } },
  ],
};
let n = 0;
const ctx: any = {
  db: {
    query: (table: string) => {
      let rows = tables[table];
      const api: any = {
        withIndex: (_: string, f: any) => {
          f({ eq: (_k: string, value: string) => (rows = rows.filter((r) => r.tracker === value)) });
          return api;
        },
        collect: async () => [...rows],
      };
      return api;
    },
    insert: async (table: string, doc: Row) => {
      const _id = `new${++n}`;
      tables[table].push({ _id, ...doc });
      return _id;
    },
    patch: async (id: string, change: Row) => Object.assign([...tables.hrRecords, ...tables.recruitCandidates].find((r) => r._id === id), change),
    get: async (id: string) => [...tables.hrRecords, ...tables.recruitCandidates].find((r) => r._id === id) ?? null,
    normalizeId: (_table: string, id: string) => id || null,
  },
};
const person = (id: string, jobSourceId: number, stage = "screened"): Row => ({ _id: id, jobSourceId, stage, name: id, email: `${id}@x.in`, number: "", position: "" });
const pipeline = () => tables.hrRecords.filter((r) => r.tracker === "pipeline");
const round = (id: string) => tables.hrRecords.find((r) => r._id === id);

async function main() {
  const me = { userId: "u1", full: true, jobs: new Set() } as any;
  // Three positions at once, one person listed twice by a double click.
  assert.equal(await addToCandidates(ctx, me, [person("a", 1), person("b", 2), person("c", 3), person("a", 1)]), 3);
  const [a, b, c] = pipeline();
  assert.ok(a.code.endsWith("-157"), "IDs run on from the cleared ones");
  assert.ok(b.code.endsWith("-158"));
  assert.equal(a.fields.reqId, "r2", "the newest open position for the role");
  assert.equal(b.fields.reqId, "r2", "a sub-position falls back to its parent's");
  assert.equal(c.fields.reqId, undefined, "a closed position is not used");
  assert.equal(c.fields.job, "3");
  assert.equal(c.fields.roleOriginal, "Copy");
  assert.equal(a.fields.stage, "Screening");
  // Shortlisting again adds nothing.
  assert.equal(await addToCandidates(ctx, me, [person("a", 1), person("c", 3)]), 0);
  // Placing someone who had no open position fills theirs in, rather than adding a second row.
  assert.equal(await addToCandidates(ctx, me, [person("c", 3)], round("r1")), 1);
  assert.equal(pipeline().length, 3);
  assert.equal(pipeline()[2].fields.reqId, "r1");
  // A second open position is a second row; the same one twice is not.
  assert.equal(await addToCandidates(ctx, me, [person("a", 1)], round("r1")), 1);
  assert.equal(await addToCandidates(ctx, me, [person("a", 1)], round("r1")), 0);
  assert.equal(pipeline().length, 4);
  // Moved straight to interview: that is where they start.
  await addToCandidates(ctx, me, [person("d", 3, "interview")]);
  assert.equal(pipeline().at(-1).fields.stage, "Interview 1");
  // The website files a sub-role under its parent: the sub-role's opening is the one used.
  await addToCandidates(ctx, me, [{ ...person("e", 4), position: " social intern" }]);
  assert.equal(pipeline().at(-1).fields.reqId, "r4");
  // Shortlisted first, opening made later, shortlisted again: now placed, still one row.
  tables.hrRecords.push({ _id: "r5", tracker: "rounds", code: "REQ-26-005", fields: { job: "3", hiringStatus: "Open" } });
  const count = pipeline().length;
  assert.equal(await addToCandidates(ctx, me, [person("d", 3)]), 1);
  assert.equal(pipeline().length, count);
  assert.equal(pipeline().find((r) => r.fields.applicantId === "d").fields.reqId, "r5");
  // A rejected row is left as it is; a new opening gets a new row.
  tables.hrRecords.push({ _id: "x", tracker: "pipeline", code: "C-00-001", fields: { applicantId: "f", job: "3", status: "Rejected" } });
  assert.equal(await addToCandidates(ctx, me, [person("f", 3)], round("r1")), 1);
  assert.equal(round("x").fields.reqId, undefined);
  // Someone with one position does not touch a row that sits under another.
  tables.hrRecords.push({ _id: "y", tracker: "pipeline", code: "C-00-002", fields: { applicantId: "g", job: "3", status: "Active" } });
  const design = { userId: "u2", full: false, jobs: new Set([1, 2]) } as any;
  await addToCandidates(ctx, design, [person("g", 1)], round("r1"));
  assert.equal(round("y").fields.reqId, undefined);
  // Brought over from before: no owner, and first contact is when they were shortlisted.
  await addToCandidates(ctx, { full: true, jobs: new Set() }, [{ ...person("h", 4), stageUpdatedAt: Date.UTC(2026, 7, 14, 20) }]);
  assert.equal(pipeline().at(-1).fields.hrOwner, undefined);
  assert.equal(pipeline().at(-1).fields.firstContact, "2026-08-15", "20:00 UTC is already the 15th in India");

  const anyRow = async () => true;
  // Positions -> Candidates: held or rejected closes the row but keeps its stage, shortlisting again reopens it there.
  const add = (id: string, fields: Row) => (tables.hrRecords.push({ _id: id, tracker: "pipeline", code: id, fields }), round(id));
  const p = add("p1", { applicantId: "s1", job: "3", stage: "Interview 2", status: "Active" });
  assert.equal((await followApplication(ctx, anyRow, ["s1"], "on_hold")).size, 0);
  assert.deepEqual([p.fields.stage, p.fields.status], ["Interview 2", "On Hold"]);
  assert.deepEqual([...(await followApplication(ctx, anyRow, ["s1"], "screened"))], ["s1"], "reopened");
  assert.deepEqual([p.fields.stage, p.fields.status], ["Interview 2", "Active"]);
  await followApplication(ctx, anyRow, ["s1"], "rejected");
  assert.equal(standing(p.fields), "Rejected");
  p.fields = { ...p.fields, stage: "Rejected" }; // closed from the board, which moves the stage too
  await followApplication(ctx, anyRow, ["s1"], "screened");
  assert.deepEqual([p.fields.stage, p.fields.status], ["Screening", "Active"]);
  await followApplication(ctx, anyRow, ["s1"], "applied");
  assert.equal(p.fields.status, "Archived", "back to New comes off the board");
  await followApplication(ctx, anyRow, ["s1"], "screened");
  assert.equal(pipeline().filter((r) => r.fields.applicantId === "s1").length, 1, "never a second row");
  // Back to New is refused once something has happened, so one slip cannot take someone off at Offer.
  add("p5", { applicantId: "s5", name: "Asha", job: "3", stage: "Offer", status: "Active" });
  await assert.rejects(() => followApplication(ctx, anyRow, ["s5"], "applied"), /Asha is at Offer/);
  // Only what was closed from Positions comes back: a rejection HR made for another opening stays.
  const oldRound = add("p6", { applicantId: "s6", job: "3", reqId: "r3", stage: "Rejected", status: "Rejected" });
  const nowRound = add("p7", { applicantId: "s6", job: "3", reqId: "r1", stage: "Interview 1", status: "Active" });
  await followApplication(ctx, anyRow, ["s6"], "on_hold");
  await followApplication(ctx, anyRow, ["s6"], "screened");
  assert.deepEqual([oldRound.fields.status, nowRound.fields.status, nowRound.fields.stage, nowRound.fields.closedFrom], ["Rejected", "Active", "Interview 1", undefined]);
  // Rejected on Candidates, then shortlisted again on Positions: back, as they are live nowhere else.
  const gone = add("p8", { applicantId: "s8", job: "3", stage: "Rejected", status: "Rejected" });
  await followApplication(ctx, anyRow, ["s8"], "screened");
  assert.deepEqual([gone.fields.status, gone.fields.stage], ["Active", "Screening"]);
  // A change of mind is followed, and Hold is no way around the check on Back to New.
  const mind = add("pa", { applicantId: "sa", name: "Ravi", job: "3", stage: "Interview 2", status: "Active" });
  await followApplication(ctx, anyRow, ["sa"], "rejected");
  await followApplication(ctx, anyRow, ["sa"], "on_hold");
  assert.equal(mind.fields.status, "On Hold");
  await assert.rejects(() => followApplication(ctx, anyRow, ["sa"], "applied"), /Ravi is at Interview 2/);
  // Two rows closed together, one put back by hand: the next hold and shortlist is about that one only.
  const one = add("pb", { applicantId: "sb", job: "3", reqId: "r1", stage: "Screening", status: "Active" });
  const two = add("pc", { applicantId: "sb", job: "3", reqId: "r2", stage: "Screening", status: "Active" });
  await followApplication(ctx, anyRow, ["sb"], "rejected");
  one.fields = { ...one.fields, status: "Active", closedFrom: undefined };
  await followApplication(ctx, anyRow, ["sb"], "on_hold");
  await followApplication(ctx, anyRow, ["sb"], "screened");
  assert.deepEqual([one.fields.status, two.fields.status], ["Active", "Rejected"]);
  // Put by hand into the opening they were rejected from: that row comes back, no second one.
  const again = add("p9", { applicantId: "s9", job: "3", reqId: "r1", stage: "Rejected", status: "Rejected" });
  assert.equal(await addToCandidates(ctx, me, [person("s9", 3)], round("r1")), 1);
  assert.deepEqual([again.fields.status, pipeline().filter((r) => r.fields.applicantId === "s9").length], ["Active", 1]);
  // Someone who joined or withdrew is not closed over, and other positions' rows are not touched.
  const j = add("p2", { applicantId: "s2", job: "3", stage: "Joined", status: "Joined" });
  const w = add("p3", { applicantId: "s3", job: "3", stage: "Offer", status: "Withdrawn" });
  await followApplication(ctx, anyRow, ["s2", "s3"], "rejected");
  assert.deepEqual([j.fields.status, w.fields.status], ["Joined", "Withdrawn"]);
  const other = add("p4", { applicantId: "s4", job: "3", stage: "Screening", status: "Active" });
  await followApplication(ctx, async (r) => design.jobs.has(Number(r.fields.job)), ["s4"], "rejected");
  assert.equal(other.fields.status, "Active");

  // Candidates -> Positions: closing or reopening someone moves their application, with a line in its history.
  const hr = { _id: "u1", name: "Sakshi" } as any;
  const app = { _id: "t1", jobSourceId: 4, stage: "screened" } as Row;
  tables.recruitCandidates.push(app);
  const row = { _id: "q1", tracker: "pipeline", fields: { applicantId: "t1", stage: "Interview 1", status: "Active" } } as any;
  await followCandidate(ctx, design, row, { ...row.fields, status: "Rejected" }, hr);
  assert.equal(app.stage, "screened", "someone hiring for another position does not change this application");
  await followCandidate(ctx, me, row, { ...row.fields, stage: "Rejected", status: "Rejected" }, hr);
  assert.equal(app.stage, "rejected");
  assert.equal(tables.recruitActivity.at(-1)!.body, "Rejected on Candidates (Interview 1)");
  await followCandidate(ctx, me, { ...row, fields: { ...row.fields, status: "Rejected" } }, row.fields, hr);
  assert.equal(app.stage, "screened", "reopened");
  const moves = tables.recruitActivity.length;
  await followCandidate(ctx, me, row, { ...row.fields, stage: "Interview 2" }, hr);
  assert.equal(tables.recruitActivity.length, moves, "an ordinary stage move says nothing about the application");
  add("q2", { applicantId: "t1", stage: "Offer", status: "Active" });
  await followCandidate(ctx, me, row, { ...row.fields, status: "Rejected" }, hr);
  assert.equal(app.stage, "screened", "still live for another open position");
  await followCandidate(ctx, me, row, { ...row.fields, stage: "Joined", status: "Joined" }, hr);
  assert.equal(app.stage, "hired");

  // Opening a round can take everyone already waiting for that role, and only them.
  const wait = (id: string, fields: Row) => add(id, { applicantId: id, stage: "Screening", status: "Active", ...fields });
  wait("w1", { job: "4", roleOriginal: "Accounts" });
  wait("w2", { job: "4", roleOriginal: "Social Intern" });
  wait("w3", { job: "4", status: "Rejected" });
  wait("w4", { job: "4", reqId: "r1" });
  const accounts = { _id: "r9", tracker: "rounds", fields: { job: "4" } } as any;
  const before = tables.hrRecords.filter((r) => r.fields.reqId === "r9").length;
  assert.equal(await placeInRound(ctx, me, { ...round("r4") }), 1, "a sub-role's opening takes only that sub-role");
  assert.equal(round("w2").fields.reqId, "r4");
  await placeInRound(ctx, me, accounts);
  assert.equal(round("w1").fields.reqId, "r9");
  assert.equal(round("w3").fields.reqId, undefined);
  assert.equal(round("w4").fields.reqId, "r1");
  assert.ok(tables.hrRecords.filter((r) => r.fields.reqId === "r9").length > before);
  assert.equal(await placeInRound(ctx, me, { _id: "r10", fields: {} } as any), 0, "an open position with no role takes nobody");
  console.log("candidates: ok");
}
main();
