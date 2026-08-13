import { getAuthUserId } from "./lib/internalAuth";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

// ── RECRUITMENT ────────────────────────────────────────────────
// Imported from the cultform JobData MySQL app. Rows join on `sourceId`
// (the original MySQL primary key) rather than Convex Ids, so the public
// application form can dual-write into both systems and stay reconcilable.
//
// Access: HR and super-admins. Brand managers deliberately can't see
// candidate PII — salaries, phone numbers and CVs are HR's business.

const statusValidator = v.union(
  v.literal("active"),
  v.literal("non_active"),
  v.literal("rejected"),
  v.literal("on_hold")
);

async function requireRecruiter(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || (user.isHR !== true && user.isSuperAdmin !== true)) {
    throw new Error("Recruitment is HR only");
  }
  return { userId, user };
}

async function canRecruit(ctx: any): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  return user?.isHR === true || user?.isSuperAdmin === true;
}

/** Jobs with their live candidate counts, parents before their sub-positions. */
export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    if (!(await canRecruit(ctx))) return [];

    const jobs = await ctx.db.query("recruitJobs").collect();
    const candidates = await ctx.db.query("recruitCandidates").collect();

    const counts = new Map<number, { total: number; active: number; rejected: number }>();
    for (const c of candidates) {
      const acc = counts.get(c.jobSourceId) ?? { total: 0, active: 0, rejected: 0 };
      acc.total++;
      if (c.status === "active") acc.active++;
      if (c.status === "rejected") acc.rejected++;
      counts.set(c.jobSourceId, acc);
    }

    const withCounts = jobs.map((j) => ({
      ...j,
      ...(counts.get(j.sourceId) ?? { total: 0, active: 0, rejected: 0 }),
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
    if (!(await canRecruit(ctx))) return null;
    const candidates = await ctx.db.query("recruitCandidates").collect();
    const jobs = await ctx.db.query("recruitJobs").collect();
    const logs = await ctx.db.query("recruitEmailLogs").collect();

    const byStatus: Record<string, number> = {
      active: 0, non_active: 0, rejected: 0, on_hold: 0,
    };
    for (const c of candidates) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

    // "This month" only counts dated rows — ~1,100 legacy imports have no
    // createdAt, so this is deliberately a floor, not a total.
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = candidates.filter((c) => c.createdAt != null && c.createdAt > monthAgo).length;

    return {
      totalCandidates: candidates.length,
      totalJobs: jobs.length,
      byStatus,
      recent,
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
    status: v.optional(statusValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { jobSourceId, status, search }) => {
    if (!(await canRecruit(ctx))) return [];
    let rows = await ctx.db
      .query("recruitCandidates")
      .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
      .collect();

    if (status) rows = rows.filter((r) => r.status === status);
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.email.toLowerCase().includes(s) ||
          r.position.toLowerCase().includes(s) ||
          r.number.includes(s)
      );
    }
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return rows;
  },
});

/** Global candidate search across every job. */
export const searchCandidates = query({
  args: { search: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { search, limit }) => {
    if (!(await canRecruit(ctx))) return [];
    const s = search.trim().toLowerCase();
    if (s.length < 2) return [];
    const jobs = await ctx.db.query("recruitJobs").collect();
    const rows = await ctx.db.query("recruitCandidates").collect();
    return rows
      .filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.email.toLowerCase().includes(s) ||
          r.position.toLowerCase().includes(s)
      )
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
    if (!(await canRecruit(ctx))) return [];
    const jobs = await ctx.db.query("recruitJobs").collect();
    const rows =
      jobSourceId != null
        ? await ctx.db
            .query("recruitTemplates")
            .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
            .collect()
        : await ctx.db.query("recruitTemplates").collect();
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
    if (!(await canRecruit(ctx))) return [];
    const rows =
      jobSourceId != null
        ? await ctx.db
            .query("recruitEmailLogs")
            .withIndex("by_job", (q) => q.eq("jobSourceId", jobSourceId))
            .collect()
        : await ctx.db.query("recruitEmailLogs").collect();
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
    await requireRecruiter(ctx);
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
    await requireRecruiter(ctx);
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
    await requireRecruiter(ctx);
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(jobId, clean);
  },
});

export const deleteCandidates = mutation({
  args: { candidateIds: v.array(v.id("recruitCandidates")) },
  handler: async (ctx, { candidateIds }) => {
    await requireRecruiter(ctx);
    for (const id of candidateIds) await ctx.db.delete(id);
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
    await requireRecruiter(ctx);
    if (!args.name.trim()) throw new Error("Name is required");
    if (!args.email.trim()) throw new Error("Email is required");
    return await ctx.db.insert("recruitCandidates", {
      jobSourceId: args.jobSourceId,
      name: args.name.trim(),
      email: args.email.trim(),
      number: args.number ?? "",
      position: args.position ?? "",
      resume: args.resume ?? "",
      portfolioLink: args.portfolioLink ?? "",
      experience: args.experience ?? "",
      currentCtc: args.currentCtc ?? "",
      expectedCtc: args.expectedCtc ?? "",
      noticePeriod: args.noticePeriod ?? "",
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
    await requireRecruiter(ctx);
    if (!name.trim() || !subject.trim()) throw new Error("Name and subject are required");
    if (templateId) {
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
    await requireRecruiter(ctx);
    await ctx.db.delete(templateId);
  },
});

/* ── Email sending ─────────────────────────────────────────── */

/** Placeholder substitution, matching the PHP app's {{variable}} syntax. */
function fillPlaceholders(text: string, c: Doc<"recruitCandidates">, jobName: string) {
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
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (full, key) =>
    map[String(key).toLowerCase()] ?? full
  );
}

export const _loadSendContext = internalQuery({
  args: {
    candidateIds: v.array(v.id("recruitCandidates")),
    templateId: v.id("recruitTemplates"),
  },
  handler: async (ctx, { candidateIds, templateId }) => {
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
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
        body: fillPlaceholders(template.body, c, jobName),
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("recruitEmailLogs", {
      ...args,
      sentAt: Date.now(),
      campaignSourceId: null,
    });
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
  },
  handler: async (ctx, { candidateIds, templateId }): Promise<{ sent: number; failed: number }> => {
    const token = process.env.ZEPTO_API_TOKEN;
    const fromEmail = process.env.ZEPTO_FROM_EMAIL ?? "hr@ecultify.com";
    const fromName = process.env.ZEPTO_FROM_NAME ?? "HR Team";
    if (!token) throw new Error("ZEPTO_API_TOKEN is not configured");

    const { templateName, recipients } = await ctx.runQuery(
      internal.recruitment._loadSendContext,
      { candidateIds, templateId }
    );

    let sent = 0;
    let failed = 0;
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
      });

      if (ok) sent++;
      else failed++;
    }
    return { sent, failed };
  },
});
