import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./lib/internalAuth";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mayRecruitFor, myCandidate, recruitAccess, type RecruitAccess } from "./lib/guards";
import { ARCHIVED, GONE, addToCandidates, atStep, followCandidate, nextCode, placeInRound, refit, rowsOf, settleTeams, standing, today, withTeam } from "./lib/candidates";
import { CLOSING, STANDARD, entryStep, fitStage } from "./lib/hirePipeline";
import { livePositions, loadPipelines, type Pipelines } from "./lib/pipelines";
import { inScope, scopeOf } from "./lib/recruitScope";
import {
  TRACKERS,
  TRACKER_KEYS,
  cleanFields,
  isTracker,
  type Field,
  type Fields,
  type TrackerKey,
} from "./lib/hrTrackers";

// ── THE HR OPERATING SYSTEM ────────────────────────────────────
// The founders' recruitment tracker workbook, as an app. Every tab is a
// "tracker" (see lib/hrTrackers.ts) and every row lives in `hrRecords`.
//
// Access has two levels (lib/guards.ts recruitAccess):
//   full   - HR and super admins: every tracker, the dashboard, and who else
//            gets in.
//   scoped - someone they have given positions to (users.recruitJobs): the
//            open positions tied to them, the people shortlisted for them, and
//            those people's interviews, assignments and offers. Nothing else.

const fieldsValidator = v.record(v.string(), v.union(v.string(), v.number(), v.null()));

/** Mutations refuse outright. Queries use recruitAccess and answer null, so a
 *  page whose reader just lost access shows nothing instead of crashing. */
async function requireAccess(ctx: QueryCtx | MutationCtx): Promise<RecruitAccess> {
  const access = await recruitAccess(ctx);
  if (!access) throw new Error("Recruitment is HR only");
  return access;
}

function trackerFor(key: string, full: boolean): TrackerKey {
  if (!isTracker(key)) throw new Error("Unknown tracker");
  if (TRACKERS[key].hrOnly && !full) throw new Error("This tracker is HR only");
  return key;
}

/** A `ref` must point at a row of the right tracker, a `user` at a staff member. */
async function checkLinks(ctx: MutationCtx, tracker: TrackerKey, fields: Fields) {
  for (const field of TRACKERS[tracker].fields as readonly Field[]) {
    const value = fields[field.key];
    if (typeof value !== "string") continue;
    if (field.type === "ref") {
      const id = ctx.db.normalizeId("hrRecords", value);
      const row = id && (await ctx.db.get(id));
      if (!row || row.tracker !== field.ref) throw new Error(`${field.label}: pick one from the list`);
    }
    if (field.type === "job") {
      const job = await ctx.db
        .query("recruitJobs")
        .withIndex("by_source", (q) => q.eq("sourceId", Number(value)))
        .first();
      if (!job) throw new Error(`${field.label}: pick one from the list`);
    }
    if (field.type === "user") {
      const id = ctx.db.normalizeId("users", value);
      const person = id && (await ctx.db.get(id));
      if (!person || person.role === "client" || person.isReviewer === true) {
        throw new Error(`${field.label}: pick a team member`);
      }
    }
  }
}

/** A row's values without the amounts, for someone who does not see pay. */
const withoutPay = <T>(tracker: TrackerKey, fields: Record<string, T>): Record<string, T> => {
  const pay = new Set((TRACKERS[tracker].fields as readonly Field[]).filter((f) => f.pay).map((f) => f.key));
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !pay.has(key)));
};

/** The pipelines someone may see and pick: all of them for HR; for the rest the
 *  standard one, their positions' and those of the rows they work on. */
function pipelinesFor(book: Pipelines, access: RecruitAccess, seen: { tracker: string; fields: Fields }[]): Set<string> {
  if (access.full) return new Set(book.list.keys());
  return new Set([
    STANDARD,
    ...book.jobs.filter((j) => mayRecruitFor(access, j.sourceId)).map((j) => book.keyFor(j.sourceId)),
    ...seen.filter((r) => r.tracker === "rounds").map((r) => book.keyFor(Number(r.fields.job), r.fields)),
    ...seen.filter((r) => r.tracker === "pipeline").map((r) => book.keyOf(r)),
  ]);
}

