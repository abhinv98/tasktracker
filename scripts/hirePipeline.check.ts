// Pipelines: the three questions, fitting people into other steps, and moving them between positions.
// Run: npx tsx scripts/hirePipeline.check.ts
import assert from "node:assert";
import { STANDARD, STANDARD_STEPS, barelyStarted, cleanSteps, entryStep, fitStage, mergeNames, newStep, positionCode, reshape, shapeOf, type Step } from "../convex/lib/hirePipeline";
import { pipelineBook } from "../convex/lib/pipelines";
import { cleanFields } from "../convex/lib/hrTrackers";
import { moveRow, newestRound } from "../convex/lib/candidates";

const names = (s: readonly Step[]) => s.map((x) => x.name);
const S = STANDARD_STEPS;

// What a pipeline says about itself.
assert.deepEqual(shapeOf(S), { screening: true, interviews: 2, assignment: 2 });
// Asking for the same shape changes nothing.
assert.deepEqual(reshape(S, shapeOf(S)), S);
// The assignment moves where it is asked to, and everything else keeps its place and its id.
assert.deepEqual(names(reshape(S, { screening: true, interviews: 2, assignment: "first" })), ["Sourced", "Contacted", "Screening", "Assignment", "Interview 1", "Interview 2", "Final Review", "Offer", "Joining"]);
assert.deepEqual(names(reshape(S, { screening: true, interviews: 3, assignment: 1 })), ["Sourced", "Contacted", "Screening", "Interview 1", "Assignment", "Interview 2", "Interview 3", "Final Review", "Offer", "Joining"]);
assert.deepEqual(names(reshape(S, { screening: false, interviews: 1, assignment: "none" })), ["Sourced", "Contacted", "Interview 1", "Final Review", "Offer", "Joining"]);
// An order someone arranged by hand is kept when a question is answered.
const arranged = [S[0], S[6], S[2], S[3], S[7], S[4], S[5], S[8]]; // Final Review early, Offer between the interviews
assert.deepEqual(names(reshape(arranged, { ...shapeOf(arranged), interviews: 3 })), ["Sourced", "Final Review", "Screening", "Interview 1", "Offer", "Interview 2", "Assignment", "Interview 3", "Joining"]);
assert.deepEqual(names(reshape(arranged, { ...shapeOf(arranged), assignment: 1 })), ["Sourced", "Final Review", "Screening", "Interview 1", "Assignment", "Offer", "Interview 2", "Joining"]);
// After more interviews than there are: after the last one.
assert.equal(names(reshape(S, { screening: true, interviews: 1, assignment: 4 })).indexOf("Assignment"), 4);
// A renamed interview with an owner survives being asked for more rounds; new ones get their own ids and names.
const own = S.map((s) => (s.id === "interview-1" ? { ...s, name: "Portfolio round", owner: "u1", days: 3 } : s));
const more = reshape(own, { screening: true, interviews: 4, assignment: "none" });
assert.deepEqual(more.filter((s) => s.kind === "interview").map((s) => [s.name, s.owner]), [["Portfolio round", "u1"], ["Interview 2", undefined], ["Interview 3", undefined], ["Interview 4", undefined]]);
assert.equal(new Set(more.map((s) => s.id)).size, more.length);
// Taken out and asked for again: the same step comes back, with what was set on it.
const noAsg = reshape(own, { ...shapeOf(own), assignment: "none" });
const bin = (from: Step[], to: Step[]) => from.filter((s) => !to.some((x) => x.id === s.id));
const fewer = reshape(own, { ...shapeOf(own), interviews: 0 });
assert.deepEqual(reshape(fewer, shapeOf(own), bin(own, fewer).reverse()), own);
assert.deepEqual(reshape(noAsg, shapeOf(own), bin(own, noAsg)), own);
// A new step never takes the id of one that was taken out: its people would turn up in it.
assert.equal(newStep([S[0]], "interview", "Founder chat", [{ ...S[3], id: "interview" }]).id, "interview-2");
for (const shape of [0, 1, 5].flatMap((n) => (["none", "first", 1, 2] as const).map((assignment) => ({ screening: n > 0, interviews: n, assignment })))) {
  assert.doesNotThrow(() => cleanSteps(reshape(S, shape)));
  assert.equal(shapeOf(reshape(S, shape)).interviews, shape.interviews);
}

