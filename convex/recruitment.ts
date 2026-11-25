import {
  mutation,
  query,
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mayRecruitFor, myCandidate, recruitAccess, type RecruitAccess } from "./lib/guards";
import { ARCHIVED, addToCandidates, followApplication, rowsOf, settleTeams, standing, today, withTeam } from "./lib/candidates";
import { livePositions, loadPipelines } from "./lib/pipelines";
import { matches } from "./lib/applicantMatch";
import { webAddress } from "./lib/links";
import { mailProblem, stopsEverySend } from "./lib/mail";

// ── RECRUITMENT ────────────────────────────────────────────────
// Imported from the cultform JobData MySQL app. Rows join on `sourceId`
// (the original MySQL primary key) rather than Convex Ids, so the public
// application form can dual-write into both systems and stay reconcilable.
//
// Access: HR and super-admins see every position. Anyone they have given
// positions to (users.recruitJobs, see hrOps.setRecruitAccess) sees those
// positions only. Everyone else stays out: salaries, phone numbers and CVs
// are not general reading. Every function below checks the position.

const stageValidator = v.union(
  v.literal("applied"),
  v.literal("screened"),
  v.literal("interview"),
  v.literal("offer"),
  v.literal("hired"),
  v.literal("rejected"),
  v.literal("on_hold")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("non_active"),
  v.literal("rejected"),
  v.literal("on_hold"),
  v.literal("shortlisted")
);

/** The funnel stage a cultform status stands for. "Screened" is what the UI
 *  labels Shortlisted. One row was ever non_active with any meaning, so it is
 *  parked rather than read as a rejection. */
const STAGE_FROM_STATUS = {
  active: "applied",
  shortlisted: "screened",
  rejected: "rejected",
  on_hold: "on_hold",
  non_active: "on_hold",
} as const;

type Ctx = QueryCtx | MutationCtx;

/** An applicant as this person may see them. Every query that hands out applicants goes through here. */
const shown = (access: RecruitAccess, c: Doc<"recruitCandidates">): Doc<"recruitCandidates"> =>
  access.pay ? c : { ...c, currentCtc: "", expectedCtc: "" };

/** A position's name, saying so when it has been removed. */
const nameOf = (j: Doc<"recruitJobs"> | undefined) => (j ? (j.removedAt ? `${j.name} (removed)` : j.name) : "Unknown");

async function requireRecruiter(ctx: Ctx): Promise<RecruitAccess> {
  const access = await recruitAccess(ctx);
  if (!access) throw new Error("Recruitment is HR only");
  return access;
}

/** Roles, the website switch and anything that spans positions: HR and super admins. */
async function requireFull(ctx: Ctx): Promise<RecruitAccess> {
  const access = await requireRecruiter(ctx);
  if (!access.full) throw new Error("Only HR and super admins can do this");
  return access;
}

function requireJob(access: RecruitAccess, jobSourceId: number) {
  if (!mayRecruitFor(access, jobSourceId)) throw new Error("You do not have access to this position");
}

/** Every one of these candidates must sit in a position the caller may work on. */
async function requireCandidates(ctx: Ctx, access: RecruitAccess, ids: Id<"recruitCandidates">[]) {
  if (access.full) return;
  for (const id of ids) {
    const c = await ctx.db.get(id);
    if (c) requireJob(access, c.jobSourceId);
  }
}

const RESUME_KEY = /^resumes\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}\.pdf$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** Plain text only: these values are later dropped into HTML emails, some
 *  of them inside an attribute, so quotes go too. */
const clean = (value: string | undefined, max: number) =>
  (value ?? "").replace(/[<>"\u0000-\u001f]/g, " ").trim().slice(0, max);

/**
 * A link someone typed (a resume on Drive, a portfolio, a LinkedIn page), kept
 * only if it is an ordinary web address. "linkedin.com/in/x" gets its https://.
 * Anything else is refused, or dropped when `strict` is off (the public form
 * should not fail an application over a badly typed link).
 */
function safeLink(value: string | undefined, label: string, strict = true): string {
  const text = clean(value, 500);
  if (!text) return "";
  const url = webAddress(text);
  if (!url && strict) throw new Error(`${label}: paste a full web address`);
  return url;
}

/** Jobs with their live candidate counts, parents before their sub-positions. */
/**
 * The position someone is for. Applications are filed under the main position,
 * with a role under it as text: this gives the role itself where they named one,
 * so a role counts, lists and filters like any position.
 */
function positionOfApplicant(live: readonly Doc<"recruitJobs">[]) {
  const roles = new Map(live.filter((j) => j.parentSourceId != null).map((j) => [`${j.parentSourceId} ${j.name.trim().toLowerCase()}`, j.sourceId]));
  return (c: { jobSourceId: number; position?: string }) => roles.get(`${c.jobSourceId} ${(c.position ?? "").trim().toLowerCase()}`) ?? c.jobSourceId;
}

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const live = livePositions(await ctx.db.query("recruitJobs").collect());
    const jobs = live.filter((j) => mayRecruitFor(access, j.sourceId));
    const candidates = await ctx.db.query("recruitCandidates").collect();
    const at = positionOfApplicant(live);

    const none = () => ({ total: 0, fresh: 0, shortlisted: 0, onHold: 0, rejected: 0, lastApplied: 0 });
    const counts = new Map<number, ReturnType<typeof none>>();
    for (const c of candidates) {
      // Each person once, under what they are for: a role's people are the role's, not its position's as well.
      const acc = counts.get(at(c)) ?? none();
      const st = c.stage ?? "applied";
      acc.total++;
      // MUST match positionStatus in src/lib/recruitStages.ts, which the position page filters by.
      if (st === "applied") acc.fresh++;
      else if (st === "on_hold") acc.onHold++;
      else if (st === "rejected") acc.rejected++;
      else acc.shortlisted++;
      acc.lastApplied = Math.max(acc.lastApplied, c.createdAt ?? 0);
      counts.set(at(c), acc);
    }

    const withCounts = jobs.map((j) => ({
      ...j,
      ...(counts.get(j.sourceId) ?? none()),
      // For tabs opened before the four counts above replaced these.
      inPlay: (counts.get(j.sourceId)?.fresh ?? 0) + (counts.get(j.sourceId)?.shortlisted ?? 0),
      moving: counts.get(j.sourceId)?.shortlisted ?? 0,
      parentName:
        j.parentSourceId != null
          ? jobs.find((p) => p.sourceId === j.parentSourceId)?.name ?? null
          : null,
    }));

    // Sub-positions sort directly under their parent so the grouping reads.
    withCounts.sort((a, b) => {
      const ak = a.parentSourceId ?? a.sourceId;
      const bk = b.parentSourceId ?? b.sourceId;
      if (ak !== bk) return ak - bk;
      return (a.parentSourceId ?? 0) - (b.parentSourceId ?? 0);
    });
    return withCounts;
  },
});