/** Everything the caller may see, in one read: the screens work out health,
 *  counts and the dashboard from it (src/lib/hrHealth.ts). */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return null;
    const { full } = access;
    const every = await ctx.db.query("hrRecords").collect();
    const seen = full ? null : scopeOf(every, access);
    const book = await loadPipelines(ctx);
    const teams = (await ctx.db.query("teams").collect())
      .map((t) => ({ _id: t._id as string, name: t.name, color: t.color }))
      .sort((a, b) => a.name.localeCompare(b.name));
    /** What each candidate's application says: when they applied, their experience and notice, and for whoever
     *  sees pay what they earn and expect. ponytail: one read per candidate; store it on the row past ~3,000 of them. */
    const applied = new Map<string, Record<string, string>>();
    for (const r of every) {
      if (r.tracker !== "pipeline" || (seen && !seen.has(r._id))) continue;
      const id = ctx.db.normalizeId("recruitCandidates", text(r.fields, "applicantId"));
      const a = id ? await ctx.db.get(id) : null;
      if (!a) continue;
      const said = {
        appliedOn: a.createdAt ? today(a.createdAt) : "",
        experience: a.experience ?? "",
        noticePeriod: a.noticePeriod ?? "",
        ...(access.pay ? { currentCtc: a.currentCtc ?? "", expectedCtc: a.expectedCtc ?? "" } : {}),
      };
      applied.set(r._id, Object.fromEntries(Object.entries(said).filter(([, value]) => value)));
    }
    const rows = every
      .filter((r) => isTracker(r.tracker) && (seen ? seen.has(r._id) : true))
      .map((r) => ({ _id: r._id, tracker: r.tracker as TrackerKey, code: r.code, fields: access.pay ? r.fields : withoutPay(r.tracker as TrackerKey, r.fields) }))
      .map((r) => (applied.has(r._id) ? { ...r, fields: { ...r.fields, ...applied.get(r._id)! } } : r))
      // Which pipeline a candidate, or a hiring round, is on, and whose they are.
      .map((r) =>
        r.tracker === "pipeline"
          ? { ...r, pipeline: book.keyOf(r), team: book.teamOf(r) ?? "" }
          : r.tracker === "rounds"
            ? { ...r, pipeline: book.keyFor(Number(r.fields.job), r.fields), team: book.valid(Number(r.fields.job) || null, r.fields.team) ?? "" }
            : r
      );
    const known = pipelinesFor(book, access, rows);
    const pipelines = [...book.list].filter(([key]) => known.has(key)).map(([key, p]) => ({ key, ...p }));
    // The website positions a row can be tied to: all of them for HR, their own for the rest.
    const jobs = livePositions(book.jobs)
      .filter((j) => mayRecruitFor(access, j.sourceId))
      .map((j) => ({
        id: String(j.sourceId),
        name: j.name,
        hrOwner: (j.hrOwner ?? "") as string,
        hiringManager: (j.hiringManager ?? "") as string,
        parent: j.parentSourceId == null ? "" : String(j.parentSourceId),
        // On the website's form.
        open: j.status !== "closed" && book.jobs.find((p) => p.sourceId === j.parentSourceId)?.status !== "closed",
        pipeline: book.keyFor(j.sourceId),
        teams: book.teamsOf(j.sourceId).teams,
        divide: book.teamsOf(j.sourceId).divide,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const people = (await ctx.db.query("users").collect())
      .filter((u) => u.role !== "client" && u.isReviewer !== true)
      .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unnamed" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { full, pay: access.pay, me: access.userId, rows, people, jobs, pipelines, teams };
  },
});

