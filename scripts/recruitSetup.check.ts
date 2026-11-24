// Setting up positions and pipelines: the real functions over made-up tables. Run:
// npx esbuild scripts/recruitSetup.check.ts --bundle --platform=node --format=esm --log-level=error | node --input-type=module -
import assert from "node:assert";
import * as S from "../convex/recruitSetup";
import * as H from "../convex/hrOps";
import * as R from "../convex/recruitment";
import { loadPipelines } from "../convex/lib/pipelines";
import { CLOSING, STANDARD } from "../convex/lib/hirePipeline";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;
const copy = (x: any) => JSON.parse(JSON.stringify(x));

/** A world: documents are copied on read and replaced on write, like the real thing. */
function world(given: Record<string, Row[]>) {
  let n = 0;
  let me = "hr";
  const tables: Record<string, Row[]> = {
    users: [{ _id: "hr", role: "admin", isHR: true, name: "HR" }, { _id: "del", role: "employee", recruitJobs: [1, 3] }, { _id: "left", role: "client" }],
    teams: [{ _id: "design", name: "Design" }, { _id: "copy", name: "Copy" }],
    ...given,
  };
  const T = (t: string) => (tables[t] ??= []);
  const find = (id: string) => Object.values(tables).flat().find((r) => r._id === id) ?? null;
  const ctx: any = {
    auth: { getUserIdentity: async () => ({ subject: `${me}|s` }) },
    scheduler: { runAfter: async () => {} },
    db: {
      query: (t: string) => {
        let rows = [...T(t)];
        const eq: any = { eq: (k: string, v: any) => ((rows = rows.filter((r) => r[k] === v)), eq) };
        const api: any = { withIndex: (_: string, f: any) => (f(eq), api), order: () => api, collect: async () => copy(rows), first: async () => (rows[0] ? copy(rows[0]) : null) };
        return api;
      },
      insert: async (t: string, doc: Row) => (T(t).push({ _id: `${t}${++n}`, ...copy(doc) }), `${t}${n}`),
      patch: async (id: string, change: Row) => {
        for (const rows of Object.values(tables)) {
          const i = rows.findIndex((r) => r._id === id);
          if (i >= 0) rows[i] = copy({ ...rows[i], ...change });
        }
      },
      delete: async (id: string) => Object.keys(tables).forEach((t) => (tables[t] = tables[t].filter((r) => r._id !== id))),
      get: async (id: string) => (find(id) ? copy(find(id)) : null),
      normalizeId: (t: string, id: string) => (T(t).some((r) => r._id === id) ? id : null),
    },
  };
  return { tables, as: (id: string) => (me = id), row: (id: string) => find(id)!, f: (id: string) => find(id)!.fields, run: (fn: any, args: any) => fn._handler(ctx, args), ctx };
}
const job = (sourceId: number, name: string, x: any = {}) => ({ _id: `j${sourceId}`, sourceId, name, description: "", formUrl: "", status: "open", ...x });
const round = (id: string, fields: any) => ({ _id: id, tracker: "rounds", code: id, fields: { role: id, hiringStatus: "Open", ...fields } });
const on = (id: string, fields: any) => ({ _id: id, tracker: "pipeline", code: id, fields: { name: id, status: "Active", stage: "Screening", ...fields }, updatedAt: 1 });
const app = (id: string, jobSourceId: number, position = "", stage = "screened") => ({ _id: id, jobSourceId, position, stage, name: id, email: `${id}@x.in`, number: "", status: "active" });
const step = (id: string, name: string, kind: string, x: any = {}) => ({ id, name, kind, ...x });
const B = [step("call", "HR call", "screening"), step("folio", "Portfolio", "interview"), step("founder", "Founder", "interview"), step("offer", "Offer", "offer")];
const pl = (id: string, steps = B) => ({ _id: id, name: id, steps, updatedAt: 1, updatedBy: "hr" });
const fails = (p: Promise<any>, why: RegExp) => assert.rejects(p, (e: any) => why.test(String(e.data ?? e.message)));