/** Headline numbers for the overview. */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return null;
    const mine = <T extends { jobSourceId: number }>(rows: T[]) => rows.filter((r) => mayRecruitFor(access, r.jobSourceId));
    const jobs = livePositions(await ctx.db.query("recruitJobs").collect()).filter((j) => mayRecruitFor(access, j.sourceId));
    // People left behind in a removed position are not waiting for anyone.
    const here = new Set(jobs.map((j) => j.sourceId));
    const candidates = mine(await ctx.db.query("recruitCandidates").collect()).filter((c) => here.has(c.jobSourceId));
    const logs = mine(await ctx.db.query("recruitEmailLogs").collect());

    const byStatus: Record<string, number> = {
      active: 0, non_active: 0, rejected: 0, on_hold: 0,
    };
    for (const c of candidates) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

    const byStage: Record<string, number> = {
      applied: 0, screened: 0, interview: 0, offer: 0, hired: 0, rejected: 0, on_hold: 0,
    };
    for (const c of candidates) {
      const st = c.stage ?? "applied";
      byStage[st] = (byStage[st] ?? 0) + 1;
    }

    // "This month" only counts dated rows — ~1,100 legacy imports have no
    // createdAt, so this is deliberately a floor, not a total.
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = candidates.filter((c) => c.createdAt != null && c.createdAt > monthAgo).length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = candidates.filter((c) => c.createdAt != null && c.createdAt > weekAgo).length;

    return {
      totalCandidates: candidates.length,
      totalJobs: jobs.length,
      byStatus,
      byStage,
      recent,
      thisWeek,
      undated: candidates.filter((c) => c.createdAt == null).length,
      emailsSent: logs.filter((l) => l.status === "sent").length,
      emailsFailed: logs.filter((l) => l.status === "failed").length,
    };
  },
});

/** Candidates for one job, newest first. Undated legacy rows fall to the end. */
export const listCandidates = query({
  args: {
    jobSourceId: v.number(),
    // The page filters what it has. Tabs opened before that still ask for this,
    // and act on everything they are given, so it is still answered.
    stage: v.optional(stageValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { jobSourceId, stage, search }) => {
    const access = await recruitAccess(ctx);
    if (!access || !mayRecruitFor(access, jobSourceId)) return [];
    // A role's people are filed under its position; a position's own list leaves its roles' people to them.
    const live = livePositions(await ctx.db.query("recruitJobs").collect());
    const at = positionOfApplicant(live);
    const filedUnder = live.find((j) => j.sourceId === jobSourceId)?.parentSourceId ?? jobSourceId;
    const under = (id: number) => ctx.db.query("recruitCandidates").withIndex("by_job", (q) => q.eq("jobSourceId", id)).collect();
    // Also whoever is filed under the role's own number (the old system's import kept those as they were).
    const rows = [...(await under(filedUnder)), ...(filedUnder === jobSourceId ? [] : await under(jobSourceId))].filter((r) => at(r) === jobSourceId);
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return rows.filter((r) => (!stage || (r.stage ?? "applied") === stage) && (!search || matches(r, search))).map((r) => shown(access, r));
  },
});

/** The newest applications across every position the caller works on. */
export const recentApplicants = query({
  args: {
    limit: v.optional(v.number()),
    /** One of the Positions statuses (src/lib/recruitStages.ts), or all of them. */
    status: v.optional(v.union(v.literal("new"), v.literal("shortlisted"), v.literal("on_hold"), v.literal("rejected"))),
    jobSourceId: v.optional(v.number()),
  },
  handler: async (ctx, { limit, status, jobSourceId }) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    // Who was left in a removed position is found by searching, not listed as new.
    const live = livePositions(await ctx.db.query("recruitJobs").collect());
    const jobs = new Map(live.map((j) => [j.sourceId, j.name]));
    const at = positionOfApplicant(live);
    const statusOf = (stage: string) =>
      stage === "applied" ? "new" : stage === "on_hold" || stage === "rejected" ? stage : "shortlisted";
    return (await ctx.db.query("recruitCandidates").collect())
      .filter(
        (r) =>
          mayRecruitFor(access, r.jobSourceId) &&
          jobs.has(r.jobSourceId) &&
          (jobSourceId === undefined || at(r) === jobSourceId) &&
          (!status || statusOf(r.stage ?? "applied") === status)
      )
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, Math.min(limit ?? 10, 300))
      // The role they are for, where they named one: what the list says and filters by.
      .map((r) => ({ ...shown(access, r), jobName: jobs.get(at(r))!, positionId: at(r) }));
  },
});

/** These applicants as they are now, for a list that keeps who was just acted on in sight. Whoever is deleted, or not the caller's, is left out. */
export const applicantsById = query({
  args: { ids: v.array(v.id("recruitCandidates")) },
  handler: async (ctx, { ids }) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const jobs = await ctx.db.query("recruitJobs").collect();
    const at = positionOfApplicant(livePositions(jobs));
    const rows = await Promise.all(ids.slice(0, 300).map((id) => ctx.db.get(id)));
    return rows
      .filter((r) => r !== null)
      .filter((r) => mayRecruitFor(access, r.jobSourceId))
      .map((r) => ({ ...shown(access, r), jobName: nameOf(jobs.find((j) => j.sourceId === at(r))), positionId: at(r) }));
  },
});

/** Global candidate search across every job. */
export const searchCandidates = query({
  args: { search: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { search, limit }) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const s = search.trim();
    if (s.length < 2) return [];
    const jobs = await ctx.db.query("recruitJobs").collect();
    const at = positionOfApplicant(livePositions(jobs));
    const rows = await ctx.db.query("recruitCandidates").collect();
    return rows
      .filter((r) => mayRecruitFor(access, r.jobSourceId) && matches(r, s))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, limit ?? 20)
      .map((r) => ({
        ...shown(access, r),
        jobName: nameOf(jobs.find((j) => j.sourceId === at(r))),
        positionId: at(r),
      }));
  },
});

export const listTemplates = query({
  args: { jobSourceId: v.optional(v.number()) },
  handler: async (ctx, { jobSourceId }) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const jobs = await ctx.db.query("recruitJobs").collect();
    const rows = (
      jobSourceId != null
        ? await ctx.db
            .query("recruitTemplates")
            .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
            .collect()
        : await ctx.db.query("recruitTemplates").collect()
    ).filter((t) => mayRecruitFor(access, t.jobSourceId));
    return rows.map((t) => ({
      ...t,
      jobName: jobs.find((j) => j.sourceId === t.jobSourceId)?.name ?? "Unknown",
    }));
  },
});