export const save = mutation({
  args: { tracker: v.string(), id: v.optional(v.id("hrRecords")), fields: fieldsValidator },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx);
    const { user, full } = access;
    const tracker = trackerFor(args.tracker, full);
    const existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!existing || existing.tracker !== tracker)) throw new Error("Row not found");
    // Someone with positions works inside them: the row as it is, and as it
    // will be after this save, must both sit under one of their positions.
    const every = full ? [] : await ctx.db.query("hrRecords").collect();
    const seen = full ? null : scopeOf(every, access);
    if (seen && existing && !seen.has(existing._id)) throw new Error("Row not found");
    // An edit sends only what changed, laid over the row as it is now, so two
    // people editing different fields of one row do not undo each other.
    // Amounts they do not see are not theirs to change, or to clear.
    const given = access.pay ? args.fields : withoutPay(tracker, args.fields);
    const fields = cleanFields(tracker, { ...existing?.fields, ...given });
    await checkLinks(ctx, tracker, fields);
    if (seen && !inScope({ tracker, fields }, access, seen)) {
      throw new Error(
        tracker === "rounds"
          ? "Pick one of your positions under Website position"
          : "This must belong to one of your positions"
      );
    }
    // What they point it at, and what they take it away from, must both be theirs.
    for (const field of TRACKERS[tracker].fields as readonly Field[]) {
      const [before, after] = [existing?.fields[field.key] ?? "", fields[field.key] ?? ""];
      if (!seen || before === after || (field.type !== "ref" && field.type !== "job")) continue;
      for (const value of [before, after]) {
        if (value === "") continue;
        if (field.type === "ref" ? !seen.has(String(value)) : !mayRecruitFor(access, Number(value))) {
          throw new Error(`${field.label}: that one is not yours to change`);
        }
      }
    }
    for (const field of TRACKERS[tracker].fields as readonly Field[]) {
      if (field.stamp) fields[field.key] = today();
    }
    // Written feedback is expected the day after an interview unless HR says otherwise.
    if (tracker === "interviews" && typeof fields.date === "string" && !fields.feedbackDue) {
      fields.feedbackDue = new Date(Date.parse(fields.date) + 86_400_000).toISOString().slice(0, 10);
    }
    // Approving a hiring round is for HR and the founders: from anyone else it stays as it was, or starts pending.
    if (tracker === "rounds" && !full) fields.approvalStatus = existing?.fields.approvalStatus ?? "Pending";
    // What came back says it came back.
    if (tracker === "assignments" && fields.submission && !fields.receivedDate) fields.receivedDate = today();
    const book = tracker === "pipeline" || tracker === "rounds" ? await loadPipelines(ctx) : null;
    if (book && tracker === "rounds" && fields.pipeline && fields.pipeline !== existing?.fields.pipeline) {
      const theirs = pipelinesFor(book, access, every.filter((r) => seen?.has(r._id)));
      if (!theirs.has(String(fields.pipeline))) throw new Error("Hiring pipeline: pick one from the list");
    }
    if (fields.team && fields.team !== existing?.fields.team) {
      const team = ctx.db.normalizeId("teams", String(fields.team));
      if (!team || !(await ctx.db.get(team))) throw new Error("Team: pick one from the list");
    }
    // A candidate's stage is one of their own pipeline's steps.
    if (book && tracker === "pipeline") {
      const steps = book.stepsOf({ fields });
      const before = String(existing?.fields.stage ?? "");
      const stage = String(fields.stage ?? "");
      const known = steps.some((s) => s.name === stage) || (CLOSING as readonly string[]).includes(stage);
      if (!stage) fields.stage = entryStep(steps).name;
      else if (!known && stage === before && existing) {
        // Moved to a position with other steps: the matching one of theirs.
        fields.stage = fitStage(stage, book.stepsOf(existing), steps);
      } else if (!known) {
        throw new Error(`The ${book.list.get(book.keyOf({ fields }))!.name} pipeline has no step called "${stage}"`);
      }
      if (fields.stage !== before) {
        // The step says who does it and by when, unless this save says otherwise.
        const says = await atStep(ctx, steps.find((s) => s.name === fields.stage));
        for (const [key, value] of Object.entries(says)) if (!(key in args.fields)) fields[key] = value;
      }
      // Whoever gets to the offer, or joins, has a team to join. Cleared by hand after that, it stays cleared.
      const kind = steps.find((s) => s.name === fields.stage)?.kind;
      const arrives = fields.stage !== before || standing(fields) !== (existing ? standing(existing.fields) : "");
      const hired = arrives && ["Active", "Joined"].includes(standing(fields)) && (kind === "offer" || kind === "joining" || standing(fields) === "Joined");
      const to = book.jobOf({ fields });
      // Said in this save, and not just sent along by a form.
      const said = "team" in args.fields && (fields.team ?? "") !== (existing?.fields.team ?? "");
      if (existing && !said && book.teamsOf(to).of !== book.teamsOf(book.jobOf(existing)).of) {
        // Hired for another position from now on.
        const along = book.carried(existing, to);
        if (along) fields.team = along;
        else delete fields.team;
      }
      const round = book.roundTeam({ fields });
      const putIn = fields.reqId !== existing?.fields.reqId;
      if (said && fields.team && !(putIn && round) && book.teamOf({ fields }) !== fields.team) {
        throw new Error("Team: their position does not hire into that one");
      }
      if (putIn) {
        // Put into a team's round by hand, they are that team's.
        if (round) fields.team = round;
      } else if (existing && said && book.teamOf({ fields }) !== book.teamOf(existing)) {
        // Given to another team: out of the old one's round, into the new one's.
        const seated = withTeam({ fields }, book.teamOf({ fields }), book);
        if (!seated.reqId) delete fields.reqId;
        Object.assign(fields, seated);
      }
      const team = hired && !said ? book.teamOf({ fields }) : undefined;
      if (team) fields.team = team;
    }
    const now = Date.now();
    if (!existing) {
      const id = await ctx.db.insert("hrRecords", {
        tracker,
        code: await nextCode(ctx, tracker),
        fields,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      if (tracker === "interviews") await tellInterviewer(ctx, id, {}, fields, user._id);
      if (book) await settleTeams(ctx);
      return id;
    }
    // Values the form does not show (the link back to a website application)
    // ride along untouched.
    const known = new Set((TRACKERS[tracker].fields as readonly Field[]).map((x) => x.key));
    const hidden = Object.fromEntries(Object.entries(existing.fields).filter(([key]) => !known.has(key)));
    // Closed or reopened here by hand: no longer something Positions may undo.
    if (tracker === "pipeline" && standing(existing.fields) !== standing(fields)) delete hidden.closedFrom;
    await ctx.db.patch(existing._id, { fields: { ...hidden, ...fields }, updatedAt: now });
    if (book && tracker === "rounds") await refit(ctx, book);
    // Only what can change whose someone is: a note does not read everyone.
    const matters = ["team", "reqId", "job", "roleOriginal", "stage", "status", "hiringStatus"];
    if (book && matters.some((key) => (existing.fields[key] ?? "") !== (fields[key] ?? ""))) await settleTeams(ctx);
    if (tracker === "interviews") await tellInterviewer(ctx, existing._id, existing.fields, fields, user._id);
    if (tracker === "pipeline") await followCandidate(ctx, access, existing, { ...hidden, ...fields }, user);
    return existing._id;
  },
});

