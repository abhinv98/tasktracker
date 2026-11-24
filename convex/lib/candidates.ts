import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { RecruitAccess } from "./guards";
import { barelyStarted, entryStep, fitStage, type Step } from "./hirePipeline";
import { TRACKERS, type Fields, type TrackerKey } from "./hrTrackers";
import { loadPipelines, type Pipelines } from "./pipelines";

// Website applicants (recruitCandidates) becoming candidates (the `pipeline`
// tracker). Shortlisting someone on a position, and adding them to an open
// position by hand, both come through here.

/** Cleared rows are kept under this prefix: off every screen, but recoverable
 *  (hrOps.restoreArchived), and their IDs are never handed out again. */
export const ARCHIVED = "archived:";

/** Today's date in India, the way the trackers store dates. */
export const today = (at = Date.now()) => new Date(at + 5.5 * 3_600_000).toISOString().slice(0, 10);

export const rowsOf = (ctx: MutationCtx, tracker: string) =>
  ctx.db
    .query("hrRecords")
    .withIndex("by_tracker", (q) => q.eq("tracker", tracker))
    .collect();

/** The next workbook-style ID for a tracker, given the IDs in use: REQ-26-013 follows REQ-26-012. */
export function codeAfter(rows: { code: string }[], tracker: TrackerKey) {
  const head = `${TRACKERS[tracker].prefix}-${today().slice(2, 4)}-`;
  const last = Math.max(
    0,
    ...rows.filter((r) => r.code.startsWith(head)).map((r) => Number(r.code.slice(head.length)) || 0)
  );
  return head + String(last + 1).padStart(3, "0");
}

/** The next ID for a tracker, counting the rows that were cleared out of it. */
export const nextCode = async (ctx: MutationCtx, tracker: TrackerKey) =>
  codeAfter([...(await rowsOf(ctx, tracker)), ...(await rowsOf(ctx, ARCHIVED + tracker))], tracker);

/** Where a candidate starts, from where their application is. */
const startAt = (steps: readonly Step[], stage: string | undefined): Step =>
  ((stage === "interview" || stage === "offer") && steps.find((s) => s.kind === stage)) || entryStep(steps);

/** Someone named in the setup, if they still work here: rows may not name anyone who does not. */
async function staff(ctx: MutationCtx, id: string | undefined) {
  const userId = id ? ctx.db.normalizeId("users", id) : null;
  const user = userId ? await ctx.db.get(userId) : null;
  return user && user.role !== "client" && user.isReviewer !== true ? user._id : undefined;
}

/** What being at a step sets: its owner, and a date to have it done by. Nothing the step does not say. */
export async function atStep(ctx: MutationCtx, step: Step | undefined): Promise<Fields> {
  const owner = await staff(ctx, step?.owner);
  return {
    ...(owner ? { actionOwner: owner } : {}),
    ...(step?.days ? { nextDue: today(Date.now() + step.days * 86_400_000) } : {}),
  };
}

/**
 * Put applicants on the Candidates list. With a `round` (an open position) they
 * go into that one. Without, they go into the newest open position tied to the
 * role they applied for, if there is one, and otherwise carry just the website
 * position. Someone already on the list is not added again by shortlisting; a
 * live row that had no open position is given one. Returns how many rows were
 * added or placed.
 *
 * Without a `userId` this is bringing over people shortlisted earlier: nobody
 * in particular owns them, and first contact is the day they were shortlisted.
 */