/** Recent send history — the whole log is 1,100+ rows, so this is capped. */
export const listEmailLogs = query({
  args: { jobSourceId: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { jobSourceId, limit }) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const rows = (
      jobSourceId != null
        ? await ctx.db
            .query("recruitEmailLogs")
            .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
            .collect()
        : await ctx.db.query("recruitEmailLogs").collect()
    ).filter((l) => mayRecruitFor(access, l.jobSourceId));
    rows.sort((a, b) => b.sentAt - a.sentAt);
    return rows.slice(0, limit ?? 50);
  },
});

/* ── Mutations ─────────────────────────────────────────────── */

export const setCandidateStatus = mutation({
  args: {
    candidateIds: v.array(v.id("recruitCandidates")),
    status: statusValidator,
  },
  handler: async (ctx, { candidateIds, status }) => {
    await requireCandidates(ctx, await requireRecruiter(ctx), candidateIds);
    const now = Date.now();
    for (const id of candidateIds) {
      await ctx.db.patch(id, { status, statusUpdatedAt: now });
    }
    return { updated: candidateIds.length };
  },
});

export const deleteCandidates = mutation({
  args: { candidateIds: v.array(v.id("recruitCandidates")) },
  handler: async (ctx, { candidateIds }) => {
    const access = await requireRecruiter(ctx);
    // For good, with their notes and history: HR's and the founders' to do.
    if (!access.full) throw new ConvexError("Only HR and super admins delete applicants");
    await requireCandidates(ctx, access, candidateIds);
    for (const id of candidateIds) {
      // Their notes and stage history go with them: nothing can show them once the person is gone.
      const activity = await ctx.db
        .query("recruitActivity")
        .withIndex("by_candidate", (q) => q.eq("candidateId", id))
        .collect();
      for (const a of activity) await ctx.db.delete(a._id);
      await ctx.db.delete(id);
    }
    const del = new Set<string>(candidateIds);
    // A pipeline candidate made from this application stays (it has its own
    // history), but stops pointing at an application that no longer exists.
    for (const row of [...(await rowsOf(ctx, "pipeline")), ...(await rowsOf(ctx, `${ARCHIVED}pipeline`))]) {
      if (typeof row.fields.applicantId === "string" && del.has(row.fields.applicantId)) {
        const { applicantId: _gone, ...fields } = row.fields;
        void _gone;
        await ctx.db.patch(row._id, { fields });
      }
    }
    // Drop them from campaign member lists so memberCount stays right.
    for (const c of await ctx.db.query("recruitCampaigns").collect()) {
      const ids = c.candidateIds ?? [];
      const kept = ids.filter((i) => !del.has(i));
      if (kept.length !== ids.length) await ctx.db.patch(c._id, { candidateIds: kept });
    }
    return { deleted: candidateIds.length };
  },
});

export const addCandidate = mutation({
  args: {
    jobSourceId: v.number(),
    name: v.string(),
    email: v.string(),
    number: v.optional(v.string()),
    position: v.optional(v.string()),
    resume: v.optional(v.string()),
    portfolioLink: v.optional(v.string()),
    experience: v.optional(v.string()),
    currentCtc: v.optional(v.string()),
    expectedCtc: v.optional(v.string()),
    noticePeriod: v.optional(v.string()),
    age: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    requireJob(await requireRecruiter(ctx), args.jobSourceId);
    if (!livePositions(await ctx.db.query("recruitJobs").collect()).some((j) => j.sourceId === args.jobSourceId)) {
      throw new Error("That position no longer exists");
    }
    const name = clean(args.name, 120);
    const email = clean(args.email, 200);
    if (!name) throw new Error("Name is required");
    if (!EMAIL.test(email)) throw new Error("A valid email is required");
    return await ctx.db.insert("recruitCandidates", {
      jobSourceId: args.jobSourceId,
      name,
      email,
      number: clean(args.number, 30),
      position: clean(args.position, 120),
      resume: safeLink(args.resume, "Resume link"),
      portfolioLink: safeLink(args.portfolioLink, "Portfolio link"),
      experience: clean(args.experience, 50),
      currentCtc: clean(args.currentCtc, 100),
      expectedCtc: clean(args.expectedCtc, 100),
      noticePeriod: clean(args.noticePeriod, 100),
      age: args.age ?? null,
      status: "active",
      statusUpdatedAt: null,
      createdAt: Date.now(),
    });
  },
});

export const saveTemplate = mutation({
  args: {
    templateId: v.optional(v.id("recruitTemplates")),
    jobSourceId: v.number(),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { templateId, jobSourceId, name, subject, body }) => {
    const access = await requireRecruiter(ctx);
    requireJob(access, jobSourceId);
    if (!name.trim() || !subject.trim()) throw new Error("Name and subject are required");
    if (templateId) {
      const existing = await ctx.db.get(templateId);
      if (!existing) throw new Error("Template not found");
      requireJob(access, existing.jobSourceId);
      await ctx.db.patch(templateId, { name, subject, body, jobSourceId });
      return templateId;
    }
    return await ctx.db.insert("recruitTemplates", {
      jobSourceId, name: name.trim(), subject: subject.trim(), body,
      createdAt: Date.now(),
    });
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id("recruitTemplates") },
  handler: async (ctx, { templateId }) => {
    const template = await ctx.db.get(templateId);
    if (!template) return;
    requireJob(await requireRecruiter(ctx), template.jobSourceId);
    await ctx.db.delete(templateId);
  },
});

/* ── Stages, notes & the candidate profile ─────────────────── */

/** The stages that put an applicant on the Candidates list. */
const ONTO_CANDIDATES = ["screened", "interview", "offer"];

/** Move candidates through the funnel. Every move is written to the timeline,
 *  because "when did she reject him and why" is the question HR always asks
 *  three weeks later. Shortlisting someone also puts them on the Candidates
 *  list, even if they were marked Shortlisted before and are not on it, and
 *  holding or rejecting them closes them there (lib/candidates.ts). */