export const remove = mutation({
  args: { id: v.id("hrRecords") },
  handler: async (ctx, { id }) => {
    const access = await requireAccess(ctx);
    const { full } = access;
    const row = await ctx.db.get(id);
    if (!row) return;
    trackerFor(row.tracker, full);
    const others = (await ctx.db.query("hrRecords").collect()).filter((o) => isTracker(o.tracker));
    if (!full && !scopeOf(others, access).has(id)) return;
    // Amounts they do not see are not theirs to delete either.
    if (!access.pay && Object.keys(withoutPay(row.tracker as TrackerKey, row.fields)).length < Object.keys(row.fields).length) {
      throw new Error(`${row.code} holds amounts you do not see. Ask HR to remove it.`);
    }
    // An open position with candidates, or a candidate with interviews, stays: deleting
    // it would leave those rows pointing at nothing.
    const user = others.find((o) => Object.values(o.fields).includes(id));
    if (user) {
      const hrOnly = isTracker(user.tracker) && TRACKERS[user.tracker].hrOnly;
      // A delegate is not told about rows they cannot see.
      if (hrOnly && !full) throw new Error(`${row.code} is linked to an HR record. Ask HR to remove it.`);
      const label = isTracker(user.tracker) ? TRACKERS[user.tracker].label : user.tracker;
      throw new Error(`${row.code} is still used by ${user.code} in ${label}. Remove or re-point that first.`);
    }
    // Tasks and briefs outlive it; they just stop pointing here.
    for (const task of await ctx.db.query("tasks").withIndex("by_candidate", (q) => q.eq("candidateId", id)).collect()) {
      await ctx.db.patch(task._id, { candidateId: undefined });
    }
    for (const brief of await ctx.db.query("briefs").withIndex("by_type_brand", (q) => q.eq("briefType", "recruitment")).collect()) {
      if (brief.hiringRoundId === id) await ctx.db.patch(brief._id, { hiringRoundId: undefined });
    }
    await ctx.db.delete(id);
    if (row.tracker === "rounds") await ctx.db.insert("hrRecords", { tracker: `${GONE}rounds`, code: row.code, fields: {}, createdAt: row.createdAt, updatedAt: Date.now() });
  },
});

/** Put website applicants into one open position, as candidates. */
export const addApplicants = mutation({
  args: { candidateIds: v.array(v.id("recruitCandidates")), roundId: v.id("hrRecords") },
  handler: async (ctx, { candidateIds, roundId }) => {
    const access = await requireAccess(ctx);
    const { user } = access;
    const round = await ctx.db.get(roundId);
    if (!round || round.tracker !== "rounds" || (!access.full && !inScope(round, access, new Set()))) {
      throw new Error("Hiring round not found");
    }
    const applicants = [];
    for (const id of candidateIds) {
      const c = await ctx.db.get(id);
      if (!c) continue;
      if (!mayRecruitFor(access, c.jobSourceId)) throw new Error("You do not have access to this position");
      applicants.push(c);
    }
    const added = await addToCandidates(ctx, access, applicants, round);
    await settleTeams(ctx);
    // The application itself moves to Shortlisted, unless HR already moved it on.
    const now = Date.now();
    for (const c of applicants) {
      const from = c.stage ?? "applied";
      if (!["applied", "on_hold", "rejected"].includes(from)) continue;
      await ctx.db.patch(c._id, { stage: "screened", stageUpdatedAt: now });
      await ctx.db.insert("recruitActivity", {
        candidateId: c._id,
        kind: "stage",
        body: `Added to hiring round ${round.code}`,
        fromStage: from,
        toStage: "screened",
        authorId: user._id,
        authorName: user.name ?? user.email ?? "HR",
        createdAt: now,
      });
    }
    return { added, skipped: candidateIds.length - added };
  },
});

/** Put everyone already shortlisted for an open position's role, and not yet in one, into it. */
export const placeShortlisted = mutation({
  args: { roundId: v.id("hrRecords") },
  handler: async (ctx, { roundId }) => {
    const access = await requireAccess(ctx);
    const round = await ctx.db.get(roundId);
    if (!round || round.tracker !== "rounds" || (!access.full && !inScope(round, access, new Set()))) {
      throw new Error("Hiring round not found");
    }
    const placed = await placeInRound(ctx, access, round);
    await settleTeams(ctx);
    return { placed };
  },
});

/** Bring everyone already marked Shortlisted onto Candidates. Run by hand; a second run adds nobody twice. */
export const backfillShortlisted = internalMutation({
  args: {},
  handler: async (ctx) => {
    const shortlisted = (await ctx.db.query("recruitCandidates").collect()).filter((c) => c.stage === "screened");
    const added = await addToCandidates(ctx, { full: true, jobs: new Set() }, shortlisted);
    return { shortlisted: shortlisted.length, added };
  },
});

/* ── Interviews: telling the interviewer, and their feedback ── */

const text = (fields: Fields, key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : "");

/** 2026-11-24 + 15:30 -> "Tue, 24 Nov, 3:30 pm" (the trackers keep India time). */
function whenText(date: string, time: string) {
  const d = new Date(`${date}T${time || "00:00"}:00Z`);
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return time ? `${day}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}` : day;
}

/**
 * A planned interview that is new, or whose interviewer, date or time changed,
 * goes to its interviewer: a notification now, and a calendar invite by email.
 */