export async function addToCandidates(
  ctx: MutationCtx,
  access: Pick<RecruitAccess, "full" | "jobs"> & { userId?: Id<"users"> },
  applicants: Doc<"recruitCandidates">[],
  round?: Doc<"hrRecords">
) {
  const rows = await rowsOf(ctx, "pipeline");
  const codes: { code: string }[] = [...rows, ...(await rowsOf(ctx, `${ARCHIVED}pipeline`))];
  const byApplicant = new Map<string, { _id: Id<"hrRecords">; fields: Doc<"hrRecords">["fields"] }[]>();
  for (const row of rows) {
    const key = String(row.fields.applicantId ?? "");
    if (key) byApplicant.set(key, [...(byApplicant.get(key) ?? []), row]);
  }
  const pipelines = await loadPipelines(ctx);
  const { jobs } = pipelines;
  const openRounds = round ? [] : (await rowsOf(ctx, "rounds")).filter((r) => r.fields.hiringStatus === "Open");
  const newestFor = (id: number | null | undefined) =>
    id == null ? undefined : openRounds.filter((r) => r.fields.job === String(id)).at(-1);

  let added = 0;
  for (const c of applicants) {
    const job = jobs.find((j) => j.sourceId === c.jobSourceId);
    const sub = pipelines.roleOf(c.jobSourceId, c.position);
    const target = round ?? newestFor(sub?.sourceId) ?? newestFor(c.jobSourceId) ?? newestFor(job?.parentSourceId);

    const there = byApplicant.get(c._id) ?? [];
    const here = target && there.find((r) => r.fields.reqId === target._id);
    if (here) {
      // Put into this one by hand although they were closed in it: back into play.
      if (round && !["Active", "Joined"].includes(standing(here.fields))) {
        await reopen(ctx, here, pipelines.stepsOf(here));
        added++;
      }
      continue;
    }
    // Only a row that is still live, and that this person may see.
    const unplaced = there.find(
      (r) => !r.fields.reqId && r.fields.status === "Active" && (access.full || access.jobs.has(Number(r.fields.job)))
    );
    if (target && unplaced) {
      const there = { ...unplaced.fields, reqId: target._id, lastUpdate: today() };
      const stage = fitStage(String(unplaced.fields.stage ?? ""), pipelines.stepsOf(unplaced), pipelines.stepsOf({ fields: there }));
      unplaced.fields = { ...there, stage };
      await ctx.db.patch(unplaced._id, { fields: unplaced.fields, updatedAt: Date.now() });
      added++;
      continue;
    }
    if (there.length > 0 && !round) continue;

    const now = Date.now();
    const code = codeAfter(codes, "pipeline");
    const hiredFor = target?.fields.job ? Number(target.fields.job) : (sub?.sourceId ?? c.jobSourceId);
    const step = startAt(pipelines.stepsFor(hiredFor, target?.fields), c.stage);
    // Their position says who takes them on; otherwise whoever shortlisted them.
    const owner = (await staff(ctx, sub?.hrOwner)) ?? (await staff(ctx, job?.hrOwner)) ?? access.userId;
    const fields: Doc<"hrRecords">["fields"] = {
      name: c.name,
      job: String(c.jobSourceId),
      ...(target ? { reqId: target._id } : {}),
      roleOriginal: c.position || job?.name || "",
      contact: [c.email, c.number].filter(Boolean).join(" · "),
      source: "Website",
      firstContact: today(access.userId ? undefined : (c.stageUpdatedAt ?? c.createdAt ?? undefined)),
      stage: step.name,
      status: "Active",
      ...(access.userId && owner ? { hrOwner: owner } : {}),
      ...(access.userId ? await atStep(ctx, step) : {}),
      verification: "Verified",
      origin: "New",
      lastUpdate: today(),
      applicantId: c._id,
      ...(c.resume ? { resume: c.resume } : {}),
    };
    const _id = await ctx.db.insert("hrRecords", {
      tracker: "pipeline", code, fields, createdBy: access.userId, createdAt: now, updatedAt: now,
    });
    codes.push({ code });
    byApplicant.set(c._id, [...there, { _id, fields }]);
    added++;
  }
  return added;
}

/* ── Positions and Candidates in step ──────────────────────── */

type Who = Pick<Doc<"users">, "_id" | "name" | "email">;
const CLOSED: readonly string[] = TRACKERS.pipeline.boardClosed;

/** Where a candidate stands: "Active", or how they were closed (by status, or by the stage alone). */
export function standing(fields: Fields): string {
  const status = String(fields.status ?? "");
  if (status === "Archived" || CLOSED.includes(status)) return status;
  const stage = String(fields.stage ?? "");
  return CLOSED.includes(stage) ? stage : "Active";
}

/** `closedFrom` of rows (and rounds) set aside because their position was removed. */
export const REMOVED = "removed";

/** What an application's status says about the person on Candidates. */
const STATUS_FOR: Partial<Record<string, string>> = { rejected: "Rejected", on_hold: "On Hold", applied: "Archived" };
type PipelineRow = { _id: Id<"hrRecords">; fields: Fields };

/** Back into play, where they were (or at the start, if the stage itself was a closing one or is gone). */
async function reopen(ctx: MutationCtx, row: PipelineRow, steps: readonly Step[]) {
  const fields: Fields = { ...row.fields, status: "Active", lastUpdate: today() };
  delete fields.closedFrom;
  if (!steps.some((s) => s.name === fields.stage)) fields.stage = entryStep(steps).name;
  row.fields = fields;
  await ctx.db.patch(row._id, { fields, updatedAt: Date.now() });
}

