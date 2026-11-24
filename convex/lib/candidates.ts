import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { RecruitAccess } from "./guards";
import { TRACKERS, type Fields, type TrackerKey } from "./hrTrackers";

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
const START: Partial<Record<string, string>> = { interview: "Interview 1", offer: "Offer" };

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
  const jobs = await ctx.db.query("recruitJobs").collect();
  const openRounds = round ? [] : (await rowsOf(ctx, "rounds")).filter((r) => r.fields.hiringStatus === "Open");
  const newestFor = (id: number | null | undefined) =>
    id == null ? undefined : openRounds.filter((r) => r.fields.job === String(id)).at(-1);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  let added = 0;
  for (const c of applicants) {
    const job = jobs.find((j) => j.sourceId === c.jobSourceId);
    // The website files people under the parent role, with the sub-role as text.
    const sub = jobs.find((j) => j.parentSourceId === c.jobSourceId && same(j.name, c.position));
    const target = round ?? newestFor(sub?.sourceId) ?? newestFor(c.jobSourceId) ?? newestFor(job?.parentSourceId);

    const there = byApplicant.get(c._id) ?? [];
    const here = target && there.find((r) => r.fields.reqId === target._id);
    if (here) {
      // Put into this one by hand although they were closed in it: back into play.
      if (round && !["Active", "Joined"].includes(standing(here.fields))) {
        await reopen(ctx, here);
        added++;
      }
      continue;
    }
    // Only a row that is still live, and that this person may see.
    const unplaced = there.find(
      (r) => !r.fields.reqId && r.fields.status === "Active" && (access.full || access.jobs.has(Number(r.fields.job)))
    );
    if (target && unplaced) {
      unplaced.fields = { ...unplaced.fields, reqId: target._id, lastUpdate: today() };
      await ctx.db.patch(unplaced._id, { fields: unplaced.fields, updatedAt: Date.now() });
      added++;
      continue;
    }
    if (there.length > 0 && !round) continue;

    const now = Date.now();
    const code = codeAfter(codes, "pipeline");
    const fields: Doc<"hrRecords">["fields"] = {
      name: c.name,
      job: String(c.jobSourceId),
      ...(target ? { reqId: target._id } : {}),
      roleOriginal: c.position || job?.name || "",
      contact: [c.email, c.number].filter(Boolean).join(" · "),
      source: "Website",
      firstContact: today(access.userId ? undefined : (c.stageUpdatedAt ?? c.createdAt ?? undefined)),
      stage: START[c.stage ?? ""] ?? "Screening",
      status: "Active",
      ...(access.userId ? { hrOwner: access.userId } : {}),
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

/** What an application's status says about the person on Candidates. */
const STATUS_FOR: Partial<Record<string, string>> = { rejected: "Rejected", on_hold: "On Hold", applied: "Archived" };
/** Nothing has happened with them yet: the only place "back to New" can take someone from. */
const BARELY_STARTED = ["", "Sourced", "Contacted", "Screening"];

type PipelineRow = { _id: Id<"hrRecords">; fields: Fields };

/** Back into play, where they were (or at Screening, if the stage itself was a closing one). */
async function reopen(ctx: MutationCtx, row: PipelineRow) {
  const fields: Fields = { ...row.fields, status: "Active", lastUpdate: today() };
  delete fields.closedFrom;
  if (CLOSED.includes(String(fields.stage))) fields.stage = "Screening";
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
        await reopen(ctx, row);
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
      if (now !== "Active" && !ours && !(now === "On Hold" && status === "Rejected")) continue;
      if (status === "Archived" && !BARELY_STARTED.includes(String(row.fields.stage ?? ""))) {
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
  const jobs = await ctx.db.query("recruitJobs").collect();
  const target = Number(round.fields.job);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  let placed = 0;
  for (const row of round.fields.job ? await rowsOf(ctx, "pipeline") : []) {
    const job = Number(row.fields.job);
    if (row.fields.reqId || !row.fields.job || standing(row.fields) !== "Active") continue;
    if (!access.full && !access.jobs.has(job)) continue;
    // Same order as shortlisting: their sub-role, the role, then the role above it.
    const sub = jobs.find((j) => j.parentSourceId === job && same(j.name, String(row.fields.roleOriginal ?? "")));
    if (![sub?.sourceId, job, jobs.find((j) => j.sourceId === job)?.parentSourceId].includes(target)) continue;
    await ctx.db.patch(row._id, { fields: { ...row.fields, reqId: round._id, lastUpdate: today() }, updatedAt: Date.now() });
    placed++;
  }
  return placed;
}