async function tellInterviewer(
  ctx: MutationCtx,
  id: Id<"hrRecords">,
  before: Fields,
  after: Fields,
  by: Id<"users">
) {
  const interviewer = ctx.db.normalizeId("users", text(after, "interviewer"));
  if (!interviewer || text(after, "status") !== "Planned" || !text(after, "date")) return;
  if (["interviewer", "date", "time"].every((key) => text(before, key) === text(after, key))) return;
  const candidateId = ctx.db.normalizeId("hrRecords", text(after, "candidateId"));
  const candidate = candidateId ? await ctx.db.get(candidateId) : null;
  await ctx.db.insert("notifications", {
    recipientId: interviewer,
    type: "interview",
    title: `Interview: ${candidate ? text(candidate.fields, "name") : "a candidate"}${text(after, "round") ? ` (${text(after, "round")})` : ""}`,
    message: `${whenText(text(after, "date"), text(after, "time"))}${text(after, "mode") ? `, ${text(after, "mode")}` : ""}. It is on your dashboard under Your interviews, where you also give your feedback afterwards.`,
    triggeredBy: by,
    read: false,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.hrOps.sendInterviewInvite, { id });
}

/** What the interviewer needs about one interview. Null when it is not theirs to see. */
async function interviewCard(ctx: QueryCtx, row: { _id: Id<"hrRecords">; code: string; fields: Fields }) {
  const candidateId = ctx.db.normalizeId("hrRecords", text(row.fields, "candidateId"));
  const candidate = candidateId ? await ctx.db.get(candidateId) : null;
  const roundId = candidate ? ctx.db.normalizeId("hrRecords", text(candidate.fields, "reqId")) : null;
  const round = roundId ? await ctx.db.get(roundId) : null;
  return {
    _id: row._id,
    code: row.code,
    candidate: candidate ? text(candidate.fields, "name") : "A candidate",
    role: round ? text(round.fields, "role") : candidate ? text(candidate.fields, "roleOriginal") : "",
    resume: candidate ? text(candidate.fields, "resume") : "",
    round: text(row.fields, "round"),
    mode: text(row.fields, "mode"),
    date: text(row.fields, "date"),
    time: text(row.fields, "time"),
    status: text(row.fields, "status"),
    feedbackDue: text(row.fields, "feedbackDue"),
    notes: text(row.fields, "notes"),
  };
}

/** My interviews that still need me: coming up, or done and waiting for my feedback.
 *  For any staff member: an interviewer does not need recruitment access. */
export const myInterviews = query({
  args: {},
  handler: async (ctx) => {
    const me = await getAuthUserId(ctx);
    if (!me) return [];
    const rows = (
      await ctx.db
        .query("hrRecords")
        .withIndex("by_tracker", (q) => q.eq("tracker", "interviews"))
        .collect()
    ).filter(
      (r) =>
        r.fields.interviewer === me &&
        !r.fields.feedbackReceived &&
        ["Planned", "Completed"].includes(text(r.fields, "status"))
    );
    const cards = await Promise.all(rows.map((r) => interviewCard(ctx, r)));
    return cards.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  },
});

const VERDICT = { Proceed: "Good fit", Hold: "Hold", Reject: "Not a fit" } as const;
const recommendation = v.union(v.literal("Proceed"), v.literal("Reject"), v.literal("Hold"));
/** What was written, checked. */
function written(feedback: string) {
  const text = feedback.trim();
  if (!text) throw new Error("Write a line or two of feedback");
  if (text.length > 5000) throw new Error("Feedback is too long (5000 characters at most)");
  return text;
}

/** Feedback is for HR to act on: the candidate's row says the latest, and HR is told (once, not for a correction). */
async function feedbackGiven(ctx: MutationCtx, me: Doc<"users">, candidateId: unknown, round: string, verdict: keyof typeof VERDICT, tell = true) {
  const id = ctx.db.normalizeId("hrRecords", String(candidateId ?? ""));
  const candidate = id ? await ctx.db.get(id) : null;
  if (!candidate || candidate.tracker !== "pipeline") return;
  const by = me.name ?? me.email ?? "The interviewer";
  await ctx.db.patch(candidate._id, {
    // Short enough to stay a valid value of its field, whatever the round is called.
    fields: { ...candidate.fields, latestOutcome: [VERDICT[verdict], round.slice(0, 60), by.slice(0, 60)].filter(Boolean).join(" · "), lastUpdate: today() },
    updatedAt: Date.now(),
  });
  if (!tell) return;
  // Whoever in HR looks after them. Looked after by nobody in HR (whoever shortlisted them, say), it is HR's, or the founders'.
  const users = await ctx.db.query("users").collect();
  const runs = (u: Doc<"users">) => u.isHR === true || u.isSuperAdmin === true;
  // Writing it themselves, it is the rest of HR who should hear.
  const owner = users.find((u) => u._id === text(candidate.fields, "hrOwner") && runs(u) && u._id !== me._id);
  const hr = users.filter((u) => u.isHR === true);
  const told = owner ? [owner] : hr.length ? hr : users.filter(runs);
  for (const u of told.filter((u) => u._id !== me._id)) {
    await ctx.db.insert("notifications", {
      recipientId: u._id,
      type: "interview",
      title: `${VERDICT[verdict]}: ${text(candidate.fields, "name") || "a candidate"}`,
      message: `${by} gave feedback${round ? ` after ${round.slice(0, 60)}` : ""}. Open them under Candidates to decide what happens next.`,
      triggeredBy: me._id,
      read: false,
      createdAt: Date.now(),
    });
  }
}

/**
 * Feedback on someone shortlisted, from whoever is hiring for their position:
 * given from the applicant, with or without an interview on the calendar. It
 * goes onto their own interview that is waiting for it (the earliest that has
 * come), corrects what they wrote earlier today for the same round, and
 * otherwise makes the interview.
 */
export const feedbackOn = mutation({
  args: { applicantId: v.id("recruitCandidates"), recommendation, feedback: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx);
    const applicant = await ctx.db.get(args.applicantId);
    if (!applicant || !mayRecruitFor(access, applicant.jobSourceId)) throw new Error("Applicant not found");
    const note = written(args.feedback);
    const me = access.user._id;
    // Only someone still in play, and theirs to work on.
    const live = [];
    for (const r of await rowsOf(ctx, "pipeline")) {
      if (r.fields.applicantId === args.applicantId && standing(r.fields) === "Active" && (access.full || (await myCandidate(ctx, r._id, access)))) live.push(r);
    }
    if (live.length === 0) throw new Error("Shortlist them first. Feedback goes on someone who is shortlisted.");
    const ids = new Set<string>(live.map((r) => r._id));
    const mine = (await rowsOf(ctx, "interviews")).filter((r) => ids.has(text(r.fields, "candidateId")) && r.fields.interviewer === me);
    // An interview of theirs that has come and still waits for it, earliest first. One still ahead is not it.
    const awaited = mine
      .filter((r) => !r.fields.feedbackReceived && ["Planned", "Completed"].includes(text(r.fields, "status")) && text(r.fields, "date") <= today())
      .sort((a, b) => `${text(a.fields, "date")} ${text(a.fields, "time")}`.localeCompare(`${text(b.fields, "date")} ${text(b.fields, "time")}`))[0];
    // In two rounds at once, the candidate is the one their interview is in, else the newest.
    // With none waiting, saying it again the same day corrects what they last said, whichever round that was for.
    const waiting = awaited;
    const earlier = waiting ? undefined : mine.filter((r) => r.fields.feedbackReceived === today()).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const candidate = live.find((r) => r._id === (earlier ?? waiting)?.fields.candidateId) ?? live.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const round = earlier || waiting ? text((earlier ?? waiting)!.fields, "round") : text(candidate.fields, "stage");
    const said = { status: "Completed", recommendation: args.recommendation, feedback: note, feedbackReceived: today(), lastUpdate: today() };
    const now = Date.now();
    const onto = waiting ?? earlier;
    if (onto) await ctx.db.patch(onto._id, { fields: { ...onto.fields, ...said }, updatedAt: now });
    else {
      await ctx.db.insert("hrRecords", {
        tracker: "interviews",
        code: await nextCode(ctx, "interviews"),
        fields: { candidateId: candidate._id, round, interviewer: me, date: today(), ...said },
        createdBy: me,
        createdAt: now,
        updatedAt: now,
      });
    }
    await feedbackGiven(ctx, access.user, candidate._id, round, args.recommendation, !earlier);
  },
});