/**
 * An application moved on its position page: the person's rows on Candidates
 * follow. Held or rejected there closes what is live here (the stage is kept,
 * so they come back where they were), and back to New takes them off the board,
 * but only before anything has happened. Shortlisting again reopens what was
 * closed that way; if nothing was and they are not live anywhere, their latest
 * row. A row closed on Candidates for its own reasons is otherwise left closed.
 * `mine` says which rows this person may change. Returns whose rows reopened.
 */
export async function followApplication(
  ctx: MutationCtx,
  mine: (row: Doc<"hrRecords">) => Promise<boolean>,
  applicantIds: readonly string[],
  stage: string
): Promise<Set<string>> {
  const ids = new Set(applicantIds);
  const { stepsOf } = await loadPipelines(ctx);
  const reopened = new Set<string>();
  const people = new Map<string, Doc<"hrRecords">[]>();
  for (const row of ids.size ? await rowsOf(ctx, "pipeline") : []) {
    const id = String(row.fields.applicantId ?? "");
    if (ids.has(id) && (await mine(row))) people.set(id, [...(people.get(id) ?? []), row]);
  }
  for (const [id, rows] of people) {
    if (stage === "screened") {
      const closed = rows.filter((r) => !["Active", "Joined"].includes(standing(r.fields)));
      const fromHere = closed.filter((r) => r.fields.closedFrom === "positions");
      const live = rows.length > closed.length;
      const latest = [...closed].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 1);
      for (const row of fromHere.length || live ? fromHere : latest) {
        await reopen(ctx, row, stepsOf(row));
        reopened.add(id);
      }
      continue;
    }
    const status = STATUS_FOR[stage];
    if (!status) continue;
    const live = rows.some((r) => standing(r.fields) === "Active");
    for (const row of rows) {
      const now = standing(row.fields);
      const ours = row.fields.closedFrom === "positions";
      if (live && ours && now !== "Active") {
        // Closed from here some time ago, and they have moved on since: no longer ours to bring back.
        const fields = { ...row.fields };
        delete fields.closedFrom;
        await ctx.db.patch(row._id, { fields });
        continue;
      }
      // What is live closes, and what was closed from here changes with a change of
      // mind. A withdrawal is not turned into a rejection.
      // Set aside with a removed position: decided on since, so restoring it does not bring them back.
      const aside = row.fields.closedFrom === REMOVED;
      if (now !== "Active" && !ours && !aside && !(now === "On Hold" && status === "Rejected")) continue;
      if (status === "Archived" && !aside && !barelyStarted(stepsOf(row), String(row.fields.stage ?? ""))) {
        throw new ConvexError(`${String(row.fields.name ?? "This person")} is at ${String(row.fields.stage)} on Candidates. Close them there first.`);
      }
      await ctx.db.patch(row._id, {
        fields: { ...row.fields, status, closedFrom: "positions", lastUpdate: today() },
        updatedAt: Date.now(),
      });
    }
  }
  return reopened;
}

/** What closing or reopening a candidate says about their application. */
const STAGE_FOR: Partial<Record<string, Doc<"recruitCandidates">["stage"]>> = {
  Active: "screened", "On Hold": "on_hold", Rejected: "rejected", Withdrawn: "rejected", Joined: "hired",
};

/** The other way round: a candidate closed or reopened on Candidates, and the
 *  application they came from follows, with the move in its history. Someone
 *  hiring for another position does not change an application that is not theirs. */
export async function followCandidate(
  ctx: MutationCtx,
  access: Pick<RecruitAccess, "full" | "jobs">,
  before: Doc<"hrRecords">,
  after: Fields,
  by: Who
) {
  const from = standing(before.fields);
  const to = standing(after);
  const applicantId = ctx.db.normalizeId("recruitCandidates", String(after.applicantId ?? ""));
  const stage = STAGE_FOR[to];
  if (from === to || !applicantId || !stage) return;
  const applicant = await ctx.db.get(applicantId);
  const was = applicant?.stage ?? "applied";
  if (!applicant || was === stage || !(access.full || access.jobs.has(applicant.jobSourceId))) return;
  // Reopening never sends someone back from interview or offer.
  if (stage === "screened" && !["applied", "on_hold", "rejected", "hired"].includes(was)) return;
  if (to !== "Active" && to !== "Joined") {
    // Still live for another open position: the application stays shortlisted.
    const others = (await rowsOf(ctx, "pipeline")).filter((r) => r._id !== before._id && r.fields.applicantId === applicantId);
    if (others.some((r) => standing(r.fields) === "Active")) return;
  }
  const now = Date.now();
  await ctx.db.patch(applicantId, { stage, stageUpdatedAt: now });
  await ctx.db.insert("recruitActivity", {
    candidateId: applicantId,
    kind: "stage",
    body: to === "Active" ? "Reopened on Candidates" : `${to} on Candidates (${String(before.fields.stage ?? "")})`,
    fromStage: was,
    toStage: stage,
    authorId: by._id,
    authorName: by.name ?? by.email ?? "HR",
    createdAt: now,
  });
}