export const setStage = mutation({
  args: {
    candidateIds: v.array(v.id("recruitCandidates")),
    stage: stageValidator,
    note: v.optional(v.string()),
    /** Shortlisted for this team, where the position hires into several. */
    team: v.optional(v.id("teams")),
  },
  handler: async (ctx, { candidateIds, stage, note, team }) => {
    const access = await requireRecruiter(ctx);
    await requireCandidates(ctx, access, candidateIds);
    const { userId, user } = access;
    const authorName = user.name ?? user.email ?? "HR";
    const now = Date.now();
    if (ONTO_CANDIDATES.includes(stage)) {
      // Candidates has no place for someone whose position is gone.
      const live = new Set(livePositions(await ctx.db.query("recruitJobs").collect()).map((j) => j.sourceId));
      for (const id of candidateIds) {
        const c = await ctx.db.get(id);
        if (c && !live.has(c.jobSourceId)) throw new Error(`${c.name}'s position was removed. Move them to another position first.`);
      }
    }
    let updated = 0;
    // Before adding: a reopened row is already there, so nobody is added twice.
    // Only people whose status really changes: pressing Shortlist on someone
    // shortlisted must not bring back a row HR closed.
    const changing = [];
    for (const id of new Set(candidateIds)) {
      const c = await ctx.db.get(id);
      if (c && (c.stage ?? "applied") !== stage) changing.push(id);
    }
    const reopened = await followApplication(ctx, async (row) => access.full || !!(await myCandidate(ctx, row._id, access)), changing, stage);
    for (const id of candidateIds) {
      const c = await ctx.db.get(id);
      if (!c) continue;
      const from = c.stage ?? "applied";
      if (from === stage && !note) continue;
      await ctx.db.patch(id, { stage, stageUpdatedAt: now });
      await ctx.db.insert("recruitActivity", {
        candidateId: id,
        kind: "stage",
        body: note?.trim() ?? "",
        fromStage: from,
        toStage: stage,
        authorId: userId,
        authorName,
        createdAt: now,
      });
      updated++;
    }
    let added = 0;
    let teamed = 0;
    if (ONTO_CANDIDATES.includes(stage)) {
      const people = [];
      for (const id of new Set(candidateIds)) {
        const c = await ctx.db.get(id);
        if (c) people.push(c);
      }
      added = await addToCandidates(ctx, access, people, undefined, team);
      // Shortlisted from a team's entry: whoever comes back for it, or was not decided yet, is that team's.
      const ids = new Set<string>(candidateIds);
      const book = team ? await loadPipelines(ctx) : null;
      const root = (id: number | null) => book?.jobs.find((j) => j.sourceId === id)?.parentSourceId ?? id;
      const filed = new Map(people.map((c) => [String(c._id), c.jobSourceId]));
      for (const row of book ? await rowsOf(ctx, "pipeline") : []) {
        const id = String(row.fields.applicantId ?? "");
        const job = book!.jobOf(row);
        const { teams, divide } = book!.teamsOf(job);
        // Their row for this position, not one they have in another's round.
        if (!ids.has(id) || standing(row.fields) !== "Active" || root(job) !== root(filed.get(id) ?? null)) continue;
        if (teams.length < 2 || divide || !teams.includes(team!) || book!.teamOf(row) === team) continue;
        if (book!.teamOf(row) && !reopened.has(id)) continue;
        if (!access.full && !(await myCandidate(ctx, row._id, access))) continue;
        await ctx.db.patch(row._id, { fields: withTeam(row, team, book!), updatedAt: now });
        teamed++;
      }
    }
    await settleTeams(ctx);
    return { updated, added: Math.min(added + reopened.size, new Set(candidateIds).size), teamed };
  },
});

export const addNote = mutation({
  args: { candidateId: v.id("recruitCandidates"), body: v.string() },
  handler: async (ctx, { candidateId, body }) => {
    const access = await requireRecruiter(ctx);
    await requireCandidates(ctx, access, [candidateId]);
    const { userId, user } = access;
    if (!body.trim()) throw new Error("Note can't be empty");
    return await ctx.db.insert("recruitActivity", {
      candidateId,
      kind: "note",
      body: body.trim(),
      authorId: userId,
      authorName: user.name ?? user.email ?? "HR",
      createdAt: Date.now(),
    });
  },
});

export const deleteActivity = mutation({
  args: { activityId: v.id("recruitActivity") },
  handler: async (ctx, { activityId }) => {
    const access = await requireRecruiter(ctx);
    const a = await ctx.db.get(activityId);
    if (!a) return;
    await requireCandidates(ctx, access, [a.candidateId]);
    // Stage moves are the audit trail — only notes are removable.
    if (a.kind !== "note") throw new Error("Stage history can't be deleted");
    await ctx.db.delete(activityId);
  },
});

/** Everything about one candidate: the record, their job, the notes and stage
 *  history, and every email ever sent to them — merged into one timeline. */
export const getCandidate = query({
  args: { candidateId: v.id("recruitCandidates") },
  handler: async (ctx, { candidateId }) => {
    const access = await recruitAccess(ctx);
    if (!access) return null;
    const c = await ctx.db.get(candidateId);
    if (!c || !mayRecruitFor(access, c.jobSourceId)) return null;

    const jobs = await ctx.db.query("recruitJobs").collect();
    const activity = await ctx.db
      .query("recruitActivity")
      .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
      .collect();

    const emails = c.email
      ? (
          await ctx.db
            .query("recruitEmailLogs")
            .withIndex("by_email", (q) => q.eq("contactEmail", c.email))
            .collect()
        ).filter((e) => mayRecruitFor(access, e.jobSourceId))
      : [];

    // Same email address may have applied to several roles; the timeline is
    // about the person, so all of their mail belongs here.
    const timeline = [
      ...activity.map((a) => ({
        id: String(a._id),
        kind: a.kind as "note" | "stage" | "move" | "email",
        at: a.createdAt,
        body: a.body,
        fromStage: a.fromStage ?? null,
        toStage: a.toStage ?? null,
        who: a.authorName,
        ok: true,
      })),
      ...emails.map((e) => ({
        id: String(e._id),
        kind: "email" as const,
        at: e.sentAt,
        body: e.templateName || "Email",
        fromStage: null,
        toStage: null,
        who: e.smtpFrom,
        ok: e.status === "sent",
      })),
    ].sort((a, b) => b.at - a.at);

    // Other applications from the same person — the duplicate problem, surfaced
    // where it matters instead of as a cleanup chore.
    const forPosition = positionOfApplicant(livePositions(jobs));
    const alsoApplied = c.email
      ? (
          await ctx.db
            .query("recruitCandidates")
            .withIndex("by_email", (q) => q.eq("email", c.email))
            .collect()
        )
          .filter((o) => o._id !== c._id && mayRecruitFor(access, o.jobSourceId))
          .map((o) => ({
            _id: o._id,
            // The role they named there, where they named one: that is the page they are on.
            jobSourceId: forPosition(o),
            jobName: jobs.find((j) => j.sourceId === forPosition(o))?.name ?? "Unknown",
            stage: o.stage ?? "applied",
            createdAt: o.createdAt ?? null,
          }))
      : [];

    // Where they are on Candidates, if they have been shortlisted.
    const onCandidates = [];
    for (const row of await ctx.db.query("hrRecords").withIndex("by_tracker", (q) => q.eq("tracker", "pipeline")).collect()) {
      if (row.fields.applicantId !== candidateId || !(await myCandidate(ctx, row._id, access))) continue;
      const roundId = ctx.db.normalizeId("hrRecords", String(row.fields.reqId ?? ""));
      const round = roundId ? await ctx.db.get(roundId) : null;
      onCandidates.push({
        _id: row._id,
        active: standing(row.fields) === "Active",
        stage: standing(row.fields) === "Active" ? String(row.fields.stage ?? "") : standing(row.fields),
        round: round ? `${round.code} · ${String(round.fields.role ?? "")}` : "",
      });
    }

    // Their interviews: what is planned, and what each interviewer said afterwards.
    const mine = new Set<string>(onCandidates.map((row) => row._id));
    const people = new Map<string, string>();
    const interviews = [];
    for (const row of mine.size ? await ctx.db.query("hrRecords").withIndex("by_tracker", (q) => q.eq("tracker", "interviews")).collect() : []) {
      if (!mine.has(String(row.fields.candidateId ?? "")) || ["Cancelled", "Rescheduled"].includes(String(row.fields.status ?? ""))) continue;
      const who = String(row.fields.interviewer ?? "");
      const userId = ctx.db.normalizeId("users", who);
      if (userId && !people.has(who)) people.set(who, (await ctx.db.get(userId))?.name ?? "");
      interviews.push({
        _id: row._id,
        round: String(row.fields.round ?? ""),
        date: String(row.fields.date ?? ""),
        time: String(row.fields.time ?? ""),
        by: people.get(who) ?? "",
        mine: who === access.userId,
        // "" until they have said.
        verdict: row.fields.feedbackReceived || row.fields.feedback ? String(row.fields.recommendation ?? "") : "",
        feedback: String(row.fields.feedback ?? ""),
      });
    }
    interviews.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    // What cultform recorded before this app: when they applied, and when its status was last set.
    const past = (id: string, at: number | null | undefined, body: string) =>
      at ? [{ id: `${c._id}:${id}`, kind: "past" as const, at, body, fromStage: null, toStage: null, who: "", ok: true }] : [];
    const SAID: Record<string, string> = { shortlisted: "Shortlisted in cultform", rejected: "Rejected in cultform", on_hold: "Put on hold in cultform", active: "Set to active in cultform", non_active: "Set to not active in cultform" };
    const before = [
      ...past("applied", c.createdAt, c.sourceId == null ? "Application added" : "Applied on the website"),
      ...past("status", c.sourceId == null ? null : c.statusUpdatedAt, SAID[c.status] ?? "Status set in cultform"),
    ];

    const link = c.roundId ? await ctx.db.get(c.roundId) : null;
    return {
      ...shown(access, c),
      pay: access.pay,
      /** HR and super admins: the rest of Recruitment is theirs to open. */
      full: access.full,
      interviews,
      /** The hiring round whose link they used. */
      through: link?.tracker === "rounds" && mayRecruitFor(access, Number(link.fields.job)) ? link.code : "",
      stage: c.stage ?? "applied",
      jobName: nameOf(jobs.find((j) => j.sourceId === c.jobSourceId)),
      /** The position they are for: the role they named, where they named one. */
      positionId: forPosition(c),
      timeline: [...timeline, ...before].sort((a, b) => b.at - a.at),
      alsoApplied,
      onCandidates,
    };
  },
});