/** The interviewer's written feedback. It marks the interview completed. */
export const giveFeedback = mutation({
  args: {
    id: v.id("hrRecords"),
    recommendation,
    feedback: v.string(),
  },
  handler: async (ctx, { id, recommendation, feedback }) => {
    const me = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!me || !row || row.tracker !== "interviews" || row.fields.interviewer !== me) {
      throw new Error("This interview is not yours");
    }
    if (row.fields.feedbackReceived || !["Planned", "Completed"].includes(text(row.fields, "status"))) {
      throw new Error("Feedback is closed for this interview. Ask HR if it needs changing.");
    }
    const note = written(feedback);
    await ctx.db.patch(id, {
      fields: {
        ...row.fields,
        status: "Completed",
        recommendation,
        feedback: note,
        feedbackReceived: today(),
        lastUpdate: today(),
      },
      updatedAt: Date.now(),
    });
    const user = await ctx.db.get(me);
    if (user) await feedbackGiven(ctx, user, row.fields.candidateId, text(row.fields, "round"), recommendation);
  },
});

export const _inviteContext = internalQuery({
  args: { id: v.id("hrRecords") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.tracker !== "interviews") return null;
    const interviewerId = ctx.db.normalizeId("users", text(row.fields, "interviewer"));
    const interviewer = interviewerId ? await ctx.db.get(interviewerId) : null;
    if (!interviewer?.email) return null;
    return {
      ...(await interviewCard(ctx, row)),
      email: interviewer.email,
      name: interviewer.name ?? interviewer.email,
      updatedAt: row.updatedAt,
    };
  },
});