// Where people start, and whether anything has happened.
assert.equal(entryStep(S).name, "Screening");
assert.equal(entryStep(S.filter((s) => s.kind !== "screening")).name, "Interview 1");
assert.ok(barelyStarted(S, "Sourced") && barelyStarted(S, "Screening") && barelyStarted(S, "") && barelyStarted(S, "gone"));
assert.ok(!barelyStarted(S, "Interview 1"));

// Into other steps: by name, else the same kind at the same turn, else what the step before becomes. Endings stay endings.
const B: Step[] = [{ id: "a", name: "HR call", kind: "screening" }, { id: "b", name: "Design head", kind: "interview" }, { id: "c", name: "Founder", kind: "interview" }, { id: "d", name: "Offer", kind: "offer" }];
assert.equal(fitStage("Offer", S, B), "Offer");
assert.equal(fitStage("Interview 2", S, B), "Founder");
assert.equal(fitStage("Assignment", S, B), "Founder", "no assignment there: not sent back to the start");
assert.equal(fitStage("Screening", S, B), "HR call");
assert.equal(fitStage("Contacted", S, B), "HR call");
const noInterview: Step[] = [{ id: "a", name: "Sourced", kind: "sourcing" }, { id: "b", name: "Call", kind: "screening" }, { id: "c", name: "Offer", kind: "offer" }];
assert.equal(fitStage("Assignment", S.filter((s) => s.kind !== "screening"), noInterview), "Call", "past the start is never before it");
assert.equal(fitStage("Sourced", S, noInterview), "Sourced");
for (const a of S) assert.equal(fitStage(fitStage(a.name, S, B), S, B), fitStage(a.name, S, B), "twice is the same as once");
assert.equal(fitStage("Founder", B, S), "Interview 2");
assert.equal(fitStage("Rejected", S, B), "Rejected");
assert.equal(fitStage("No such step", S, B), "HR call");
assert.deepEqual(mergeNames([S, B]).slice(2, 8), ["Screening", "HR call", "Interview 1", "Interview 2", "Design head", "Founder"]);
assert.deepEqual(names(S).every((n) => mergeNames([S, B]).includes(n)), true);
assert.deepEqual(mergeNames([B, B]), names(B));

// What may not be saved.
for (const [why, bad] of [
  ["empty", []],
  ["no name", [{ ...B[0], name: " " }]],
  ["an ending", [{ ...B[0], name: "rejected" }]],
  ["twice", [B[0], { ...B[1], name: "hr CALL" }]],
  ["same id", [B[0], { ...B[1], id: "a" }]],
  ["kind", [{ ...B[0], kind: "constructor" as Step["kind"] }]],
  ["days", [{ ...B[0], days: 400 }]],
  ["too many", Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, name: `Step ${i}`, kind: "other" as const }))],
] as [string, Step[]][]) assert.throws(() => cleanSteps(bad), undefined, why);
assert.deepEqual(cleanSteps([{ ...B[0], name: "  HR   call " }]), [B[0]]);
assert.equal(cleanSteps([{ ...B[0], link: " docs.google.com/document/d/1 " }])[0].link, "https://docs.google.com/document/d/1");
assert.equal("link" in cleanSteps([{ ...B[0], link: "" }])[0], false);
for (const link of ["javascript:alert(1)", "data:text/html,x", "see the doc", "https://x.in/ \"onclick", "//x.in"]) {
  assert.throws(() => cleanSteps([{ ...B[0], link }]), /full web address/, link);
  assert.throws(() => cleanFields("assignments", { candidateId: "c", task: "t", link }), /full web address/, link);
}
assert.deepEqual(cleanFields("assignments", { candidateId: "c", task: "t", link: "drive.google.com/x", submission: "" }), { candidateId: "c", task: "t", link: "https://drive.google.com/x" });