/* ── Campaigns ─────────────────────────────────────────────── */

/** Campaigns with member counts and their own send results. */
export const listCampaigns = query({
  args: { jobSourceId: v.optional(v.number()) },
  handler: async (ctx, { jobSourceId }) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const jobs = await ctx.db.query("recruitJobs").collect();
    const rows = (
      jobSourceId != null
        ? await ctx.db
            .query("recruitCampaigns")
            .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
            .collect()
        : await ctx.db.query("recruitCampaigns").collect()
    ).filter((c) => mayRecruitFor(access, c.jobSourceId));

    const logs = await ctx.db.query("recruitEmailLogs").collect();
    rows.sort((a, b) => b.startDate - a.startDate);

    return rows.map((c) => {
      const mine = logs.filter((l) => l.campaignSourceId === c.sourceId);
      return {
        ...c,
        memberCount: (c.candidateIds ?? []).length,
        jobName: jobs.find((j) => j.sourceId === c.jobSourceId)?.name ?? "Unknown",
        sent: mine.filter((l) => l.status === "sent").length,
        failed: mine.filter((l) => l.status === "failed").length,
        isOpen: c.endDate == null,
      };
    });
  },
});

/** Members of one campaign, resolved to full candidate records. */
export const getCampaign = query({
  args: { campaignId: v.id("recruitCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const access = await recruitAccess(ctx);
    if (!access) return null;
    const c = await ctx.db.get(campaignId);
    if (!c || !mayRecruitFor(access, c.jobSourceId)) return null;
    const members = [];
    for (const id of c.candidateIds ?? []) {
      const cand = await ctx.db.get(id);
      // Candidates deleted since being added just drop out of the list, and so
      // does anyone from a position this person does not have (a campaign can
      // hold people from more than one).
      if (cand && mayRecruitFor(access, cand.jobSourceId)) members.push(shown(access, cand));
    }
    const jobs = await ctx.db.query("recruitJobs").collect();
    return {
      ...c,
      members,
      jobName: jobs.find((j) => j.sourceId === c.jobSourceId)?.name ?? "Unknown",
    };
  },
});

export const createCampaign = mutation({
  args: {
    name: v.string(),
    jobSourceId: v.number(),
    candidateIds: v.array(v.id("recruitCandidates")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { name, jobSourceId, candidateIds, notes }) => {
    const access = await requireRecruiter(ctx);
    requireJob(access, jobSourceId);
    await requireCandidates(ctx, access, candidateIds);
    const { userId } = access;
    if (!name.trim()) throw new Error("Campaign name is required");
    const all = await ctx.db.query("recruitCampaigns").collect();
    // Stay above the imported MySQL id range so email logs can attribute
    // cleanly to either system's campaigns.
    const nextId = Math.max(1000, ...all.map((c) => c.sourceId ?? 0)) + 1;
    const now = Date.now();
    return await ctx.db.insert("recruitCampaigns", {
      sourceId: nextId,
      jobSourceId,
      name: name.trim(),
      startDate: now,
      endDate: null,
      createdAt: now,
      source: "manual",
      candidateIds,
      notes: notes?.trim() ?? "",
      createdBy: userId,
    });
  },
});

export const updateCampaignMembers = mutation({
  args: {
    campaignId: v.id("recruitCampaigns"),
    add: v.optional(v.array(v.id("recruitCandidates"))),
    remove: v.optional(v.array(v.id("recruitCandidates"))),
  },
  handler: async (ctx, { campaignId, add, remove }) => {
    const access = await requireRecruiter(ctx);
    const c = await ctx.db.get(campaignId);
    if (!c) throw new Error("Campaign not found");
    requireJob(access, c.jobSourceId);
    await requireCandidates(ctx, access, add ?? []);
    const set = new Set<string>((c.candidateIds ?? []).map(String));
    for (const id of add ?? []) set.add(String(id));
    for (const id of remove ?? []) set.delete(String(id));
    const next = [...set] as typeof c.candidateIds;
    await ctx.db.patch(campaignId, { candidateIds: next });
    return { memberCount: next?.length ?? 0 };
  },
});

export const closeCampaign = mutation({
  args: { campaignId: v.id("recruitCampaigns"), reopen: v.optional(v.boolean()) },
  handler: async (ctx, { campaignId, reopen }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) throw new Error("Campaign not found");
    requireJob(await requireRecruiter(ctx), c.jobSourceId);
    await ctx.db.patch(campaignId, { endDate: reopen ? null : Date.now() });
  },
});

export const deleteCampaign = mutation({
  args: { campaignId: v.id("recruitCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) return;
    requireJob(await requireRecruiter(ctx), c.jobSourceId);
    // Only the grouping goes; the candidates and their send history stay.
    await ctx.db.delete(campaignId);
  },
});

/* ── Email sending ─────────────────────────────────────────── */

/** Placeholder substitution, matching the PHP app's {{variable}} syntax. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `html` is for the email body, where a value must not be able to add markup
 *  of its own, whichever way the candidate got into the system. */
function fillPlaceholders(text: string, c: Doc<"recruitCandidates">, jobName: string, html = false) {
  const map: Record<string, string> = {
    name: c.name,
    email: c.email,
    number: c.number,
    position: c.position || jobName,
    currentctc: c.currentCtc,
    expectedctc: c.expectedCtc,
    resume: c.resume,
    portfoliolink: c.portfolioLink,
    jobname: jobName,
  };
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (full, key) => {
    const name = String(key).toLowerCase();
    const value = Object.hasOwn(map, name) ? map[name] : undefined;
    return value === undefined ? full : html ? escapeHtml(value) : value;
  });
}

export const _loadSendContext = internalQuery({
  args: {
    candidateIds: v.array(v.id("recruitCandidates")),
    templateId: v.id("recruitTemplates"),
    campaignSourceId: v.optional(v.number()),
  },
  handler: async (ctx, { candidateIds, templateId, campaignSourceId }) => {
    // Auth carries over from the calling action; gates sendTemplateEmail.
    const access = await requireRecruiter(ctx);
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    requireJob(access, template.jobSourceId);
    // The filled-in text can end up anywhere the template's author points it (an image address, say).
    if (!access.pay && /\{\{\s*(currentctc|expectedctc)\s*\}\}/i.test(`${template.subject} ${template.body}`)) {
      throw new Error("This template includes the candidate's CTC, which you do not see. Ask HR to send it.");
    }
    await requireCandidates(ctx, access, candidateIds);
    // The send is counted against this campaign, so it must be one of theirs too.
    if (campaignSourceId !== undefined) {
      const campaign = (await ctx.db.query("recruitCampaigns").collect()).find((c) => c.sourceId === campaignSourceId);
      if (!campaign) throw new Error("Campaign not found");
      requireJob(access, campaign.jobSourceId);
    }
    const jobs = await ctx.db.query("recruitJobs").collect();
    const at = positionOfApplicant(livePositions(jobs));
    const out = [];
    for (const id of candidateIds) {
      const c = await ctx.db.get(id);
      if (!c || !c.email) continue;
      // The role they are for, as the preview and every list say it.
      const jobName = jobs.find((j) => j.sourceId === at(c))?.name ?? "";
      out.push({
        candidateId: id,
        jobSourceId: c.jobSourceId,
        jobName,
        email: c.email,
        name: c.name,
        subject: fillPlaceholders(template.subject, c, jobName),
        body: fillPlaceholders(template.body, c, jobName, true),
      });
    }
    return { templateName: template.name, recipients: out };
  },
});

export const _logSend = internalMutation({
  args: {
    jobSourceId: v.number(),
    jobName: v.string(),
    contactEmail: v.string(),
    contactName: v.string(),
    templateName: v.string(),
    smtpFrom: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.string(),
    campaignSourceId: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("recruitEmailLogs", { ...args, sentAt: Date.now() });
  },
});

/**
 * Send a template to selected candidates through ZeptoMail — the same API and
 * sender the cultform app uses, so delivery, SPF and reputation are unchanged.
 * Every attempt is logged whether it succeeds or fails; a send you can't audit
 * is worse than no send.
 */
export const sendTemplateEmail = action({
  args: {
    candidateIds: v.array(v.id("recruitCandidates")),
    templateId: v.id("recruitTemplates"),
    /** Attributes every log line to a campaign so its results are countable. */
    campaignSourceId: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { candidateIds, templateId, campaignSourceId }
  ): Promise<{ sent: number; unsent: Id<"recruitCandidates">[]; reason: string }> => {
    const token = process.env.ZEPTO_API_TOKEN;
    const fromEmail = process.env.ZEPTO_FROM_EMAIL ?? "hr@ecultify.com";
    const fromName = process.env.ZEPTO_FROM_NAME ?? "HR Team";
    if (!token) throw new Error("ZEPTO_API_TOKEN is not configured");

    const { templateName, recipients } = await ctx.runQuery(
      internal.recruitment._loadSendContext,
      { candidateIds, templateId, campaignSourceId }
    );

    const unsent = new Set(recipients.map((r) => r.candidateId));
    let reason = "";
    for (const r of recipients) {
      let ok = false;
      let errText = "";
      try {
        const res = await fetch("https://api.zeptomail.com/v1.1/email", {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            from: { address: fromEmail, name: fromName },
            to: [{ email_address: { address: r.email, name: r.name } }],
            subject: r.subject,
            htmlbody: r.body,
          }),
        });
        ok = res.ok;
        if (!ok) errText = `HTTP ${res.status} | ${(await res.text()).slice(0, 300)}`;
      } catch (e) {
        errText = e instanceof Error ? e.message : String(e);
      }

      await ctx.runMutation(internal.recruitment._logSend, {
        jobSourceId: r.jobSourceId,
        jobName: r.jobName,
        contactEmail: r.email,
        contactName: r.name,
        templateName,
        smtpFrom: fromEmail,
        status: ok ? "sent" : "failed",
        error: errText,
        campaignSourceId: campaignSourceId ?? null,
      });

      if (ok) unsent.delete(r.candidateId);
      else {
        reason = mailProblem(errText) || reason;
        // Out of credits, or a refused token: the rest would fail the same way.
        if (stopsEverySend(errText)) break;
      }
    }
    return { sent: recipients.length - unsent.size, unsent: [...unsent], reason };
  },
});

