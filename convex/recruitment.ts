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
import { ARCHIVED, addToCandidates, followApplication, rowsOf, standing } from "./lib/candidates";
import { matches } from "./lib/applicantMatch";
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
  const url = /^https?:\/\//i.test(text) ? text : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(text) ? `https://${text}` : "";
  if (!url && strict) throw new Error(`${label}: paste a full web address`);
  return url;
}

/** Jobs with their live candidate counts, parents before their sub-positions. */
export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const jobs = (await ctx.db.query("recruitJobs").collect()).filter((j) => mayRecruitFor(access, j.sourceId));
    const candidates = await ctx.db.query("recruitCandidates").collect();

    const none = () => ({ total: 0, fresh: 0, shortlisted: 0, onHold: 0, rejected: 0, lastApplied: 0 });
    const counts = new Map<number, ReturnType<typeof none>>();
    for (const c of candidates) {
      const acc = counts.get(c.jobSourceId) ?? none();
      const st = c.stage ?? "applied";
      acc.total++;
      // MUST match positionStatus in src/lib/recruitStages.ts, which the position page filters by.
      if (st === "applied") acc.fresh++;
      else if (st === "on_hold") acc.onHold++;
      else if (st === "rejected") acc.rejected++;
      else acc.shortlisted++;
      acc.lastApplied = Math.max(acc.lastApplied, c.createdAt ?? 0);
      counts.set(c.jobSourceId, acc);
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
    const candidates = mine(await ctx.db.query("recruitCandidates").collect());
    const jobs = (await ctx.db.query("recruitJobs").collect()).filter((j) => mayRecruitFor(access, j.sourceId));
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
    const rows = await ctx.db
      .query("recruitCandidates")
      .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
      .collect();
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return rows.filter((r) => (!stage || (r.stage ?? "applied") === stage) && (!search || matches(r, search)));
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
    const jobs = new Map((await ctx.db.query("recruitJobs").collect()).map((j) => [j.sourceId, j.name]));
    const statusOf = (stage: string) =>
      stage === "applied" ? "new" : stage === "on_hold" || stage === "rejected" ? stage : "shortlisted";
    return (await ctx.db.query("recruitCandidates").collect())
      .filter(
        (r) =>
          mayRecruitFor(access, r.jobSourceId) &&
          (jobSourceId === undefined || r.jobSourceId === jobSourceId) &&
          (!status || statusOf(r.stage ?? "applied") === status)
      )
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, Math.min(limit ?? 10, 300))
      .map((r) => ({ ...r, jobName: jobs.get(r.jobSourceId) ?? "Unknown" }));
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
    const rows = await ctx.db.query("recruitCandidates").collect();
    return rows
      .filter((r) => mayRecruitFor(access, r.jobSourceId) && matches(r, s))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, limit ?? 20)
      .map((r) => ({
        ...r,
        jobName: jobs.find((j) => j.sourceId === r.jobSourceId)?.name ?? "Unknown",
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

export const createJob = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    parentSourceId: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { name, description, parentSourceId }) => {
    await requireFull(ctx);
    if (!name.trim()) throw new Error("Name is required");
    // Keep allocating sourceIds above the imported range so a later
    // reconciliation against MySQL can still tell the two apart.
    const all = await ctx.db.query("recruitJobs").collect();
    const nextId = Math.max(1000, ...all.map((j) => j.sourceId)) + 1;
    return await ctx.db.insert("recruitJobs", {
      sourceId: nextId,
      name: name.trim(),
      description: description?.trim() ?? "",
      formUrl: "",
      parentSourceId: parentSourceId ?? null,
      createdAt: Date.now(),
    });
  },
});

export const updateJob = mutation({
  args: {
    jobId: v.id("recruitJobs"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    formUrl: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, ...patch }) => {
    await requireFull(ctx);
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(jobId, clean);
  },
});

export const deleteCandidates = mutation({
  args: { candidateIds: v.array(v.id("recruitCandidates")) },
  handler: async (ctx, { candidateIds }) => {
    await requireCandidates(ctx, await requireRecruiter(ctx), candidateIds);
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
  },
  handler: async (ctx, { candidateIds, stage, note }) => {
    const access = await requireRecruiter(ctx);
    await requireCandidates(ctx, access, candidateIds);
    const { userId, user } = access;
    const authorName = user.name ?? user.email ?? "HR";
    const now = Date.now();
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
    if (ONTO_CANDIDATES.includes(stage)) {
      const people = [];
      for (const id of new Set(candidateIds)) {
        const c = await ctx.db.get(id);
        if (c) people.push(c);
      }
      added = await addToCandidates(ctx, access, people);
    }
    return { updated, added: Math.min(added + reopened.size, new Set(candidateIds).size) };
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
        kind: a.kind as "note" | "stage" | "email",
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
            jobSourceId: o.jobSourceId,
            jobName: jobs.find((j) => j.sourceId === o.jobSourceId)?.name ?? "Unknown",
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
        stage: standing(row.fields) === "Active" ? String(row.fields.stage ?? "") : standing(row.fields),
        round: round ? `${round.code} · ${String(round.fields.role ?? "")}` : "",
      });
    }

    return {
      ...c,
      stage: c.stage ?? "applied",
      jobName: jobs.find((j) => j.sourceId === c.jobSourceId)?.name ?? "Unknown",
      timeline,
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
      if (cand && mayRecruitFor(access, cand.jobSourceId)) members.push(cand);
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
    await requireCandidates(ctx, access, candidateIds);
    // The send is counted against this campaign, so it must be one of theirs too.
    if (campaignSourceId !== undefined) {
      const campaign = (await ctx.db.query("recruitCampaigns").collect()).find((c) => c.sourceId === campaignSourceId);
      if (!campaign) throw new Error("Campaign not found");
      requireJob(access, campaign.jobSourceId);
    }
    const jobs = await ctx.db.query("recruitJobs").collect();
    const out = [];
    for (const id of candidateIds) {
      const c = await ctx.db.get(id);
      if (!c || !c.email) continue;
      const jobName = jobs.find((j) => j.sourceId === c.jobSourceId)?.name ?? "";
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

/** Roles the website form offers: every role that is not closed. */
export const openPositions = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("recruitJobs").collect();
    const closed = new Set(jobs.filter((j) => j.status === "closed").map((j) => j.sourceId));
    return jobs
      // Closing a role closes its sub-positions with it.
      .filter((j) => !closed.has(j.sourceId) && !(j.parentSourceId && closed.has(j.parentSourceId)))
      .map((j) => ({ id: j.sourceId, label: j.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

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
    if (!selected || jobSourceId === undefined || selected.status === "closed" || parent?.status === "closed") {
      throw new ConvexError("This role is no longer open. Please pick another one.");
    }

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
    await ctx.db.patch(jobId, { status: open ? "open" : "closed" });
  },
});

/* ── Migration ─────────────────────────────────────────────── */

/**
 * Bring the cultform JobData tables across, a batch at a time. Every row is
 * matched on its MySQL id (`sourceId`), so it is safe to run again: rows that
 * exist are updated, rows that don't are added, nothing is deleted.
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
      } else if (differs(existing, j)) {
        await ctx.db.patch(existing._id, j);
        done.updated++;
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
      const row =
        untouched && existing.stage !== stage
          ? { ...c, stage, stageUpdatedAt: c.statusUpdatedAt ?? Date.now() }
          : c;
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
        } else if (differs(existing, t)) {
          await ctx.db.patch(existing._id, t);
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
        const row = { ...c, candidateIds: [...new Set([...(existing?.candidateIds ?? []), ...candidateIds])] };
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