// Which pipeline: the hiring round's, then the position's, then the role above it's, then the standard one.
/* eslint-disable @typescript-eslint/no-explicit-any */
const pick = pipelineBook(
  [{ _id: "design", name: "Design", steps: B }, { _id: "short", name: "Short", steps: B.slice(0, 2) }] as any,
  [
    { sourceId: 1, name: "Accounts", pipeline: "design" },
    { sourceId: 2, name: "Social Intern", parentSourceId: 1 },
    { sourceId: 3, name: "Writer", parentSourceId: 1, pipeline: "short" },
    { sourceId: 4, name: "Sales" },
    { sourceId: 5, name: "Ops", pipeline: "deleted-one" },
  ] as any,
  [
    { _id: "r1", fields: { job: "1" } }, { _id: "r2", fields: { job: "1", pipeline: "short" } }, { _id: "r3", fields: { job: "1", pipeline: STANDARD } },
    { _id: "r4", fields: { pipeline: "design" } }, { _id: "r5", fields: {} }, { _id: "r6", fields: { job: "4", pipeline: "deleted-one" } },
  ] as any
);
for (const [want, fields] of [
  ["design", { job: "1" }],
  ["design", { job: "1", roleOriginal: " social intern" }],
  ["short", { job: "1", roleOriginal: "Writer" }],
  [STANDARD, { job: "4" }],
  [STANDARD, { job: "5" }],
  [STANDARD, {}],
  ["design", { job: "4", reqId: "r1" }],
  ["short", { job: "4", reqId: "r2" }],
  [STANDARD, { job: "1", reqId: "r3" }],
  ["design", { job: "4", reqId: "r4" }],
  ["short", { job: "1", roleOriginal: "Writer", reqId: "r5" }],
  [STANDARD, { job: "1", reqId: "r6" }],
  ["design", { job: "1", reqId: "a round that is gone" }],
] as [string, any][]) assert.equal(pick.keyOf({ fields }), want, JSON.stringify(fields));
assert.deepEqual([...pick.list.keys()], [STANDARD, "design", "short"]);
assert.equal(positionCode(7), "POS-007");
assert.equal(positionCode(1001), "POS-1001");