/* ── Website application form ──────────────────────────────── */
// The form on ecultify.com/job-application talks to /api/apply (a Next route),
// which stores the resume and calls these two. Both are public on purpose: the
// form is public. So this file is the trust boundary and checks everything.

/**
 * What an application link is for: a position (POS-007), or a hiring round that
 * is open and tied to one (REQ-26-013). Null when there is no such thing to apply for.
 */
async function openingFor(ctx: Ctx, code: string): Promise<{ id: number; roundId?: Id<"hrRecords"> } | null> {
  const asked = code.trim().toUpperCase();
  const position = /^POS-(\d{1,9})$/.exec(asked);
  if (position) return { id: Number(position[1]) };
  if (!/^REQ-\d{2}-\d{1,6}$/.test(asked)) return null;
  const round = (await ctx.db.query("hrRecords").withIndex("by_tracker", (q) => q.eq("tracker", "rounds")).collect()).find((r) => r.code === asked);
  return round?.fields.job && round.fields.hiringStatus === "Open" ? { id: Number(round.fields.job), roundId: round._id } : null;
}

/** Roles the website form offers: every role that is not closed. */
export const openPositions = query({
  /** With an opening's code, only that one: the form is then for nothing else. */
  args: { opening: v.optional(v.string()) },
  handler: async (ctx, { opening }) => {
    const only = opening ? await openingFor(ctx, opening) : undefined;
    if (only === null) return [];
    const all = await ctx.db.query("recruitJobs").collect();
    const closed = new Set(all.filter((j) => j.status === "closed").map((j) => j.sourceId));
    return livePositions(all)
      // Closing a role closes its sub-positions with it.
      .filter((j) => !closed.has(j.sourceId) && !(j.parentSourceId && closed.has(j.parentSourceId)))
      .filter((j) => !only || j.sourceId === only.id)
      .map((j) => ({ id: j.sourceId, label: j.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

const CLOSED_LINK = "This opening is closed. Please ask for a new link.";

export const apply = mutation({
  args: {
    jobSourceId: v.number(),
    name: v.string(),
    email: v.string(),
    number: v.optional(v.string()),
    age: v.optional(v.union(v.number(), v.null())),
    experience: v.optional(v.string()),
    currentCtc: v.optional(v.string()),
    expectedCtc: v.optional(v.string()),
    noticePeriod: v.optional(v.string()),
    portfolioLink: v.optional(v.string()),
    /** The R2 key /api/apply stored the resume under. */
    resumeKey: v.optional(v.string()),
    /** The opening their link was for. */
    opening: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = clean(args.name, 120);
    const email = clean(args.email, 200).toLowerCase();
    if (!name) throw new ConvexError("Please enter your name");
    if (!EMAIL.test(email)) throw new ConvexError("A valid email is required");
    if (args.resumeKey !== undefined && !RESUME_KEY.test(args.resumeKey)) {
      throw new ConvexError("Resume upload failed. Please try again.");
    }
    const age =
      typeof args.age === "number" && Number.isInteger(args.age) && args.age >= 16 && args.age <= 65
        ? args.age
        : null;

    const selected = await ctx.db
      .query("recruitJobs")
      .withIndex("by_source", (q) => q.eq("sourceId", args.jobSourceId))
      .first();
    // A sub-position files under its parent; `position` keeps what was picked.
    const jobSourceId = selected?.parentSourceId ?? selected?.sourceId;
    const parent =
      selected?.parentSourceId != null
        ? await ctx.db
            .query("recruitJobs")
            .withIndex("by_source", (q) => q.eq("sourceId", selected.parentSourceId as number))
            .first()
        : selected;
    if (!selected || jobSourceId === undefined || [selected, parent].some((j) => !j || j.removedAt || j.status === "closed")) {
      throw new ConvexError(args.opening ? CLOSED_LINK : "This role is no longer open. Please pick another one.");
    }
    // A link is for one opening. Changed by hand, or out of date, it is not quietly turned into something else.
    const opening = args.opening ? await openingFor(ctx, args.opening) : undefined;
    if (opening === null || (opening && opening.id !== selected.sourceId)) throw new ConvexError(CLOSED_LINK);

    const now = Date.now();
    // ponytail: one global flood breaker, no per-IP limit. Add a captcha on the
    // form if real spam shows up.
    // Rows with a sourceId came from a cultform import, not from the form.
    const recent = (await ctx.db.query("recruitCandidates").order("desc").take(600)).filter(
      (c) => c.sourceId === undefined && c._creationTime > now - 3_600_000
    );
    if (recent.length >= 300) {
      throw new ConvexError("We are receiving too many applications right now. Please try again in an hour.");
    }
    // A double click or a retry must not create a second row.
    if (
      recent.some(
        (c) => c.email === email && c.jobSourceId === jobSourceId && c._creationTime > now - 600_000
      )
    ) {
      return { success: true, saved: false };
    }

    await ctx.db.insert("recruitCandidates", {
      jobSourceId,
      ...(opening?.roundId ? { roundId: opening.roundId } : {}),
      name,
      email,
      number: clean(args.number, 30),
      age,
      experience: clean(args.experience, 50),
      resume: args.resumeKey ? `${process.env.SITE_URL}/api/r2-file?key=${args.resumeKey}` : "",
      portfolioLink: safeLink(args.portfolioLink, "Portfolio link", false),
      position: selected.name,
      currentCtc: clean(args.currentCtc, 100),
      expectedCtc: clean(args.expectedCtc, 100),
      noticePeriod: clean(args.noticePeriod, 100),
      status: "active",
      statusUpdatedAt: null,
      stage: "applied",
      createdAt: now,
    });
    return { success: true, saved: true };
  },
});

/** Open or close a role on the website form. */
export const setJobOpen = mutation({
  args: { jobId: v.id("recruitJobs"), open: v.boolean() },
  handler: async (ctx, { jobId, open }) => {
    await requireFull(ctx);
    const job = await ctx.db.get(jobId);
    if (!job || job.removedAt) throw new Error("This position was removed");
    // Opened again after its last day: that day no longer closes it.
    const past = open && job.closesOn && job.closesOn < today();
    await ctx.db.patch(jobId, { status: open ? "open" : "closed", ...(past ? { closesOn: undefined } : {}) });
  },
});

/* ── Migration ─────────────────────────────────────────────── */

/**
 * Bring the cultform JobData tables across, a batch at a time. Every row is
 * matched on its MySQL id (`sourceId`), so it is safe to run again: rows that
 * exist are updated, rows that don't are added, nothing is deleted. Positions,
 * and which one anything is filed under, are decided in this app (Setup): a
 * later run leaves both alone.
 *
 * A candidate's stage follows the cultform status only while nobody has moved
 * it here: once HR sets a stage in this app, a later run leaves it alone.
 *
 *   node scripts/import-cultform.mjs <folder of jd_*.json exports>
 */
export const importFromCultform = internalMutation({
  args: {
    jobs: v.optional(v.array(v.object({
      sourceId: v.number(),
      name: v.string(),
      description: v.string(),
      parentSourceId: v.union(v.number(), v.null()),
      createdAt: v.number(),
    }))),
    candidates: v.optional(v.array(v.object({
      sourceId: v.number(),
      jobSourceId: v.number(),
      name: v.string(),
      number: v.string(),
      email: v.string(),
      age: v.union(v.number(), v.null()),
      experience: v.string(),
      resume: v.string(),
      portfolioLink: v.string(),
      position: v.string(),
      currentCtc: v.string(),
      expectedCtc: v.string(),
      noticePeriod: v.string(),
      status: statusValidator,
      statusUpdatedAt: v.union(v.number(), v.null()),
      createdAt: v.union(v.number(), v.null()),
    }))),
    templates: v.optional(v.array(v.object({
      sourceId: v.number(),
      jobSourceId: v.number(),
      name: v.string(),
      subject: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }))),
    campaigns: v.optional(v.array(v.object({
      sourceId: v.number(),
      jobSourceId: v.number(),
      name: v.string(),
      startDate: v.number(),
      endDate: v.union(v.number(), v.null()),
      createdAt: v.number(),
      source: v.union(v.literal("auto"), v.literal("manual")),
      /** MySQL contact ids of its members. */
      memberSourceIds: v.array(v.number()),
    }))),
    emailLogs: v.optional(v.array(v.object({
      sourceId: v.number(),
      jobSourceId: v.number(),
      jobName: v.string(),
      contactEmail: v.string(),
      contactName: v.string(),
      templateName: v.string(),
      smtpFrom: v.string(),
      status: v.union(v.literal("sent"), v.literal("failed")),
      error: v.string(),
      sentAt: v.number(),
      campaignSourceId: v.union(v.number(), v.null()),
    }))),
  },
  handler: async (ctx, args) => {
    const done = { added: 0, updated: 0, unchanged: 0 };
    /** True when any field of `row` differs from what is stored, so a re-run
     *  only writes (and only counts) what really changed. */
    const differs = (existing: Record<string, unknown>, row: Record<string, unknown>) =>
      Object.entries(row).some(
        ([k, val]) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(val ?? null)
      );

    for (const j of args.jobs ?? []) {
      const existing = await ctx.db
        .query("recruitJobs")
        .withIndex("by_source", (q) => q.eq("sourceId", j.sourceId))
        .first();
      if (!existing) {
        // formUrl is edited here, not in cultform (its column is dead there).
        await ctx.db.insert("recruitJobs", { ...j, formUrl: "" });
        done.added++;
      } else done.unchanged++;
    }

    for (const c of args.candidates ?? []) {
      const existing = await ctx.db
        .query("recruitCandidates")
        .withIndex("by_source", (q) => q.eq("sourceId", c.sourceId))
        .first();
      const stage = STAGE_FROM_STATUS[c.status];
      if (!existing) {
        const stageUpdatedAt = c.statusUpdatedAt ?? c.createdAt;
        await ctx.db.insert("recruitCandidates", {
          ...c,
          stage,
          ...(stageUpdatedAt != null ? { stageUpdatedAt } : {}),
        });
        done.added++;
        continue;
      }
      // Still where the last import left it (or never given a stage) →
      // nobody moved it here.
      const untouched =
        existing.stage === undefined || existing.stage === STAGE_FROM_STATUS[existing.status];
      const kept = { ...c, jobSourceId: existing.jobSourceId, position: existing.position };
      const row =
        untouched && existing.stage !== stage
          ? { ...kept, stage, stageUpdatedAt: c.statusUpdatedAt ?? Date.now() }
          : kept;
      if (differs(existing, row)) {
        await ctx.db.patch(existing._id, row);
        done.updated++;
      } else done.unchanged++;
    }

    if (args.templates?.length) {
      const all = await ctx.db.query("recruitTemplates").collect();
      for (const t of args.templates) {
        const existing = all.find((x) => x.sourceId === t.sourceId);
        if (!existing) {
          await ctx.db.insert("recruitTemplates", t);
          done.added++;
        } else if (differs(existing, { ...t, jobSourceId: existing.jobSourceId })) {
          await ctx.db.patch(existing._id, { ...t, jobSourceId: existing.jobSourceId });
          done.updated++;
        } else done.unchanged++;
      }
    }

    if (args.campaigns?.length) {
      const all = await ctx.db.query("recruitCampaigns").collect();
      for (const { memberSourceIds, ...c } of args.campaigns) {
        const candidateIds = [];
        for (const sid of memberSourceIds) {
          const cand = await ctx.db
            .query("recruitCandidates")
            .withIndex("by_source", (q) => q.eq("sourceId", sid))
            .first();
          if (cand) candidateIds.push(cand._id);
        }
        const existing = all.find((x) => x.sourceId === c.sourceId);
        // Members added here stay: the cultform list only ever adds to it.
        const row = { ...c, jobSourceId: existing?.jobSourceId ?? c.jobSourceId, candidateIds: [...new Set([...(existing?.candidateIds ?? []), ...candidateIds])] };
        if (!existing) {
          await ctx.db.insert("recruitCampaigns", row);
          done.added++;
        } else if (differs(existing, row)) {
          await ctx.db.patch(existing._id, row);
          done.updated++;
        } else done.unchanged++;
      }
    }

    if (args.emailLogs?.length) {
      // Logs are a record of what was sent: add the missing ones, never rewrite.
      const have = new Set((await ctx.db.query("recruitEmailLogs").collect()).map((l) => l.sourceId));
      for (const l of args.emailLogs) {
        if (have.has(l.sourceId)) {
          done.unchanged++;
          continue;
        }
        await ctx.db.insert("recruitEmailLogs", l);
        done.added++;
      }
    }

    return done;
  },
});

/**
 * One-shot backfill: give every imported candidate a funnel stage derived from
 * their old flat status. Idempotent — rows that already have a stage are left
 * alone, so it's safe to re-run.
 *   npx convex run recruitment:backfillStages
 */
export const backfillStages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("recruitCandidates").collect();
    const MAP: Record<string, "applied" | "rejected" | "on_hold"> = {
      active: "applied",
      rejected: "rejected",
      on_hold: "on_hold",
      // Exactly one row is non_active and it predates any real meaning —
      // park it rather than guess that it was a rejection.
      non_active: "on_hold",
    };
    let updated = 0;
    for (const r of rows) {
      if (r.stage) continue;
      await ctx.db.patch(r._id, {
        stage: MAP[r.status] ?? "applied",
        stageUpdatedAt: r.statusUpdatedAt ?? r.createdAt ?? undefined,
      });
      updated++;
    }
    return { total: rows.length, updated };
  },
});

/** Is email working? Sends one plain message from the app's own sender to that same address. Run by hand. */
export const mailCheck = internalAction({
  args: {},
  handler: async (): Promise<string> => {
    const from = process.env.ZEPTO_FROM_EMAIL ?? "hr@ecultify.com";
    const res = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: { Authorization: process.env.ZEPTO_API_TOKEN ?? "", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        from: { address: from, name: process.env.ZEPTO_FROM_NAME ?? "HR Team" },
        to: [{ email_address: { address: from, name: "HR Team" } }],
        subject: "Tasktracker email check",
        textbody: "This is a test from tasktracker. Email sending works.",
      }),
    });
    return `HTTP ${res.status} | ${(await res.text()).slice(0, 300)}`;
  },
});