/** Everyone live on Candidates for an open position's role who is not in one yet, put into it. */
export async function placeInRound(ctx: MutationCtx, access: Pick<RecruitAccess, "full" | "jobs">, round: Doc<"hrRecords">) {
  const { jobs, rounds, roleOf, stepsFor, stepsOf } = await loadPipelines(ctx);
  const target = Number(round.fields.job);
  const open = new Set([...rounds.values()].filter((r) => r.fields.hiringStatus === "Open").map((r) => Number(r.fields.job)));
  let placed = 0;
  for (const row of round.fields.job ? await rowsOf(ctx, "pipeline") : []) {
    const job = Number(row.fields.job);
    if (row.fields.reqId || !row.fields.job || standing(row.fields) !== "Active") continue;
    if (!access.full && !access.jobs.has(job)) continue;
    // Same order as shortlisting: their sub-role, the role, then the role above it.
    const sub = roleOf(job, String(row.fields.roleOriginal ?? ""));
    const order = [sub?.sourceId, job, jobs.find((j) => j.sourceId === job)?.parentSourceId];
    // The first of those with a round open takes them. This one counts, open or not.
    if (order.find((id) => id != null && (id === target || open.has(id))) !== target) continue;
    const stage = fitStage(String(row.fields.stage ?? ""), stepsOf(row), stepsFor(target, round.fields));
    await ctx.db.patch(row._id, { fields: { ...row.fields, reqId: round._id, stage, lastUpdate: today() }, updatedAt: Date.now() });
    placed++;
  }
  return placed;
}

/** Which pipeline people are on changed (a position or a hiring round picked
 *  another): everyone takes the matching step. Returns how many in play moved. */
export async function refit(ctx: MutationCtx, before: Pipelines) {
  const after = await loadPipelines(ctx);
  const now = Date.now();
  let moved = 0;
  for (const row of await rowsOf(ctx, "pipeline")) {
    if (before.keyOf(row) === after.keyOf(row)) continue;
    const stage = fitStage(String(row.fields.stage ?? ""), before.stepsOf(row), after.stepsOf(row));
    if (stage === row.fields.stage) continue;
    await ctx.db.patch(row._id, { fields: { ...row.fields, stage }, updatedAt: now });
    if (standing(row.fields) === "Active") moved++;
  }
  return moved;
}

/**
 * The team someone hired joins: their hiring round's, else their position's.
 * With several it is HR's pick, unless the position divides people between
 * them: then the team that has had fewest.
 */
export async function teamFor(ctx: MutationCtx, book: Pipelines, row: { fields: Fields }): Promise<string | undefined> {
  const known = new Set<string>((await ctx.db.query("teams").collect()).map((t) => t._id));
  const round = book.rounds.get(String(row.fields.reqId ?? ""))?.fields.team;
  if (typeof round === "string" && known.has(round)) return round;
  const { of, teams, divide } = book.teamsOf(book.jobOf(row));
  const live = teams.filter((t) => known.has(t));
  if (live.length < 2 || !divide) return live.length === 1 ? live[0] : undefined;
  const had = new Map(live.map((t) => [t, 0]));
  for (const r of await rowsOf(ctx, "pipeline")) {
    const team = String(r.fields.team ?? "");
    if (!had.has(team) || book.teamsOf(book.jobOf(r)).of !== of || !["Active", "Joined"].includes(standing(r.fields))) continue;
    had.set(team, had.get(team)! + 1);
  }
  return live.reduce((best, t) => (had.get(t)! < had.get(best)! ? t : best));
}

/* ── Moving people to another position ─────────────────────── */

type Rounds = ReadonlyMap<string, { fields: Fields }>;
/** What moving needs to know, as it was before anything moved. `kept`: hiring
 *  rounds that go to the new position too, so people stay in those. */
export type MoveFrom = Pick<Pipelines, "jobs" | "rounds" | "stepsFor" | "stepsOf" | "teamsOf"> & { kept?: ReadonlySet<string> };

/**
 * Applications, and whoever they are on Candidates, from one position to
 * another. They file under the role, with a sub-role as text, as the website
 * does it. On Candidates they keep their standing and take the matching step of
 * the new pipeline. A hiring round for the old position is left; one for some
 * other position is not touched.
 */