// Moving one person's row from Design (1) to Copy (3), which has its own steps.
const jobs = [{ sourceId: 1 }, { sourceId: 2, parentSourceId: 1 }, { sourceId: 3 }, { sourceId: 4 }];
const rounds = new Map(Object.entries({
  design: { fields: { job: "1", hiringStatus: "Open" } }, motion: { fields: { job: "2", hiringStatus: "Open" } },
  copy: { fields: { job: "3", hiringStatus: "Open" } }, sales: { fields: { job: "4", hiringStatus: "Open" } },
}));
const from: any = pipelineBook(
  [{ _id: "b", name: "B", steps: B }] as any,
  jobs.map((j) => (j.sourceId === 3 ? { ...j, name: "Copywriter", pipeline: "b" } : { name: `Job ${j.sourceId}`, ...j })) as any,
  [...rounds].map(([_id, r]) => ({ _id, ...r })) as any
);
const copy = { sourceId: 3, name: "Copywriter" } as any;
const row = (fields: any) => ({ _id: "x", fields: { job: "1", status: "Active", ...fields } }) as any;
const go = (fields: any, round = newestRound(rounds, 3), f = from, to = copy) => moveRow(row(fields), to, round, f, 1);
assert.deepEqual([go({ stage: "Interview 2", reqId: "design" })].map((f) => [f.job, f.roleOriginal, f.reqId, f.stage])[0], ["3", "Copywriter", "copy", "Founder"]);
assert.equal(go({ stage: "Interview 2", reqId: "motion" }).reqId, "copy", "a sub-role's round is the old position's too");
const elsewhere = go({ stage: "Interview 2", reqId: "sales" });
assert.deepEqual([elsewhere.reqId, elsewhere.stage], ["sales", "Interview 2"], "being hired for another position's round goes on");
assert.equal(go({ stage: "Interview 1", reqId: "design" }, "").reqId, undefined, "no round open there");
assert.deepEqual([go({ stage: "Interview 1", status: "Rejected" }).reqId, go({ stage: "Rejected", status: "Rejected" }).stage], [undefined, "Rejected"], "closed people are not put into a round");
const withRound = go({ stage: "Interview 2", reqId: "design" }, "copy", { ...from, kept: new Set(["design"]) });
assert.deepEqual([withRound.reqId, withRound.stage], ["design", "Founder"], "a round that moves too keeps its people, at the matching step");
assert.equal(go({ stage: "Rejected", status: "Rejected", reqId: "design" }).reqId, "design", "someone closed keeps the round they were closed in");
assert.deepEqual([go({ stage: "Interview 2", status: "Archived", closedFrom: "removed" })].map((f) => [f.status, f.closedFrom, f.reqId, f.stage])[0], ["Active", undefined, "copy", "Founder"], "set aside with a removed position: back in play");
// Into a role that has no round of its own: the position's round, and that round's steps.
const motion = { sourceId: 2, name: "Motion", parentSourceId: 1 } as any;
const ownMotion = pipelineBook([{ _id: "b", name: "B", steps: B }] as any, [{ sourceId: 1, name: "Design" }, { ...motion, pipeline: "b" }, { sourceId: 3, name: "Copy" }] as any, [{ _id: "design", fields: { job: "1", hiringStatus: "Open" } }] as any);
const intoRole = go({ job: "3", stage: "Final Review" }, "design", ownMotion as any, motion);
assert.deepEqual([intoRole.reqId, intoRole.stage], ["design", "Final Review"]);
assert.ok(ownMotion.stepsOf({ fields: intoRole }).some((s) => s.name === intoRole.stage), "at a step of the pipeline that applies to them");
assert.equal(go({ stage: "Interview 1", reqId: "design" }, "design", ownMotion as any, motion).reqId, "design", "already in the round above it");
const held = { ...ownMotion, rounds: new Map([["mine", { fields: { job: "2", hiringStatus: "On Hold" } }], ["new", { fields: { job: "2", hiringStatus: "Open" } }]]) } as any;
assert.equal(go({ stage: "Interview 1", reqId: "mine" }, "new", held, motion).reqId, "mine", "already in a round of the role they are put under");
// A role made again under an old name is the one people are found under; a removed one only with its position.
const again = pipelineBook([{ _id: "b", name: "B", steps: B }] as any, [{ sourceId: 1, name: "D" }, { sourceId: 2, name: "Motion", parentSourceId: 1, removedAt: 5 }, { sourceId: 9, name: "motion", parentSourceId: 1, pipeline: "b" }, { sourceId: 5, name: "X", removedAt: 5 }, { sourceId: 6, name: "Y", parentSourceId: 5, pipeline: "b", removedAt: 5 }, { sourceId: 7, name: "Z", parentSourceId: 1, pipeline: "b", removedAt: 5 }] as any, []);
assert.deepEqual([["1", "Motion"], ["5", "Y"], ["1", "Z"]].map(([job, roleOriginal]) => again.keyOf({ fields: { job, roleOriginal } })), ["b", "b", STANDARD]);
const untied = go({ stage: "Interview 2", reqId: "loose" }, "copy", { ...from, rounds: new Map([...from.rounds, ["loose", { fields: { hiringStatus: "Open" } }]]) });
assert.deepEqual([untied.reqId, untied.stage], ["loose", "Founder"], "a round tied to nothing is nobody's: they stay in it, on the new position's steps");
console.log("hirePipeline: ok");
