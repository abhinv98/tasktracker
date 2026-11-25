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
        const api: any = { withIndex: (_: string, f: any) => (f(eq), api), order: () => api, collect: async () => copy(rows), take: async (k: number) => copy(rows.slice(0, k)), first: async () => (rows[0] ? copy(rows[0]) : null) };
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

  // A position that hires into two teams is one entry per team. Either-or: where someone is shortlisted from decides.
  const two = (x: any = {}) =>
    world({
      recruitJobs: [job(1, "Editors", { teams: ["design", "copy"], ...x }), job(3, "Copy"), job(9, "Finance")],
      recruitCandidates: ["a", "b", "c", "d"].map((id) => app(id, 1, "", "applied")).concat(app("z", 9)),
      hrRecords: [round("all", { job: "1" }), round("rd", { job: "1", team: "design" }), round("rc", { job: "1", team: "copy" })],
      recruitActivity: [],
    });
  const rowOf = (h: ReturnType<typeof world>, id: string) => h.tables.hrRecords.find((r) => r.fields.applicantId === id)!.fields;
  w = two();
  await w.run(R.setStage, { candidateIds: ["a"], stage: "screened", team: "design" });
  await w.run(R.setStage, { candidateIds: ["b"], stage: "screened", team: "copy" });
  await w.run(R.setStage, { candidateIds: ["c"], stage: "screened" });
  assert.deepEqual(["a", "b", "c"].map((id) => [rowOf(w, id).team, rowOf(w, id).reqId]), [["design", "rd"], ["copy", "rc"], [undefined, "all"]], "each in their team's round; undecided in the one for all");
  assert.deepEqual((await w.run(H.all, {})).rows.filter((r: any) => r.tracker === "pipeline").map((r: any) => r.team), ["design", "copy", ""]);
  // Decided, or changed, later: out of one team's round into the other's.
  await w.run(S.setTeam, { candidateIds: ["a", "c"], team: "copy", position: 1 });
  assert.deepEqual([rowOf(w, "a").team, rowOf(w, "a").reqId, rowOf(w, "c").team], ["copy", "rc", "copy"]);
  await w.run(H.save, { tracker: "pipeline", id: w.tables.hrRecords.find((r) => r.fields.applicantId === "a")!._id, fields: { team: "design" } });
  assert.deepEqual([rowOf(w, "a").team, rowOf(w, "a").reqId], ["design", "rd"]);
  await w.run(S.setTeam, { candidateIds: ["a"], team: null, position: 1 });
  assert.deepEqual([rowOf(w, "a").team, rowOf(w, "a").reqId], [undefined, undefined], "undecided is in no team's round");
  // Rejected, then shortlisted from the other entry: that one's.
  await w.run(R.setStage, { candidateIds: ["b"], stage: "rejected" });
  await w.run(R.setStage, { candidateIds: ["b"], stage: "screened", team: "design" });
  assert.deepEqual([rowOf(w, "b").team, rowOf(w, "b").reqId, rowOf(w, "b").status], ["design", "rd", "Active"]);
  // A team's round takes its own people only.
  w = two();
  w.tables.hrRecords = [round("rc", { job: "1", team: "copy" }), on("pd", { job: "1", team: "design" }), on("pc", { job: "1", team: "copy" }), on("pn", { job: "1" })];
  assert.equal((await w.run(H.placeShortlisted, { roundId: "rc" })).placed, 1);
  assert.deepEqual([w.f("pd").reqId, w.f("pc").reqId, w.f("pn").reqId], [undefined, "rc", undefined]);
  // Divided: evenly, wherever they were shortlisted from, many at once too.
  w = two({ divide: true });
  await w.run(R.setStage, { candidateIds: ["a", "b", "c", "d"], stage: "screened", team: "design" });
  assert.deepEqual(["a", "b", "c", "d"].map((id) => rowOf(w, id).team), ["design", "copy", "design", "copy"]);
  // Ticking one team stores nothing; adding a second leaves them for HR to say, or divides them.
  w = world({ recruitJobs: [job(1, "Editors")], hrRecords: ["a", "b", "c", "d"].map((id) => on(id, { job: "1" })) });
  const teamsNow = () => ["a", "b", "c", "d"].map((id) => w.f(id).team);
  await w.run(S.savePosition, { id: 1, teams: ["design"] });
  assert.deepEqual(teamsNow(), [undefined, undefined, undefined, undefined]);
  assert.equal((await w.run(H.all, {})).rows[0].team, "design", "but they are that team's");
  await w.run(S.savePosition, { id: 1, teams: ["design", "copy"] });
  assert.deepEqual(teamsNow(), [undefined, undefined, undefined, undefined]);
  assert.equal((await w.run(S.savePosition, { id: 1, divide: true })).divided, 4);
  assert.deepEqual(teamsNow(), ["design", "copy", "design", "copy"]);
  await w.run(S.savePosition, { id: 1, teams: ["copy"] });
  const whose = async () => (await w.run(H.all, {})).rows.filter((r: any) => r.tracker === "pipeline").map((r: any) => r.team);
  assert.deepEqual(await whose(), ["copy", "copy", "copy", "copy"], "a team it no longer has is nobody's");
  await w.run(S.savePosition, { id: 1, teams: ["design", "copy"], divide: false });
  assert.deepEqual(await whose(), ["design", "copy", "design", "copy"], "unticked and ticked again, nothing is lost");
  // Moved into a position that divides: they get their share. Only their own people, for someone hiring for a few.
  w = two({ divide: true });
  w.tables.recruitCandidates.push(app("m", 3));
  w.tables.hrRecords.push(on("pm", { job: "3", applicantId: "m" }), on("pz", { job: "9", applicantId: "z" }));
  await w.run(S.moveApplicants, { candidateIds: ["m"], to: 1 });
  assert.deepEqual([w.f("pm").team, w.f("pm").reqId], ["design", "rd"]);
  await fails(w.run(S.setTeam, { candidateIds: ["m"], team: "gone", position: 1 }), /does not hire into/);
  w.as("del");
  assert.equal((await w.run(S.setTeam, { candidateIds: ["m", "z"], team: "copy", position: 1 })).set, 1);
  assert.deepEqual([w.f("pm").team, w.f("pz").team], ["copy", undefined]);

  // A team the position no longer hires into: its round is for everyone, and its people are nobody's (or divided again).
  for (const divide of [false, true]) {
    w = world({
      teams: ["design", "copy", "tech"].map((id) => ({ _id: id, name: id })),
      recruitJobs: [job(1, "Editors", { teams: ["design", "copy"], divide })],
      hrRecords: [round("rd", { job: "1", team: "design" }), on("p", { job: "1", team: "design", reqId: "rd" }), on("shut", { job: "1", team: "design", status: "Rejected" })],
    });
    const first = await w.run(S.savePosition, { id: 1, teams: ["copy", "tech"] });
    const rows = (await w.run(H.all, {})).rows;
    const of = (id: string) => rows.find((r: any) => r._id === id).team;
    assert.deepEqual([first.divided, w.f("p").reqId, of("shut"), w.f("shut").team], [divide ? 1 : 0, "rd", "", "design"]);
    assert.equal(["copy", "tech"].includes(of("p")), divide);
    assert.equal((await w.run(S.savePosition, { id: 1, description: "x" })).divided, 0, "and it stays settled");
    await w.run(S.savePosition, { id: 1, teams: ["design", "copy", "tech"] });
    assert.deepEqual([w.f("shut").team, (await w.run(H.all, {})).rows.find((r: any) => r._id === "shut").team], ["design", "design"], "someone closed is whose they were");
  }
  // One team's people never land in another team's round.
  w = two();
  await w.run(S.savePosition, { id: 1, teams: ["design"] });
  await w.run(R.setStage, { candidateIds: ["a"], stage: "screened" });
  assert.equal(rowOf(w, "a").reqId, "rd");
  w = world({
    recruitJobs: [job(1, "Editors", { teams: ["design", "copy"] }), job(2, "Trainee", { parentSourceId: 1, teams: ["copy"] })],
    recruitCandidates: [app("t", 1, "Trainee", "applied"), app("m", 1, "Editors")],
    hrRecords: [round("rd", { job: "1", team: "design" }), round("rc", { job: "1", team: "copy" }), on("pm", { job: "1", roleOriginal: "Editors", applicantId: "m" })],
    recruitActivity: [],
  });
  await w.run(R.setStage, { candidateIds: ["t"], stage: "screened" });
  await w.run(S.moveApplicants, { candidateIds: ["m"], to: 2 });
  assert.deepEqual([rowOf(w, "t").reqId, w.f("pm").reqId], [undefined, undefined], "a role joins its position's teams, whatever it once said itself: undecided");
  await w.run(S.setTeam, { candidateIds: ["t", "m"], team: "design", position: 1 });
  assert.deepEqual([rowOf(w, "t").reqId, w.f("pm").reqId], ["rd", "rd"]);
  await w.run(S.savePosition, { id: 2, teams: ["design"] });
  assert.deepEqual(w.tables.recruitJobs.find((j) => j.sourceId === 2)!.teams, ["copy"], "and cannot be given its own");
  // Put into a round by hand, they are its team's; a round that becomes one team's loses the other's people.
  w = two();
  w.tables.hrRecords.push(on("pa", { job: "1", applicantId: "a", team: "design" }), on("pb", { job: "1", reqId: "all", team: "copy" }), on("pc", { job: "1", reqId: "all" }));
  await w.run(H.addApplicants, { candidateIds: ["a"], roundId: "rc" });
  assert.deepEqual([w.f("pa").reqId, w.f("pa").team], ["rc", "copy"]);
  await w.run(H.save, { tracker: "pipeline", id: "pa", fields: { reqId: "rd" } });
  assert.equal(w.f("pa").team, "design");
  await w.run(H.save, { tracker: "rounds", id: "all", fields: { team: "design" } });
  assert.deepEqual([w.f("pb").reqId, w.f("pb").team, w.f("pc").reqId, w.f("pc").team], ["rc", "copy", "all", "design"]);
  // What they are in another position is not touched; undecided ones in a round for everyone can be shortlisted for a team.
  w = two();
  w.tables.hrRecords.push(round("r9", { job: "9", team: "copy" }), on("p1", { job: "1", applicantId: "a", reqId: "all" }), on("p9", { job: "9", applicantId: "a", reqId: "r9" }));
  await w.run(S.setTeam, { candidateIds: ["a"], team: "design", position: 1 });
  assert.deepEqual([w.f("p1").team, w.f("p1").reqId, w.f("p9").team, w.f("p9").reqId], ["design", "all", "copy", "r9"], "a round for everyone is theirs still, and there they are that round's");
  await w.run(S.setTeam, { candidateIds: ["a"], team: null, position: 1 });
  const again = await w.run(R.setStage, { candidateIds: ["a"], stage: "screened", team: "copy" });
  assert.deepEqual([again.teamed, w.f("p1").team, w.f("p1").reqId, w.f("p9").reqId], [1, "copy", "all", "r9"]);
  // Someone who joined keeps their round when their team is changed.
  w = two();
  w.tables.hrRecords.push(on("pj", { job: "1", applicantId: "a", reqId: "rd", team: "design", status: "Joined", stage: "Joined" }));
  await w.run(H.save, { tracker: "pipeline", id: "pj", fields: { team: "copy" } });
  assert.equal(w.f("pj").reqId, "rd");
  assert.equal((await w.run(H.all, {})).rows.find((r: any) => r._id === "pj").team, "copy", "and it is the team they were given");
  // Divided means everyone: reopened, added by hand, kept in a round that moved here, in a loose round that is tied here.
  w = world({
    recruitJobs: [job(1, "Editors", { teams: ["design", "copy"], divide: true }), job(3, "Copy")],
    recruitCandidates: [app("b", 3)],
    hrRecords: [round("all", { job: "1" }), round("loose", {}), round("r3", { job: "3" }), on("back", { job: "1", reqId: "all", status: "Rejected" }), on("tied", { reqId: "loose" }), on("kept", { job: "3", applicantId: "b", reqId: "r3" })],
  });
  await w.run(H.save, { tracker: "pipeline", id: "back", fields: { status: "Active" } });
  const hand = await w.run(H.save, { tracker: "pipeline", fields: { name: "Hand", job: "1", status: "Active" } });
  await w.run(H.save, { tracker: "rounds", id: "loose", fields: { job: "1" } });
  await w.run(S.removePosition, { id: 3, moveTo: 1, statuses: ["shortlisted"] });
  const given = ["back", hand, "tied", "kept"].map((id) => w.f(id).team);
  assert.ok(given.every(Boolean), JSON.stringify(given));
  assert.deepEqual([given.filter((t) => t === "design").length, given.filter((t) => t === "copy").length], [2, 2]);
  // Counted by whose they are, stored or not: ten already in design's round, so the next go to copy.
  w = two({ divide: true });
  w.tables.hrRecords = [round("rd", { job: "1", team: "design" }), ...Array.from({ length: 4 }, (_, i) => on(`old${i}`, { job: "1", reqId: "rd" }))];
  await w.run(R.setStage, { candidateIds: ["a", "b", "c", "d"], stage: "screened" });
  assert.deepEqual(["a", "b", "c", "d"].map((id) => rowOf(w, id).team), ["copy", "copy", "copy", "copy"]);
  // A team that was deleted is nobody's, also where the position says nothing about teams.
  w = world({ recruitJobs: [job(1, "Design")], hrRecords: [on("p", { job: "1", team: "gone" }), on("q", { job: "1", team: "copy" })] });
  assert.deepEqual((await w.run(H.all, {})).rows.map((r: any) => r.team), ["", "copy"]);
  // A team their position does not hire into is refused.
  w = two();
  w.tables.hrRecords.push(on("pa", { job: "1", applicantId: "a", team: "design", reqId: "rd" }));
  w.tables.teams.push({ _id: "tech", name: "Tech" });
  await fails(w.run(H.save, { tracker: "pipeline", id: "pa", fields: { team: "tech" } }), /does not hire into/);
  assert.deepEqual([w.f("pa").team, w.f("pa").reqId], ["design", "rd"]);
  // What a team was before it was unticked does not come along to another position, nor back later for who joined since.
  const three = ["design", "copy", "tech"].map((id) => ({ _id: id, name: id }));
  w = world({
    teams: three,
    recruitJobs: [job(1, "Editors", { teams: ["copy"] }), job(5, "Sales"), job(6, "Mix", { teams: ["design", "tech"] })],
    recruitCandidates: [app("a", 1), app("b", 1)],
    recruitActivity: [],
    hrRecords: [on("p", { job: "1", applicantId: "a", team: "design" }), on("q", { job: "1", applicantId: "b", team: "design" }), on("j", { job: "1", team: "design" })],
  });
  await w.run(S.moveApplicants, { candidateIds: ["a"], to: 5 });
  await w.run(S.moveApplicants, { candidateIds: ["b"], to: 6 });
  assert.deepEqual([w.f("p").team, w.f("q").team], [undefined, undefined]);
  await w.run(H.save, { tracker: "pipeline", id: "j", fields: { stage: "Joined", status: "Joined" } });
  await w.run(S.savePosition, { id: 1, teams: ["design", "copy"] });
  assert.equal((await w.run(H.all, {})).rows.find((r: any) => r._id === "j").team, "copy", "joined as Copy's, stays Copy's");
  // Placing people into a round decides nothing for those who are decided, whatever the round says.
  w = world({ teams: three, recruitJobs: [job(1, "Editors", { teams: ["copy", "tech"] })], hrRecords: [round("rd", { job: "1", team: "design" }), on("c", { job: "1", team: "copy" }), on("t", { job: "1", team: "tech" })] });
  assert.equal((await w.run(H.placeShortlisted, { roundId: "rd" })).placed, 2);
  assert.deepEqual([w.f("c").team, w.f("t").team], ["copy", "tech"]);
  await w.run(S.savePosition, { id: 1, teams: ["design", "copy", "tech"] });
  assert.deepEqual([w.f("c").team, w.f("c").reqId, w.f("t").team, w.f("t").reqId], ["copy", undefined, "tech", undefined], "Design's round again: they leave it, not their teams");
  // Their round may be all that says what someone is hired for (the workbook's people): out of it, that stays.
  const editors = () =>
    world({
      teams: three,
      recruitPipelines: [pl("own")],
      recruitJobs: [job(1, "Editors", { teams: ["copy", "tech"], pipeline: "own" }), job(2, "Trainee", { parentSourceId: 1 }), job(5, "Sales", { teams: ["design", "tech"], divide: true })],
      recruitCandidates: [app("a", 5)],
      recruitActivity: [],
      hrRecords: [
        round("rd", { job: "1", team: "design" }),
        round("r2", { job: "2", team: "tech" }),
        on("imp", { reqId: "rd", team: "copy", stage: "Founder", roleOriginal: "Sr. Editor" }),
        on("q", { job: "5", applicantId: "a", reqId: "rd", team: "copy", stage: "Founder" }),
        on("t", { reqId: "r2", team: "tech", stage: "Founder" }),
      ],
    });
  w = editors();
  await w.run(S.savePosition, { id: 1, teams: ["design", "copy", "tech"] });
  const put = async (id: string) => [w.f(id).team, w.f(id).reqId, (await loadPipelines(w.ctx)).jobOf(w.row(id)), w.f(id).stage, w.f(id).roleOriginal];
  assert.deepEqual(await put("imp"), ["copy", undefined, 1, "Founder", "Sr. Editor"]);
  assert.deepEqual((await put("q")).slice(0, 4), ["copy", undefined, 1, "Founder"]);
  await w.run(H.save, { tracker: "pipeline", id: "t", fields: { team: "copy" } });
  assert.deepEqual(await put("t"), ["copy", undefined, 2, "Founder", "Trainee"]);
  // A round tied to no position has no say, until it is tied.
  w = editors();
  w.tables.hrRecords.push(round("L", {}), on("l", { reqId: "L", team: "copy" }), on("u", { reqId: "L" }));
  await w.run(H.save, { tracker: "rounds", id: "L", fields: { team: "tech" } });
  assert.deepEqual([w.f("l").team, w.f("l").reqId, w.f("u").team], ["copy", "L", undefined]);
  assert.equal((await w.run(H.all, {})).rows.find((r: any) => r._id === "L").team, "tech", "though it shows whose it is");
  await w.run(H.save, { tracker: "rounds", id: "L", fields: { job: "1" } });
  assert.deepEqual([...(await put("l")).slice(0, 3), w.f("u").team, w.f("u").reqId], ["copy", "rd", 1, "tech", "L"], "out of Tech's round, into the one for everyone");
  // Put by hand into another position's round: the team goes along if it is hired into there, and an old one does not come back.
  const byHand = () =>
    world({
      teams: three,
      recruitJobs: [job(1, "Editors", { teams: ["copy"] }), job(3, "Writers", { teams: ["design", "copy"] }), job(2, "Trainee", { parentSourceId: 1 })],
      recruitCandidates: [app("a", 1), app("b", 1)],
      recruitActivity: [],
      hrRecords: [round("all", { job: "3" }), on("p", { job: "1", applicantId: "a" }), on("q", { job: "1", applicantId: "b", team: "design" })],
    });
  w = byHand();
  await w.run(H.addApplicants, { candidateIds: ["a", "b"], roundId: "all" });
  assert.deepEqual([w.f("p").team, w.f("q").team], ["copy", "copy"]);
  await fails(w.run(H.save, { tracker: "pipeline", id: "p", fields: { reqId: null, team: "tech" } }), /does not hire into/);
  // Between a position and its roles nothing changes, not even what is ignored for now.
  w = byHand();
  await w.run(S.moveApplicants, { candidateIds: ["b"], to: 2 });
  await w.run(S.savePosition, { id: 1, teams: ["design", "copy"] });
  assert.equal((await w.run(H.all, {})).rows.find((r: any) => r._id === "q").team, "design");
  // Joining: whose they are, also when nothing is stored.
  w = world({ users: [{ _id: "hr", role: "admin", isHR: true }, { _id: "new", role: "employee", email: "N@x.in", name: "N" }], userTeams: [{ _id: "ut", userId: "new", teamId: "design" }], recruitJobs: [job(1, "Design", { teams: ["design"] })], hrRecords: [on("p", { job: "1", stage: "Offer" })] });
  assert.equal((await w.run(S.joiner, { candidateId: "p", email: "n@x.in" })).inTeam, true);

  // An application link is for one opening: a round that is open, or a position. Anything else gets nothing, and cannot be turned into it.
  w = world({
    recruitJobs: [job(1, "Editors", { teams: ["design", "copy"] }), job(2, "Trainee", { parentSourceId: 1 }), job(3, "Copy"), job(4, "Shut", { status: "closed" })],
    recruitCandidates: [],
    hrRecords: [{ ...round("REQ-26-001", { job: "1", team: "copy" }) }, round("REQ-26-002", { job: "1", hiringStatus: "On Hold" }), round("REQ-26-003", {}), round("REQ-26-004", { job: "4" }), round("REQ-26-005", { job: "2" }), round("REQ-26-009", { job: "1" })],
    recruitActivity: [],
  });
  const form = async (opening?: string) => (await w.run(R.openPositions, { opening })).map((p: any) => p.id);
  assert.deepEqual(await form(), [3, 1, 2], "the form by itself lists every open position");
  assert.deepEqual(
    await Promise.all(["REQ-26-001", " req-26-001", "REQ-26-005", "POS-003", "REQ-26-002", "REQ-26-003", "REQ-26-004", "POS-004", "REQ-99-999", "x", "__proto__"].map(form)),
    [[1], [1], [2], [3], [], [], [], [], [], [], []]
  );
  const applies = (email: string, jobSourceId: number, opening?: string) => w.run(R.apply, { name: "N", email, jobSourceId, opening });
  await applies("one@x.in", 1, "REQ-26-001");
  await applies("two@x.in", 1);
  await applies("three@x.in", 2, "REQ-26-005");
  for (const [id, code] of [[3, "REQ-26-001"], [1, "REQ-26-002"], [1, "nonsense"], [4, "POS-004"]] as const) await fails(applies("bad@x.in", id, code), /closed|no longer open/);
  const by = (email: string) => w.tables.recruitCandidates.find((c) => c.email === email)!;
  assert.deepEqual(["one@x.in", "two@x.in", "three@x.in", "bad@x.in"].map((e) => by(e)?.roundId), ["REQ-26-001", undefined, "REQ-26-005", undefined]);
  await w.run(R.setStage, { candidateIds: w.tables.recruitCandidates.map((c) => c._id), stage: "screened" });
  assert.deepEqual(["one@x.in", "two@x.in", "three@x.in"].map((e) => [rowOf(w, by(e)._id).reqId, rowOf(w, by(e)._id).team]), [["REQ-26-001", "copy"], ["REQ-26-009", undefined], ["REQ-26-005", undefined]], "shortlisted into the round they applied through, for its team");
  assert.equal((await w.run(R.getCandidate, { candidateId: by("one@x.in")._id })).through, "REQ-26-001");
  // Someone hiring for a few is not told of a round of another position. A closed position says the link is closed.
  w.tables.recruitCandidates.push({ ...app("other", 3), roundId: "REQ-26-001" }, { ...app("own", 1), roundId: "REQ-26-001" });
  w.tables.users.push({ _id: "del3", role: "employee", recruitJobs: [3] });
  w.as("del3");
  assert.equal((await w.run(R.getCandidate, { candidateId: "other" })).through, "");
  w.as("hr");
  await fails(applies("late@x.in", 4, "POS-004"), /opening is closed/);
  // Moved to a role that has its own round: that one comes before the link's.
  w.tables.recruitCandidates.push({ ...app("m", 1, "Editors", "applied"), roundId: "REQ-26-009" });
  await w.run(S.moveApplicants, { candidateIds: ["m"], to: 2 });
  await w.run(R.setStage, { candidateIds: ["m"], stage: "screened" });
  assert.equal(rowOf(w, "m").reqId, "REQ-26-005");
  // A deleted round's ID is never used again: its link is out there.
  const year = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(2, 4);
  w = world({ recruitJobs: [job(1, "Editors"), job(3, "Copy")], hrRecords: [], tasks: [], briefs: [], recruitCandidates: [] });
  const first001 = await w.run(H.save, { tracker: "rounds", fields: { role: "Editors", job: "1", hiringStatus: "Open" } });
  assert.deepEqual((await w.run(R.openPositions, { opening: `REQ-${year}-001` })).map((p: any) => p.id), [1]);
  await w.run(H.remove, { id: first001 });
  const then002 = await w.run(H.save, { tracker: "rounds", fields: { role: "Copy", job: "3", hiringStatus: "Open" } });
  assert.deepEqual([w.row(then002).code, await w.run(R.openPositions, { opening: `REQ-${year}-001` })], [`REQ-${year}-002`, []]);
  assert.equal((await w.run(H.all, {})).rows.length, 1, "and nothing else is left of it");

  // The Candidates list says what the application says. What they earn and expect only to whoever sees pay.
  w = world({
    recruitJobs: [job(1, "Design")],
    recruitCandidates: [{ ...app("a", 1), experience: "2", noticePeriod: "30 days", currentCtc: "4 LPA", expectedCtc: "600000", createdAt: Date.parse("2026-11-10T06:00:00Z") }],
    hrRecords: [on("p", { job: "1", applicantId: "a" }), on("hand", { job: "1", expectedCtc: "9" })],
  });
  const listed = async () => (await w.run(H.all, {})).rows.find((r: any) => r._id === "p").fields;
  assert.deepEqual([(await listed()).experience, (await listed()).noticePeriod, (await listed()).currentCtc, (await listed()).expectedCtc, (await listed()).appliedOn], ["2", "30 days", "4 LPA", "600000", "2026-11-10"]);
  w.as("del");
  assert.deepEqual([(await listed()).experience, (await listed()).currentCtc, (await listed()).expectedCtc], ["2", undefined, undefined], "hidden from someone without CTC switched on");
  assert.equal((await w.run(H.all, {})).rows.find((r: any) => r._id === "hand").fields.expectedCtc, undefined, "also one that somehow sits on the row itself");
  w.tables.users.find((u) => u._id === "del")!.recruitPay = true;
  assert.equal((await listed()).currentCtc, "4 LPA", "and shown once it is");
  w.as("hr");
  await w.run(H.save, { tracker: "pipeline", id: "p", fields: { notes: "x", currentCtc: "99" } });
  assert.equal(w.f("p").currentCtc, undefined, "never stored on the candidate");

  // Approving a hiring round is HR's and the founders'. From anyone else it starts pending and stays as it was.
  w = world({ recruitJobs: [job(1, "Design"), job(9, "Finance")], recruitCandidates: [app("a", 1), app("z", 9), app("n", 1, "", "applied")], recruitActivity: [], notifications: [], hrRecords: [round("r1", { job: "1", approvalStatus: "Pending" }), on("p", { job: "1", applicantId: "a", reqId: "r1", stage: "Interview 1", hrOwner: "hr" }), on("pz", { job: "9", applicantId: "z" })] });
  w.as("del");
  await w.run(H.save, { tracker: "rounds", id: "r1", fields: { approvalStatus: "Approved", notes: "mine" } });
  assert.deepEqual([w.f("r1").approvalStatus, w.f("r1").notes], ["Pending", "mine"]);
  const own = await w.run(H.save, { tracker: "rounds", fields: { role: "More design", job: "1", approvalStatus: "Approved", hiringStatus: "Open" } });
  assert.equal(w.f(own).approvalStatus, "Pending");
  w.as("hr");
  await w.run(H.save, { tracker: "rounds", id: "r1", fields: { approvalStatus: "Approved" } });
  assert.equal(w.f("r1").approvalStatus, "Approved");
  w.as("del");
  await w.run(H.save, { tracker: "rounds", id: "r1", fields: { openings: 4, approvalStatus: "Pending" } });
  assert.deepEqual([w.f("r1").approvalStatus, w.f("r1").openings], ["Approved", 4], "nor can they take an approval back");
  w.as("hr");
  // Feedback from whoever hires for the position: on a shortlisted person only, on their own interview if one waits, and HR is told.
  w.as("del");
  await fails(w.run(H.feedbackOn, { applicantId: "n", recommendation: "Proceed", feedback: "Good" }), /Shortlist them first/);
  await fails(w.run(H.feedbackOn, { applicantId: "z", recommendation: "Proceed", feedback: "Good" }), /not found/);
  await fails(w.run(H.feedbackOn, { applicantId: "a", recommendation: "Proceed", feedback: "  " }), /Write a line/);
  await w.run(H.feedbackOn, { applicantId: "a", recommendation: "Proceed", feedback: "Strong portfolio" });
  const talks = () => w.tables.hrRecords.filter((r) => r.tracker === "interviews");
  assert.deepEqual([talks().length, talks()[0].fields.interviewer, talks()[0].fields.round, talks()[0].fields.status, talks()[0].fields.recommendation, talks()[0].fields.feedback], [1, "del", "Interview 1", "Completed", "Proceed", "Strong portfolio"]);
  assert.match(w.f("p").latestOutcome, /^Good fit · Interview 1/);
  assert.deepEqual(w.tables.notifications.map((n) => [n.recipientId, n.title]), [["hr", "Good fit: p"]]);
  w.tables.hrRecords.find((r) => r._id === "p")!.fields.hrOwner = "del";
  await w.run(H.feedbackOn, { applicantId: "a", recommendation: "Reject", feedback: "On reflection, no" });
  assert.deepEqual([talks().length, talks()[0].fields.recommendation], [1, "Reject"], "said again the same day, it corrects what was said");
  assert.deepEqual(w.tables.notifications.map((n) => n.recipientId), ["hr"], "a correction does not tell HR again");
  // Their interview that has come takes it. One still ahead does not, and nor does what they said for another round.
  w.tables.hrRecords.push(
    { _id: "ahead", tracker: "interviews", code: "I-8", fields: { candidateId: "p", interviewer: "del", round: "Founder", date: "2099-01-01", status: "Planned", recommendation: "Pending" } },
    { _id: "iv", tracker: "interviews", code: "I-1", fields: { candidateId: "p", interviewer: "del", round: "Round 2", date: "2026-01-01", status: "Planned", recommendation: "Pending" } }
  );
  await new Promise((r) => setTimeout(r, 5)); // Later than what was said before, as it would be.
  await w.run(H.feedbackOn, { applicantId: "a", recommendation: "Hold", feedback: "Unsure" });
  assert.deepEqual([talks().length, w.f("iv").status, w.f("iv").recommendation, w.f("iv").feedback, w.f("ahead").status], [3, "Completed", "Hold", "Unsure", "Planned"], "a planned interview of theirs that has come takes it");
  assert.match(w.f("p").latestOutcome, /^Hold · Round 2/);
  assert.deepEqual(w.tables.notifications.map((n) => n.recipientId), ["hr", "hr"], "looking after them themselves, HR is told all the same");
  // What went onto a scheduled interview is corrected there too, whatever its round is called.
  await new Promise((r) => setTimeout(r, 5)); // The latest of today's is the one corrected.
  await w.run(H.feedbackOn, { applicantId: "a", recommendation: "Reject", feedback: "Changed my mind" });
  assert.deepEqual([talks().length, w.f("iv").recommendation, w.f("iv").feedback, w.tables.notifications.length], [3, "Reject", "Changed my mind", 2]);
  // Not on someone who is out of the running.
  w.tables.hrRecords.find((r) => r._id === "p")!.fields.status = "Rejected";
  await fails(w.run(H.feedbackOn, { applicantId: "a", recommendation: "Proceed", feedback: "Too late" }), /Shortlist them first/);
  w.tables.hrRecords.find((r) => r._id === "p")!.fields.status = "Active";
  // Deleting for good and emailing applicants are HR's and the founders'.
  await fails(w.run(R.deleteCandidates, { candidateIds: ["n"] }), /Only HR and super admins/);
  const shownTo = await w.run(R.getCandidate, { candidateId: "a" });
  assert.deepEqual([shownTo.full, shownTo.interviews.length, shownTo.interviews.every((i: any) => i.mine), shownTo.interviews.map((i: any) => i.verdict).sort()], [false, 3, true, ["", "Reject", "Reject"]]);

  // A role is a position like any other: its people are counted, listed and filtered under it, and not under the position above it as well.
  w = world({
    recruitJobs: [job(1, "Account Manager"), job(16, "Social Media Intern", { parentSourceId: 1 }), job(3, "Copy")],
    recruitCandidates: [app("am", 1, "Account Manager", "applied"), app("blank", 1, "", "applied"), app("odd", 1, "Something else", "applied"), app("in", 1, "Account Manager", "applied"), app("c", 3, "", "applied")],
    recruitActivity: [],
    hrRecords: [],
  });
  await w.run(S.moveApplicants, { candidateIds: ["in"], to: 16 });
  const ids = async (fn: any, args: any) => (await w.run(fn, args)).map((c: any) => c._id).sort();
  assert.deepEqual([await ids(R.listCandidates, { jobSourceId: 16 }), await ids(R.listCandidates, { jobSourceId: 1 })], [["in"], ["am", "blank", "odd"]]);
  assert.deepEqual([await ids(R.recentApplicants, { jobSourceId: 16 }), await ids(R.recentApplicants, { jobSourceId: 1 })], [["in"], ["am", "blank", "odd"]]);
  const said = (await w.run(R.recentApplicants, {})).find((c: any) => c._id === "in");
  assert.deepEqual([said.jobName, said.positionId, (await w.run(R.searchCandidates, { search: "in@x" }))[0].jobName], ["Social Media Intern", 16, "Social Media Intern"]);
  assert.deepEqual((await w.run(R.listJobs, {})).map((j: any) => [j.sourceId, j.total, j.fresh]), [[1, 3, 3], [16, 1, 1], [3, 1, 1]]);
  w.as("del");
  assert.deepEqual(await ids(R.listCandidates, { jobSourceId: 16 }), ["in"], "whoever has the position has its roles");

  // A step's owner who has left is not written onto people: their rows could not be saved again.
  w = world({ recruitPipelines: [pl("own", [step("a", "A", "screening"), step("b", "B", "interview", { owner: "left", days: 2 })])], recruitJobs: [job(1, "Design", { pipeline: "own" })], hrRecords: [on("p", { job: "1", stage: "A" })] });
  await w.run(H.save, { tracker: "pipeline", id: "p", fields: { stage: "B" } });
  assert.equal(w.f("p").actionOwner, undefined);
  assert.ok(w.f("p").nextDue);

  // Whatever is done in whatever order, everyone is at a step of the pipeline that applies to them.
  let seed = 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <X,>(xs: X[]): X => xs[Math.floor(rnd() * xs.length)];
  const some2 = () => (rnd() < 0.6 ? { teams: ["design", "copy", "tech"].filter(() => rnd() < 0.6), divide: rnd() < 0.5 } : {});
  const some = () => B.concat(step("task", "Task", "assignment"), step("join", "Joining", "joining")).filter(() => rnd() < 0.7).concat(step("z", "Z", "other"));
  let done = 0;
  for (let k = 0; k < 400; k++) {
    seed = k * 7919 + 17;
    const x = world({
      recruitPipelines: [pl("p0", some()), pl("p1", some())],
      teams: ["design", "copy", "tech"].map((_id) => ({ _id })),
      recruitJobs: [job(1, "Design", some2()), job(2, "Motion", { parentSourceId: 1, pipeline: "p0", ...some2() }), job(3, "Copy", { pipeline: "p1", ...some2() }), job(4, "Writer", { parentSourceId: 3 }), job(5, "Sales")],
      hrRecords: [1, 1, 2, 3, 3, 5].flatMap((j, i) => (rnd() < 0.7 ? [round(`r${j}${i}`, { job: String(j), ...(rnd() < 0.5 ? { team: pick(["design", "copy", "tech"]) } : {}), ...(rnd() < 0.3 ? { pipeline: pick(["p0", "p1", STANDARD]) } : {}) })] : [])),
      recruitCandidates: [["a", 1, "Motion"], ["b", 1, "Design"], ["c", 3, "Writer"], ["d", 5, "Sales"]].map(([id, j, t]) => app(id as string, j as number, t as string, "applied")),
    });
    await x.run(R.setStage, { candidateIds: ["a", "b", "c", "d"], stage: "screened" });
    // Someone from the workbook: only their round says what they are hired for.
    const theirs = x.tables.hrRecords.find((r) => r.tracker === "rounds");
    if (theirs) await x.run(H.save, { tracker: "pipeline", fields: { name: "imp", reqId: theirs._id, status: "Active" } });
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
        ["teams", () => x.run(S.savePosition, { id: pick(live), ...some2() })],
        ["team", () => x.run(S.setTeam, { candidateIds: ["a", "b", "c", "d"].filter(() => rnd() < 0.5), team: pick(["design", "copy", null]), position: pick(live) })],
        ["round team", () => x.run(H.save, { tracker: "rounds", id: pick(rounds), fields: { team: pick(["design", "copy", null]) } })],
        ["add", () => x.run(H.addApplicants, { candidateIds: [pick(["a", "b", "c", "d"])], roundId: pick(rounds) })],
        ["stage", () => x.run(R.setStage, { candidateIds: ["a", "b", "c", "d"].filter(() => rnd() < 0.5), stage: pick(["screened", "rejected", "on_hold"]), team: pick(["design", "copy", "tech"]) })],
      ]);
      const before = copy(x.tables);
      const bookBefore = await loadPipelines(x.ctx);
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
      const people = x.tables.hrRecords.filter((r) => r.tracker === "pipeline");
      // What was decided for someone is kept, as long as whoever they are hired for hires into it. Only HR saying
      // otherwise changes it: another team, another round by hand, shortlisted again from another entry.
      for (const r of people) {
        const had = before.hrRecords.find((o: Row) => o._id === r._id);
        if (!had) continue;
        const [was, is, at] = [bookBefore.teamOf(had), book.teamOf(r), book.teamsOf(book.jobOf(r)).teams];
        const why = `world ${k}, after ${name}: ${JSON.stringify([had.fields, r.fields, at])}`;
        // Nothing about teams changes what someone is hired for.
        if (["teams", "team", "round team"].includes(name)) assert.equal(book.teamsOf(book.jobOf(r)).of, bookBefore.teamsOf(bookBefore.jobOf(had)).of, `another position: ${why}`);
        if (!["team", "add", "stage"].includes(name) && was && had.fields.team === was && at.length > 1 && at.includes(was as any)) assert.equal(is, was, `a decision was lost: ${why}`);
        if (["teams", "position", "round", "rename", "delete", "tie", "place", "round team"].includes(name) && had.fields.status !== "Active") {
          assert.deepEqual([r.fields.team, r.fields.reqId], [had.fields.team, had.fields.reqId], `someone closed changed: ${why}`);
        }
      }
      assert.ok(["a", "b", "c", "d"].every((id) => people.some((r) => r.fields.applicantId === id)), "nobody is lost");
      for (const r of people.filter((r) => r.fields.status === "Active")) {
        const { teams, divide } = book.teamsOf(book.jobOf(r));
        const why = `world ${k}, after ${name}: ${JSON.stringify([r.fields, teams, divide, book.rounds.get(r.fields.reqId)?.fields])}`;
        if (teams.length > 1 && divide) assert.ok(book.teamOf(r), `not divided: ${why}`);
        // Nobody sits in another team's round.
        const of = book.roundTeam(r);
        if (of) assert.equal(book.teamOf(r), of, `in another team's round: ${why}`);
      }
      // Either-or: a team unticked and ticked again, everyone is whose they were.
      const job2 = x.tables.recruitJobs.find((j) => !j.removedAt && j.parentSourceId == null && !j.divide && (j.teams ?? []).length > 1);
      if (job2 && t % 3 === 0) {
        const whose = (b: typeof book) => Object.fromEntries(x.tables.hrRecords.filter((r) => r.tracker === "pipeline").map((r) => [r._id, b.teamOf(r)]));
        const was = whose(book);
        await x.run(S.savePosition, { id: job2.sourceId, teams: job2.teams.slice(1) });
        await x.run(S.savePosition, { id: job2.sourceId, teams: job2.teams });
        assert.deepEqual(whose(await loadPipelines(x.ctx)), was, `unticked and ticked again in world ${k}, after ${name}`);
      }
    }
  }
  assert.ok(done > 1500, `only ${done} changes went through`);
  console.log("recruitSetup: ok");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