export async function moveToPosition(
  ctx: MutationCtx,
  applicants: Doc<"recruitCandidates">[],
  target: Doc<"recruitJobs">,
  by: Who,
  from: MoveFrom,
  /** Which Candidates rows this person may change. An application can be theirs and the row another position's. */
  mine: (row: Doc<"hrRecords">) => Promise<boolean>
) {
  const filedUnder = target.parentSourceId ?? target.sourceId;
  const name = (id: number) => from.jobs.find((j) => j.sourceId === id)?.name ?? "another position";
  const now = Date.now();
  const moved = new Map<string, number>(); // application -> the position it was under
  for (const a of applicants) {
    if (a.jobSourceId === filedUnder && a.position.trim().toLowerCase() === target.name.trim().toLowerCase()) continue;
    await ctx.db.patch(a._id, { jobSourceId: filedUnder, position: target.name });
    const was = name(a.jobSourceId);
    await ctx.db.insert("recruitActivity", {
      candidateId: a._id,
      kind: "move",
      body: `From ${a.position && a.position.toLowerCase() !== was.toLowerCase() ? `${was} (${a.position})` : was} to ${target.name}`,
      authorId: by._id,
      authorName: by.name ?? by.email ?? "HR",
      createdAt: now,
    });
    moved.set(a._id, a.jobSourceId);
  }
  const newRound = newestRound(from.rounds, target.sourceId, filedUnder);
  for (const row of moved.size ? await rowsOf(ctx, "pipeline") : []) {
    const was = moved.get(String(row.fields.applicantId ?? ""));
    if (was === undefined || !(await mine(row))) continue;
    await ctx.db.patch(row._id, { fields: moveRow(row, target, newRound, from, was), updatedAt: now });
  }
  return moved.size;
}

/** The newest round open for the sub-role, else for the role. */
export const newestRound = (rounds: Rounds, ...ids: number[]): string | undefined => {
  for (const id of ids) {
    const hit = [...rounds].filter(([, r]) => r.fields.hiringStatus === "Open" && r.fields.job === String(id)).at(-1);
    if (hit) return hit[0];
  }
};

/** One Candidates row, as it is under another position. */
export function moveRow(
  row: PipelineRow,
  target: Pick<Doc<"recruitJobs">, "sourceId" | "name" | "parentSourceId">,
  newRound: string | undefined,
  { jobs, rounds, stepsFor, stepsOf, teamsOf, kept }: MoveFrom,
  /** The position they are moved out of. */
  was: number
): Fields {
  const root = (id: number) => jobs.find((j) => j.sourceId === id)?.parentSourceId ?? id;
  const filedUnder = target.parentSourceId ?? target.sourceId;
  const fields: Fields = { ...row.fields, job: String(filedUnder), roleOriginal: target.name, lastUpdate: today() };
  // Set aside when their position was removed: moved, they are back in play.
  if (fields.closedFrom === REMOVED) {
    fields.status = "Active";
    delete fields.closedFrom;
  }
  const jobOfRound = (id: unknown) => Number(rounds.get(String(id ?? ""))?.fields.job || NaN);
  const roundJob = jobOfRound(fields.reqId);
  const stays = !!fields.reqId && !!kept?.has(String(fields.reqId));
  // The round of the role they go to, or of the role above it while it has none of its own.
  const fits = roundJob === target.sourceId || (roundJob === filedUnder && jobOfRound(newRound) !== target.sourceId);
  // Someone closed for good keeps the round they were closed in: its history counts
  // them. Held or rejected on Positions can still be taken back there, into a round of the new position.
  const active = standing(fields) === "Active";
  if ((active || fields.closedFrom === "positions") && fields.reqId && !stays && !fits && root(roundJob) === root(was)) delete fields.reqId;
  if (active && !fields.reqId && newRound) fields.reqId = newRound;
  // As everywhere: the round's position decides, and only without one the position itself.
  const inRound = rounds.get(String(fields.reqId ?? ""))?.fields;
  const hiredFor = stays || !Number(inRound?.job) ? target.sourceId : Number(inRound!.job);
  fields.stage = fitStage(String(fields.stage ?? ""), stepsOf(row), stepsFor(hiredFor, inRound));
  // A team that neither their round nor the position hires into is not theirs any more.
  const teams = inRound?.team ? [String(inRound.team)] : teamsOf(hiredFor).teams;
  if (fields.team && teams.length && !teams.includes(String(fields.team))) delete fields.team;
  return fields;
}