const pad = (n: number) => String(n).padStart(2, "0");
const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Email the interviewer a calendar invite (an .ics the mail client offers to add). */
export const sendInterviewInvite = internalAction({
  args: { id: v.id("hrRecords") },
  handler: async (ctx, { id }) => {
    const token = process.env.ZEPTO_API_TOKEN;
    const from = process.env.ZEPTO_FROM_EMAIL ?? "hr@ecultify.com";
    const it = await ctx.runQuery(internal.hrOps._inviteContext, { id });
    if (!token || !it || !it.date) return;

    const stamp = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    // The trackers keep India time; a calendar wants UTC.
    const start = new Date(Date.parse(`${it.date}T${it.time || "00:00"}:00Z`) - 5.5 * 3_600_000);
    const day = it.date.replace(/-/g, "");
    const title = `Interview: ${it.candidate}${it.role ? ` for ${it.role}` : ""}`;
    const details = [it.round, it.mode, it.resume && `Resume: ${it.resume}`, "Give your feedback from your tasktracker dashboard."]
      .filter(Boolean)
      .join("\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Ecultify//Tasktracker//EN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      `UID:${id}@tasktracker.ecultify.com`,
      `SEQUENCE:${Math.floor(it.updatedAt / 1000)}`,
      `DTSTAMP:${stamp(new Date())}`,
      // 45 minutes when a time is set; otherwise the whole day.
      ...(it.time
        ? [`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 45 * 60_000))}`]
        : [`DTSTART;VALUE=DATE:${day}`]),
      `SUMMARY:${icsText(title)}`,
      `DESCRIPTION:${icsText(details)}`,
      `ORGANIZER;CN=Ecultify HR:mailto:${from}`,
      `ATTENDEE;CN=${icsText(it.name)};RSVP=TRUE:mailto:${it.email}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const res = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        from: { address: from, name: process.env.ZEPTO_FROM_NAME ?? "HR Team" },
        to: [{ email_address: { address: it.email, name: it.name } }],
        subject: `${title}, ${whenText(it.date, it.time)}`,
        textbody: `${title}\n${whenText(it.date, it.time)}${it.mode ? `, ${it.mode}` : ""}\n\n${details}\n\nOpen the attached invite to add it to your calendar.`,
        attachments: [
          {
            name: "interview.ics",
            mime_type: "text/calendar",
            content: btoa(String.fromCharCode(...new TextEncoder().encode(ics))),
          },
        ],
      }),
    });
    // The notification already reached them in the app; a failed email is logged, not retried.
    if (!res.ok) console.error("interview invite failed", res.status, (await res.text()).slice(0, 300));
  },
});

/* ── Appointment letter ───────────────────────────────────── */

/** What the appointment letter needs from an offer, or what is still missing.
 *  Null when the caller may not see the offer. */
export const letterData = query({
  args: { offerId: v.id("hrRecords") },
  handler: async (ctx, { offerId }) => {
    const access = await recruitAccess(ctx);
    const offer = await ctx.db.get(offerId);
    // The letter is about pay.
    if (!access?.pay || !offer || offer.tracker !== "offers") return null;
    if (!access.full && !scopeOf(await ctx.db.query("hrRecords").collect(), access).has(offerId)) return null;
    const candidateId = ctx.db.normalizeId("hrRecords", text(offer.fields, "candidateId"));
    const candidate = candidateId ? await ctx.db.get(candidateId) : null;
    const num = (key: string) => (typeof offer.fields[key] === "number" ? (offer.fields[key] as number) : null);
    const confirmed = num("approvedCtc");
    const probation = num("probationCtc");
    const data = {
      name: candidate ? text(candidate.fields, "name") : "",
      designation: text(offer.fields, "designation"),
      reportsTo: text(offer.fields, "reportsTo"),
      joiningDate: text(offer.fields, "plannedJoin"),
      confirmedLpa: confirmed,
      // Only a real, lower figure counts as a separate probation salary.
      probationLpa: probation && confirmed && probation < confirmed ? probation : null,
      probationMonths: num("probationMonths"),
    };
    const missing = [
      !data.name && "the candidate",
      !data.designation && "Designation on the letter",
      !data.reportsTo && "Reports to",
      !data.joiningDate && "Planned join date",
      !data.confirmedLpa && "Approved CTC",
      // A letter on the company's letterhead waits for the offer to be approved.
      !["Approved", "Not Required"].includes(text(offer.fields, "approvalStatus")) && "Approval status (it must be Approved)",
    ].filter((x): x is string => !!x);
    return { code: offer.code, data, missing };
  },
});

/* ── Who gets in ───────────────────────────────────────────── */

export const accessList = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access?.full) return null;
    // Positions are handed out by parent role; sub-roles come with their parent.
    const positions = livePositions(await ctx.db.query("recruitJobs").collect())
      .filter((j) => j.parentSourceId == null)
      .map((j) => ({ id: j.sourceId, name: j.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const people = (await ctx.db.query("users").collect())
      .filter((u) => u.role !== "client" && u.isReviewer !== true)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? u.email ?? "Unnamed",
        email: u.email ?? "",
        designation: u.designation ?? "",
        role: u.role ?? "employee",
        // HR and super admins always see every position.
        builtIn: u.isHR === true || u.isSuperAdmin === true,
        jobs: u.recruitJobs ?? [],
        pay: u.recruitPay === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { positions, people };
  },
});

export const setRecruitAccess = mutation({
  /** Give or take away one position. The list is worked out here, from what is
   *  stored now, so two quick clicks cannot overwrite each other. Taking away
   *  the last one takes recruitment away. */
  args: { userId: v.id("users"), jobSourceId: v.number(), allowed: v.boolean() },
  handler: async (ctx, { userId, jobSourceId, allowed }) => {
    const { full } = await requireAccess(ctx);
    if (!full) throw new Error("Only HR and super admins manage recruitment access");
    const target = await ctx.db.get(userId);
    if (!target || target.role === "client" || target.isReviewer === true) throw new Error("Pick a team member");
    const known = new Set(livePositions(await ctx.db.query("recruitJobs").collect()).map((j) => j.sourceId));
    if (allowed && !known.has(jobSourceId)) throw new Error("That position no longer exists");
    const jobs = (target.recruitJobs ?? []).filter((id) => id !== jobSourceId && known.has(id));
    if (allowed) jobs.push(jobSourceId);
    // Without recruitment there is no pay to see; given back later, it starts hidden again.
    await ctx.db.patch(userId, jobs.length ? { recruitJobs: jobs } : { recruitJobs: undefined, recruitPay: undefined });
  },
});

/** Whether someone sees the current and expected CTC of the applicants they work on. */
export const setRecruitPay = mutation({
  args: { userId: v.id("users"), allowed: v.boolean() },
  handler: async (ctx, { userId, allowed }) => {
    const { full } = await requireAccess(ctx);
    if (!full) throw new Error("Only HR and super admins manage recruitment access");
    const target = await ctx.db.get(userId);
    if (!target || target.role === "client" || target.isReviewer === true || !target.recruitJobs?.length) {
      throw new Error("Give them a position first");
    }
    await ctx.db.patch(userId, { recruitPay: allowed || undefined });
  },
});

/* ── Clearing a list ───────────────────────────────────────── */

/**
 * Empty some trackers without losing them: their rows move under "archived:",
 * which no screen reads. Run by hand; restoreArchived puts them back.
 */
export const archiveTrackers = internalMutation({
  args: { trackers: v.array(v.string()) },
  handler: async (ctx, { trackers }) => {
    const gone = new Set<string>();
    for (const key of trackers) {
      if (!isTracker(key)) throw new Error(`Unknown tracker ${key}`);
      for (const row of await rowsOf(ctx, key)) gone.add(row._id);
    }
    // Nothing that stays may be left pointing at a row that goes.
    for (const row of await ctx.db.query("hrRecords").collect()) {
      if (gone.has(row._id) || !isTracker(row.tracker)) continue;
      if (Object.values(row.fields).some((value) => typeof value === "string" && gone.has(value))) {
        throw new Error(`${row.code} in ${TRACKERS[row.tracker].label} points at a row that would be cleared`);
      }
    }
    const moved: Record<string, number> = {};
    for (const key of trackers) {
      const rows = await rowsOf(ctx, key);
      for (const row of rows) await ctx.db.patch(row._id, { tracker: ARCHIVED + key });
      moved[key] = rows.length;
    }
    return moved;
  },
});

export const restoreArchived = internalMutation({
  args: { trackers: v.array(v.string()) },
  handler: async (ctx, { trackers }) => {
    const back = [];
    for (const key of trackers) {
      if (!isTracker(key)) throw new Error(`Unknown tracker ${key}`);
      for (const row of await rowsOf(ctx, ARCHIVED + key)) back.push({ key, row });
    }
    const ids = new Set<string>(back.map(({ row }) => row._id));
    for (const { key, row } of back) {
      const fields = { ...row.fields };
      for (const field of TRACKERS[key].fields as readonly Field[]) {
        const id = field.type === "ref" && typeof fields[field.key] === "string" && ctx.db.normalizeId("hrRecords", fields[field.key] as string);
        if (!id) continue;
        const target = await ctx.db.get(id);
        // What it pointed at may have been deleted while it was away.
        if (!target) delete fields[field.key];
        else if (target.tracker !== field.ref && !ids.has(id)) throw new Error(`${row.code}: restore ${field.ref} with it`);
      }
      await ctx.db.patch(row._id, { tracker: key, fields });
    }
    return back.length;
  },
});

/* ── Import from the workbook ──────────────────────────────── */

/**
 * Load rows exported from the tracker workbook (scripts/import-hr-tracker.py).
 * A `ref` arrives as the other row's code (REQ-26-012) and is turned into its
 * id here. A row whose code already exists is left alone, so a second run adds
 * nothing.
 */
export const importRows = internalMutation({
  args: { rows: v.array(v.object({ tracker: v.string(), code: v.string(), fields: fieldsValidator })) },
  handler: async (ctx, { rows }) => {
    const existing = await ctx.db.query("hrRecords").collect();
    const idOf = new Map<string, Id<"hrRecords">>(existing.map((r) => [`${r.tracker}:${r.code}`, r._id]));
    // A row that was cleared out of its list is not brought back by an import.
    const cleared = new Set(existing.filter((r) => r.tracker.startsWith(ARCHIVED)).map((r) => `${r.tracker.slice(ARCHIVED.length)}:${r.code}`));
    let added = 0;
    for (const row of rows) {
      if (!isTracker(row.tracker)) throw new Error(`Unknown tracker ${row.tracker}`);
      if (idOf.has(`${row.tracker}:${row.code}`) || cleared.has(`${row.tracker}:${row.code}`)) continue;
      const input: Record<string, string | number | null> = { ...row.fields };
      for (const field of TRACKERS[row.tracker].fields as readonly Field[]) {
        if (field.type !== "ref" || typeof input[field.key] !== "string") continue;
        const target = idOf.get(`${field.ref}:${input[field.key]}`);
        if (!target) throw new Error(`${row.code}: ${field.label} points at ${input[field.key]}, which is not there`);
        input[field.key] = target;
      }
      const now = Date.now();
      const id = await ctx.db.insert("hrRecords", {
        tracker: row.tracker,
        code: row.code,
        fields: cleanFields(row.tracker, input),
        createdAt: now,
        updatedAt: now,
      });
      idOf.set(`${row.tracker}:${row.code}`, id);
      added++;
    }
    return { added, alreadyThere: rows.length - added };
  },
});
