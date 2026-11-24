// Shortlisting: applicants land on Candidates once, in the right open position, with an unused ID.
// Run: npx tsx scripts/candidates.check.ts
import assert from "node:assert";
import { addToCandidates } from "../convex/lib/candidates";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;
const tables: Record<string, Row[]> = {
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
    patch: async (id: string, change: Row) => Object.assign(tables.hrRecords.find((r) => r._id === id), change),
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
  console.log("candidates: ok");
}
main();