async function main() {
  // Leaving people with a removed position sets them aside, and restoring brings everything back as it was.
  let w = world({
    recruitJobs: [job(1, "Design"), job(2, "Motion", { parentSourceId: 1 }), job(3, "Copy")],
    recruitCandidates: [app("a", 1), app("b", 3)],
    hrRecords: [round("r1", { job: "1" }), on("pa", { applicantId: "a", job: "1", reqId: "r1", stage: "Interview 2" }), on("pb", { applicantId: "b", job: "3", reqId: "r1", stage: "Interview 1" })],
  });
  const gone = await w.run(S.removePosition, { id: 1, moveTo: null, statuses: [] });
  assert.deepEqual([gone.moved, gone.left], [0, 1]);
  assert.deepEqual([w.f("pa").status, w.f("pa").closedFrom, w.f("r1").hiringStatus], ["Archived", "removed", "Closed - Cancelled"]);
  assert.deepEqual([w.f("pb").status, w.f("pb").reqId], ["Active", undefined], "someone who applied elsewhere goes back there");
  assert.ok(w.row("j2").removedAt, "its roles go with it");
  await fails(w.run(S.savePosition, { id: 1, name: "x" }), /no longer exists/);
  assert.deepEqual((await w.run(R.openPositions, {})).map((p: any) => p.id), [3]);
  await w.run(S.restorePosition, { id: 1 });
  assert.deepEqual([w.f("pa").status, w.f("pa").closedFrom, w.f("pa").stage, w.f("r1").hiringStatus, w.f("r1").closedFrom], ["Active", undefined, "Interview 2", "Open", undefined]);
  assert.equal(w.row("j2").removedAt, undefined);
  assert.deepEqual((await w.run(R.openPositions, {})).map((p: any) => p.id), [3], "closed on the website until HR opens it");

  // Moving on removal: the picked statuses go, with the rounds; the rest are set aside; delegates lose it.
  w = world({
    recruitPipelines: [pl("own")],
    recruitJobs: [job(1, "Design"), job(3, "Copy", { pipeline: "own" })],
    recruitCandidates: [app("a", 1), app("b", 1, "", "on_hold"), app("c", 1, "", "applied")],
    hrRecords: [round("r1", { job: "1" }), on("pa", { applicantId: "a", job: "1", reqId: "r1", stage: "Interview 2" }), on("hand", { job: "1", stage: "Interview 1" })],
    recruitTemplates: [{ _id: "t", jobSourceId: 1 }],
  });
  const went = await w.run(S.removePosition, { id: 1, moveTo: 3, statuses: ["shortlisted", "new"] });
  assert.deepEqual([went.moved, went.left], [2, 1]);
  assert.deepEqual([w.row("a").jobSourceId, w.row("b").jobSourceId, w.row("c").jobSourceId, w.row("t").jobSourceId], [3, 1, 3, 3]);
  assert.deepEqual([w.f("r1").job, w.f("pa").reqId, w.f("pa").stage, w.f("hand").job, w.f("hand").stage], ["3", "r1", "Founder", "3", "Portfolio"]);
  assert.deepEqual(w.row("del").recruitJobs, [3]);
  assert.equal((await w.run(S.savePosition, { name: "Next" })).code, "POS-1001");

  // A role under a position: its people are the parent's applicants of that name.
  w = world({
    recruitJobs: [job(1, "Accounts"), job(2, "Intern", { parentSourceId: 1 }), job(3, "Copy")],
    recruitCandidates: [app("a", 1, " intern"), app("b", 1, "Accounts")],
    hrRecords: [round("r2", { job: "2" }), on("pa", { applicantId: "a", job: "1", roleOriginal: "Intern", reqId: "r2" })],
  });
  assert.deepEqual([(await w.run(S.removalInfo, { id: 2 })).total, (await w.run(S.removalInfo, { id: 2 })).under], [1, "Accounts"]);
  await w.run(S.removePosition, { id: 2, moveTo: 3, statuses: ["shortlisted"] });
  assert.deepEqual([w.row("a").jobSourceId, w.row("b").jobSourceId, w.f("pa").job, w.f("pa").reqId], [3, 1, "3", "r2"]);

  // Being hired in another position's round: removing what they applied for leaves them in it.
  w = world({
    recruitJobs: [job(1, "Design"), job(3, "Copy"), job(9, "Finance", { teams: ["copy"] })],
    recruitCandidates: [app("a", 1)],
    hrRecords: [round("r9", { job: "9" }), on("pa", { applicantId: "a", job: "1", reqId: "r9", stage: "Offer", team: "copy" })],
  });
  assert.equal((await w.run(S.removalInfo, { id: 1 })).inPlay, 0);
  await w.run(S.moveApplicants, { candidateIds: ["a"], to: 3 });
  assert.deepEqual([w.f("pa").reqId, w.f("pa").team, w.f("pa").stage], ["r9", "copy", "Offer"], "and their team is that round's still");
  await w.run(S.moveApplicants, { candidateIds: ["a"], to: 1 });
  await w.run(S.removePosition, { id: 1, moveTo: null, statuses: [] });
  assert.deepEqual([w.f("pa").status, w.f("pa").reqId], ["Active", "r9"]);

  // Rejected while set aside: restoring does not bring them back. Shortlisting in a removed position is refused.
  w = world({ recruitJobs: [job(1, "Design"), job(3, "Copy")], recruitCandidates: [app("a", 1), app("b", 1, "", "applied")], hrRecords: [on("pa", { applicantId: "a", job: "1" })], recruitActivity: [] });
  await w.run(S.removePosition, { id: 1, moveTo: null, statuses: [] });
  await w.run(R.setStage, { candidateIds: ["a"], stage: "rejected" });
  assert.deepEqual([w.f("pa").status, w.f("pa").closedFrom], ["Rejected", "positions"]);
  for (const stage of ["screened", "interview", "offer"]) await fails(w.run(R.setStage, { candidateIds: ["b"], stage }), /position was removed/);
  await w.run(R.setStage, { candidateIds: ["b"], stage: "on_hold" });
  await w.run(S.restorePosition, { id: 1 });
  assert.equal(w.f("pa").status, "Rejected");

  // Held or rejected, moved, then shortlisted: into the new position's round, never back into the old one.
  for (const remove of [true, false]) {
    w = world({
      recruitJobs: [job(1, "Design"), job(3, "Copy")],
      recruitCandidates: [app("a", 1)],
      hrRecords: [round("r1", { job: "1" }), round("r3", { job: "3" }), on("pa", { applicantId: "a", job: "1", reqId: "r1", stage: "Interview 1" })],
      recruitActivity: [],
    });
    if (remove) await w.run(S.removePosition, { id: 1, moveTo: null, statuses: [] });
    await w.run(R.setStage, { candidateIds: ["a"], stage: "rejected" });
    await w.run(S.moveApplicants, { candidateIds: ["a"], to: 3 });
    await w.run(R.setStage, { candidateIds: ["a"], stage: "screened" });
    const rows = w.tables.hrRecords.filter((r) => r.tracker === "pipeline");
    assert.deepEqual(rows.map((r) => [r.fields.status, r.fields.reqId, r.fields.job]), [["Active", "r3", "3"]], `removed first: ${remove}`);
  }
  // Two positions removed one after the other: nobody is left live under one that is gone.
  w = world({ recruitJobs: [job(1, "Design"), job(9, "Finance")], recruitCandidates: [app("a", 1)], hrRecords: [round("r9", { job: "9" }), on("pa", { applicantId: "a", job: "1", reqId: "r9" })] });
  await w.run(S.removePosition, { id: 1, moveTo: null, statuses: [] });
  await w.run(S.removePosition, { id: 9, moveTo: null, statuses: [] });
  assert.deepEqual([w.f("pa").status, w.f("pa").closedFrom, w.f("pa").reqId], ["Archived", "removed", undefined]);
  await w.run(S.restorePosition, { id: 1 });
  assert.equal(w.f("pa").status, "Active");

  // A role removed earlier does not come back into it when its position is removed and restored.
  w = world({ recruitPipelines: [pl("own")], recruitJobs: [job(1, "Design"), job(2, "Motion", { parentSourceId: 1, pipeline: "own" })], hrRecords: [on("p", { job: "1", roleOriginal: "Motion", stage: "Founder" })] });
  await w.run(S.removePosition, { id: 2, moveTo: null, statuses: [] });
  w.row("j2").removedAt -= 60_000; // a while ago
  await w.run(H.save, { tracker: "pipeline", id: "p", fields: { stage: "Final Review" } });
  await w.run(S.removePosition, { id: 1, moveTo: null, statuses: [] });
  await w.run(S.restorePosition, { id: 1 });
  assert.equal(w.f("p").stage, "Final Review");

  // A role's own open round takes its people before its position's does.
  w = world({ recruitJobs: [job(1, "Accounts"), job(2, "Intern", { parentSourceId: 1 })], hrRecords: [round("r1", { job: "1" }), round("r2", { job: "2" }), on("i", { job: "1", roleOriginal: "Intern" }), on("m", { job: "1" })] });
  assert.deepEqual([(await w.run(H.placeShortlisted, { roundId: "r1" })).placed, w.f("i").reqId, w.f("m").reqId], [1, undefined, "r1"]);
  await w.run(H.placeShortlisted, { roundId: "r2" });
  assert.equal(w.f("i").reqId, "r2");

  // Someone hiring for a few positions moves applications, never a candidate who is another position's.
  w = world({
    recruitJobs: [job(1, "Design"), job(3, "Copy"), job(9, "Finance")],
    recruitCandidates: [app("a", 1), app("z", 9)],
    hrRecords: [round("r9", { job: "9" }), round("r3", { job: "3" }), on("pa", { applicantId: "a", job: "1", reqId: "r9", stage: "Interview 2" })],
  });
  w.as("del");
  assert.equal((await w.run(S.moveApplicants, { candidateIds: ["a"], to: 3 })).moved, 1);
  assert.deepEqual([w.f("pa").reqId, w.f("pa").job], ["r9", "1"]);
  await fails(w.run(S.moveApplicants, { candidateIds: ["a"], to: 9 }), /that position/);
  await fails(w.run(S.moveApplicants, { candidateIds: ["z"], to: 3 }), /this position/);
  for (const fn of [S.savePosition, S.removePosition, S.restorePosition, S.savePipeline, S.deletePipeline, S.setPipeline]) await fails(w.run(fn, { id: 1, key: null, name: "x", steps: [], moves: {}, moveTo: null, statuses: [] }), /Only HR/);
  assert.equal(await w.run(S.overview, {}), null);
  assert.equal(await w.run(S.joiner, { candidateId: "pa", email: "a@x.in" }), null);

  // What applicants earn and expect: hidden from someone hiring for a few positions until HR switches it on.
  w = world({
    recruitJobs: [job(1, "Design"), job(3, "Copy")],
    recruitCandidates: [{ ...app("a", 1), currentCtc: "9 LPA", expectedCtc: "12 LPA", createdAt: 1 }],
    recruitCampaigns: [{ _id: "camp", jobSourceId: 1, candidateIds: ["a"] }],
    recruitEmailLogs: [],
    recruitActivity: [],
  });
  const seen = async () => {
    const lists = [
      await w.run(R.listCandidates, { jobSourceId: 1 }),
      await w.run(R.recentApplicants, {}),
      await w.run(R.searchCandidates, { search: "a@x" }),
      [await w.run(R.getCandidate, { candidateId: "a" })],
      (await w.run(R.getCampaign, { campaignId: "camp" })).members,
    ];
    assert.ok(lists.every((l) => l.length === 1), "they still see the person");
    const all = JSON.stringify([lists, await w.run(H.all, {})]);
    return /9 LPA|12 LPA/.test(all) ? lists.every((l) => l[0].currentCtc === "9 LPA" && l[0].expectedCtc === "12 LPA") && "shown" : "hidden";
  };
  assert.equal(await seen(), "shown", "HR");
  // Nor through an email they write: its text goes where they point it.
  w.tables.recruitTemplates = [{ _id: "t", jobSourceId: 1, name: "t", subject: "Hi", body: '<img src="https://x.in/?c={{ ExpectedCTC }}">' }, { _id: "plain", jobSourceId: 1, name: "p", subject: "Hi {{name}}", body: "Your CTC" }];
  const mail = (templateId: string) => w.run(R._loadSendContext, { candidateIds: ["a"], templateId });
  assert.equal((await mail("t")).recipients.length, 1);
  w.as("del");
  await fails(mail("t"), /which you do not see/);
  assert.equal((await mail("plain")).recipients.length, 1);
  assert.equal(await seen(), "hidden", "not until HR says so");
  await fails(w.run(H.setRecruitPay, { userId: "del", allowed: true }), /Only HR/);
  w.as("hr");
  await fails(w.run(H.setRecruitPay, { userId: "left", allowed: true }), /position first/);
  await w.run(H.setRecruitPay, { userId: "del", allowed: true });
  w.as("del");
  assert.equal(await seen(), "shown", "switched on");
  w.as("hr");
  await w.run(H.setRecruitPay, { userId: "del", allowed: false });
  w.as("del");
  assert.equal(await seen(), "hidden", "and off again");
  w.as("hr");
  await w.run(H.setRecruitPay, { userId: "del", allowed: true });
  for (const jobSourceId of [1, 3]) await w.run(H.setRecruitAccess, { userId: "del", jobSourceId, allowed: false });
  await w.run(H.setRecruitAccess, { userId: "del", jobSourceId: 1, allowed: true });
  w.as("del");
  assert.equal(await seen(), "hidden", "taken away and given back: hidden again");

  // Offer amounts and budgets go with it: not sent, not changed, not cleared, and no letter.
  w = world({
    recruitJobs: [job(1, "Design")],
    recruitCandidates: [{ ...app("a", 1), createdAt: Date.UTC(2026, 7, 14, 20) }],
    hrRecords: [round("r", { job: "1", budgetLpa: 77, budgetNote: "seventy-seven" }), on("p", { job: "1", applicantId: "a", reqId: "r" }), { _id: "o", tracker: "offers", code: "OF", fields: { candidateId: "p", proposedCtc: 66, approvedCtc: 55, probationCtc: 44, stage: "Approved" } }],
  });
  const amounts = async () => JSON.stringify((await w.run(H.all, {})).rows.map((r: any) => r.fields)).match(/77|seventy|66|55|44/g)?.length ?? 0;
  const letter = () => w.run(H.letterData, { offerId: "o" });
  assert.deepEqual([await amounts(), !!(await letter())], [5, true]);
  assert.equal((await w.run(H.all, {})).rows.find((r: any) => r._id === "p").fields.appliedOn, "2026-08-15", "when they applied, in India");
  w.as("del");
  assert.deepEqual([await amounts(), await letter()], [0, null]);
  await w.run(H.save, { tracker: "offers", id: "o", fields: { stage: "Offer Sent", approvedCtc: 1, proposedCtc: null, appliedOn: "x" } });
  await w.run(H.save, { tracker: "rounds", id: "r", fields: { notes: "x", budgetLpa: null } });
  assert.deepEqual([w.f("o").stage, w.f("o").approvedCtc, w.f("o").proposedCtc, w.f("o").probationCtc, w.f("r").budgetLpa, w.f("r").budgetNote], ["Offer Sent", 55, 66, 44, 77, "seventy-seven"]);
  await fails(w.run(H.remove, { id: "o" }), /amounts you do not see/);
  w.tables.users.find((u) => u._id === "del")!.recruitPay = true;
  assert.deepEqual([await amounts(), !!(await letter())], [5, true]);
  await w.run(H.save, { tracker: "pipeline", id: "p", fields: { appliedOn: "2020-01-01", notes: "y" } });
  assert.equal(w.f("p").appliedOn, undefined, "worked out, never stored");
  await w.run(H.remove, { id: "o" });
  assert.ok(!w.tables.hrRecords.some((r) => r._id === "o"), "with pay, they may");

  // Only what changed is saved, so a stale screen does not reopen a position.
  w = world({ recruitPipelines: [pl("own")], recruitJobs: [job(1, "Design", { status: "closed", hrOwner: "hr", closesOn: "2020-01-01" }), job(2, "Intern", { parentSourceId: 1, pipeline: "own" })], hrRecords: [on("p", { job: "1", roleOriginal: "Interns", stage: "Final Review" })] });
  await w.run(S.savePosition, { id: 1, description: "two\nlines" });
  assert.deepEqual([w.row("j1").status, w.row("j1").hrOwner, w.row("j1").description], ["closed", "hr", "two\nlines"]);
  await fails(w.run(S.savePosition, { id: 1, open: true }), /already passed/);
  await fails(w.run(S.savePosition, { name: " design " }), /already a position/);
  // A role renamed to what someone already carries takes them in, at a step it has.
  assert.equal((await w.run(S.savePosition, { id: 2, name: "Interns" })).moved, 1);
  assert.equal(w.f("p").stage, "Founder");

  await w.run(S.savePosition, { id: 2, description: "x" });
  assert.equal(w.row("j2").status, "open", "nor does it close one");
  // A role made under a name people already carry takes them in; made again after being removed, it is the new one that counts.
  w = world({ recruitPipelines: [pl("own"), pl("new", [step("n", "New call", "screening")])], recruitJobs: [job(1, "Design")], hrRecords: [on("q", { job: "1", roleOriginal: "Trainee", stage: "Final Review" })] });
  assert.equal((await w.run(S.savePosition, { name: "Trainee", parent: 1, pipeline: "own" })).moved, 1);
  assert.equal(w.f("q").stage, "Founder");
  await w.run(S.removePosition, { id: 1001, moveTo: null, statuses: [] });
  assert.equal((await loadPipelines(w.ctx)).keyOf(w.row("q")), STANDARD, "without the role, the position's own");
  await w.run(S.savePosition, { name: "Trainee", parent: 1, pipeline: "new" });
  assert.deepEqual([(await loadPipelines(w.ctx)).keyOf(w.row("q")), w.f("q").stage], ["new", "New call"]);

  // Pipelines: nobody's change is overwritten, and people at a step that goes are asked about.
  w = world({ recruitPipelines: [pl("own")], recruitJobs: [job(1, "Design", { pipeline: "own" })], hrRecords: [on("p", { job: "1", stage: "Founder" })] });
  const [v, steps] = [1, B.filter((s) => s.id !== "founder")];
  await fails(w.run(S.savePipeline, { key: "own", name: "own", steps, moves: {}, from: v }), /Say which step/);
  assert.equal((await w.run(S.savePipeline, { key: "own", name: "own", steps, moves: { founder: "offer" }, from: v })).moved, 1);
  assert.equal(w.f("p").stage, "Offer");
  await fails(w.run(S.savePipeline, { key: "own", name: "own", steps: B, moves: {}, from: v }), /Someone else/);
  await fails(w.run(S.deletePipeline, { key: STANDARD }), /stays/);

  // Teams: one sets itself at the offer, two wait for HR, divided goes to whoever had fewest, a round's own team first.
  const hires = (x: any, records: Row[]) => world({ recruitJobs: [job(1, "Design", x)], hrRecords: records });
  const offer = async (h: ReturnType<typeof world>, id: string) => (await h.run(H.save, { tracker: "pipeline", id, fields: { stage: "Offer" } }), h.f(id).team);
  assert.equal(await offer(hires({ teams: ["design"] }, [on("p", { job: "1" })]), "p"), "design");
  assert.equal(await offer(hires({ teams: ["design", "copy"] }, [on("p", { job: "1" })]), "p"), undefined);
  assert.equal(await offer(hires({ teams: ["design", "copy"] }, [round("r", { job: "1", team: "copy" }), on("p", { job: "1", reqId: "r" })]), "p"), "copy");
  const rejected = hires({ teams: ["design"] }, [on("p", { job: "1", stage: "Offer" })]);
  await rejected.run(H.save, { tracker: "pipeline", id: "p", fields: { status: "Rejected" } });
  assert.equal(rejected.f("p").team, undefined, "someone rejected joins no team");
  const cleared = hires({ teams: ["design"] }, [on("p", { job: "1" })]);
  await offer(cleared, "p");
  await cleared.run(H.save, { tracker: "pipeline", id: "p", fields: { team: null } });
  await cleared.run(H.save, { tracker: "pipeline", id: "p", fields: { notes: "x" } });
  assert.equal(cleared.f("p").team, undefined, "cleared by hand, it stays cleared");
  assert.equal(await offer(hires({ teams: ["deleted", "copy"] }, [on("p", { job: "1" })]), "p"), "copy", "a team that was deleted does not count");
  const shared = hires({ teams: ["design", "copy"], divide: true }, ["a", "b", "c", "d"].map((id) => on(id, { job: "1" })));
  assert.deepEqual([await offer(shared, "a"), await offer(shared, "b"), await offer(shared, "c"), await offer(shared, "d")], ["design", "copy", "design", "copy"]);

  // A step's owner who has left is not written onto people: their rows could not be saved again.
  w = world({ recruitPipelines: [pl("own", [step("a", "A", "screening"), step("b", "B", "interview", { owner: "left", days: 2 })])], recruitJobs: [job(1, "Design", { pipeline: "own" })], hrRecords: [on("p", { job: "1", stage: "A" })] });
  await w.run(H.save, { tracker: "pipeline", id: "p", fields: { stage: "B" } });
  assert.equal(w.f("p").actionOwner, undefined);
  assert.ok(w.f("p").nextDue);

  // Whatever is done in whatever order, everyone is at a step of the pipeline that applies to them.
  let seed = 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <X,>(xs: X[]): X => xs[Math.floor(rnd() * xs.length)];
  const some = () => B.concat(step("task", "Task", "assignment"), step("join", "Joining", "joining")).filter(() => rnd() < 0.7).concat(step("z", "Z", "other"));
  let done = 0;
  for (let k = 0; k < 400; k++) {
    seed = k * 7919 + 17;
    const x = world({
      recruitPipelines: [pl("p0", some()), pl("p1", some())],
      recruitJobs: [job(1, "Design"), job(2, "Motion", { parentSourceId: 1, pipeline: "p0" }), job(3, "Copy", { pipeline: "p1" }), job(4, "Writer", { parentSourceId: 3 }), job(5, "Sales")],
      hrRecords: [1, 2, 3, 5].filter(() => rnd() < 0.7).map((j) => round(`r${j}`, { job: String(j), ...(rnd() < 0.3 ? { pipeline: pick(["p0", "p1", STANDARD]) } : {}) })),
      recruitCandidates: [["a", 1, "Motion"], ["b", 1, "Design"], ["c", 3, "Writer"], ["d", 5, "Sales"]].map(([id, j, t]) => app(id as string, j as number, t as string, "applied")),
    });
    await x.run(R.setStage, { candidateIds: ["a", "b", "c", "d"], stage: "screened" });
    for (const r of x.tables.hrRecords) if (r.tracker === "pipeline") r.fields.stage = pick((await loadPipelines(x.ctx)).stepsOf(r)).name;
    for (let t = 0; t < 10; t++) {
      const live = x.tables.recruitJobs.filter((j) => !j.removedAt).map((j) => j.sourceId);
      const rounds = x.tables.hrRecords.filter((r) => r.tracker === "rounds").map((r) => r._id);
      const [name, op] = pick<[string, () => Promise<any>]>([
        ["position", () => x.run(S.setPipeline, { position: pick(live), key: pick(["", "p0", "p1", STANDARD]) })],
        ["round", () => x.run(S.setPipeline, { round: pick(rounds), key: pick(["", "p0", "p1"]) })],
        ["delete", () => x.run(S.deletePipeline, { key: pick(["p0", "p1"]) })],
        ["move", () => x.run(S.moveApplicants, { candidateIds: ["a", "b", "c", "d"].filter(() => rnd() < 0.5), to: pick(live) })],
        ["remove", () => x.run(S.removePosition, { id: pick(live), moveTo: rnd() < 0.6 ? pick(live) : null, statuses: rnd() < 0.5 ? ["shortlisted"] : [] })],
        ["restore", () => x.run(S.restorePosition, { id: pick(x.tables.recruitJobs).sourceId })],
        ["rename", () => x.run(S.savePosition, { id: pick(live), name: pick(["Motion", "Writer", `N${t}`]) })],
        ["role", () => x.run(S.savePosition, { name: pick(["Motion", "Writer", "Fresh"]), parent: pick([1, 3]), pipeline: pick(["", "p0"]) })],
        ["tie", () => x.run(H.save, { tracker: "rounds", id: pick(rounds), fields: { job: String(pick(live)) } })],
        ["place", () => x.run(H.placeShortlisted, { roundId: pick(rounds) })],
      ]);
      const before = copy(x.tables);
      try {
        await op();
        done++;
      } catch {
        for (const t2 of Object.keys(x.tables)) x.tables[t2] = before[t2] ?? [];
        continue;
      }
      const book = await loadPipelines(x.ctx);
      for (const r of x.tables.hrRecords.filter((r) => r.tracker === "pipeline")) {
        assert.ok((CLOSING as readonly string[]).includes(r.fields.stage) || book.stepsOf(r).some((s) => s.name === r.fields.stage), `world ${k}, after ${name}: ${JSON.stringify(r.fields)}`);
      }
      assert.equal(x.tables.hrRecords.filter((r) => r.tracker === "pipeline").length, 4, "nobody is lost");
    }
  }
  assert.ok(done > 1500, `only ${done} changes went through`);
  console.log("recruitSetup: ok");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
