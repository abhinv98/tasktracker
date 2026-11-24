import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "./lib/internalAuth";
import { canViewTask, mayRecruitFor, myCandidate, recruitAccess, recruitmentBriefView, visibleTasks, type RecruitAccess } from "./lib/guards";

// Work on candidates, as ordinary tasks. They live in recruitment briefs, one
// per open position plus a general one, so whoever gets one finds it in their
// own task list, and it shows on the candidate as well.

type Ctx = QueryCtx | MutationCtx;

const recruitmentBriefs = async (ctx: Ctx) =>
  (await ctx.db.query("briefs").withIndex("by_type_brand", (q) => q.eq("briefType", "recruitment")).collect()).filter(
    (b) => b.status !== "archived"
  );

/** What a task list shows. Only names, statuses and dates, never contact or pay. */
async function line(ctx: Ctx, t: Doc<"tasks">, access: RecruitAccess | null) {
  const [assignee, row] = await Promise.all([ctx.db.get(t.assigneeId), t.candidateId ? ctx.db.get(t.candidateId) : null]);
  return {
    _id: t._id,
    briefId: t.briefId,
    title: t.title,
    status: t.status,
    deadline: t.deadline ?? null,
    assigneeId: t.assigneeId,
    assignee: assignee?.name ?? assignee?.email ?? "Unassigned",
    candidateId: t.candidateId ?? null,
    candidate: row ? String(row.fields.name ?? "") : "",
    canOpen: !!row && !!access && !!(await myCandidate(ctx, row._id, access)),
  };
}
const byDue = (a: { status: string; deadline: number | null }, b: typeof a) =>
  Number(a.status === "done") - Number(b.status === "done") || (a.deadline ?? Infinity) - (b.deadline ?? Infinity);

/** The tasks about one candidate, open ones first. */
export const forCandidate = query({
  args: { candidateId: v.id("hrRecords") },
  handler: async (ctx, { candidateId }) => {
    const access = await recruitAccess(ctx);
    if (!access || !(await myCandidate(ctx, candidateId, access))) return [];
    const tasks = await ctx.db.query("tasks").withIndex("by_candidate", (q) => q.eq("candidateId", candidateId)).collect();
    const lines = tasks
      .filter((t) => !t.isHelper)
      // Someone hiring for one position may see a task HR keeps in a brief of its own, without opening it.
      .map(async (t) => ({ ...(await line(ctx, t, access)), canOpenTask: await canViewTask(ctx, access.user, t) }));
    return (await Promise.all(lines)).sort(byDue);
  },
});

/** One recruitment brief's tasks: all of them, or the caller's own (lib/guards.ts). */
export const forBrief = query({
  args: { briefId: v.id("briefs") },
  handler: async (ctx, { briefId }) => {
    const me = await getAuthUserId(ctx);
    const user = me ? await ctx.db.get(me) : null;
    const brief = await ctx.db.get(briefId);
    const view = user && brief?.briefType === "recruitment" ? await recruitmentBriefView(ctx, user, brief) : null;
    if (!user || !brief || !view) return null;
    const access = await recruitAccess(ctx);
    const all = (await ctx.db.query("tasks").withIndex("by_brief", (q) => q.eq("briefId", briefId)).collect()).filter((t) => !t.isHelper);
    const tasks = await visibleTasks(ctx, user, brief, all);
    const round = brief.hiringRoundId ? await ctx.db.get(brief.hiringRoundId) : null;
    return {
      manage: view === "all",
      round: round && view === "all" ? { _id: round._id, code: round.code, role: String(round.fields.role ?? "") } : null,
      tasks: (await Promise.all(tasks.map((t) => line(ctx, t, access)))).sort(byDue),
    };
  },
});

/** Open tasks across every recruitment brief the caller can see, soonest due first. */
export const open = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    const out = [];
    for (const brief of await recruitmentBriefs(ctx)) {
      if (brief.status === "on_hold") continue;
      const tasks = (await ctx.db.query("tasks").withIndex("by_brief", (q) => q.eq("briefId", brief._id)).collect()).filter(
        (t) => t.status !== "done" && !t.isHelper
      );
      for (const t of await visibleTasks(ctx, access.user, brief, tasks)) out.push(await line(ctx, t, access));
    }
    return out.sort(byDue);
  },
});

/** The recruitment brief for an open position (or the general one): found, or made.
 *  The general one is never somebody else's: HR's tasks stay among HR and super
 *  admins, and someone hiring for a few positions keeps one of their own. */
async function briefFor(ctx: MutationCtx, access: RecruitAccess, round: Doc<"hrRecords"> | null): Promise<Id<"briefs">> {
  for (const b of (await recruitmentBriefs(ctx)).reverse()) {
    if (b.hiringRoundId !== round?._id || b.status === "on_hold") continue;
    if ((await recruitmentBriefView(ctx, access.user, b)) !== "all") continue;
    const maker = round ? null : await ctx.db.get(b.createdBy);
    if (round || (!b.assignedManagerId && (access.full ? maker?.isHR === true || maker?.isSuperAdmin === true : b.createdBy === access.userId))) return b._id;
  }
  const top = await ctx.db.query("briefs").withIndex("by_priority").order("desc").first();
  const title = round ? `Hiring: ${String(round.fields.role ?? "")} (${round.code})` : "Recruitment tasks";
  const briefId = await ctx.db.insert("briefs", {
    title,
    description: "",
    status: "active",
    briefType: "recruitment",
    createdBy: access.userId,
    globalPriority: (top?.globalPriority ?? 0) + 1,
    ...(round ? { hiringRoundId: round._id } : {}),
  });
  await ctx.db.insert("activityLog", {
    briefId,
    userId: access.userId,
    action: "created_brief",
    details: JSON.stringify({ title, auto: true }),
    timestamp: Date.now(),
  });
  return briefId;
}

/** Give someone a task about a candidate (or about hiring in general). Without a
 *  brief it goes into the one for the candidate's open position. */
export const assign = mutation({
  args: {
    title: v.string(),
    assigneeId: v.id("users"),
    candidateId: v.optional(v.id("hrRecords")),
    briefId: v.optional(v.id("briefs")),
    deadline: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { title, assigneeId, candidateId, briefId, deadline, note }): Promise<Id<"tasks">> => {
    const access = await recruitAccess(ctx);
    if (!access) throw new Error("Recruitment is HR only");
    if (!title.trim()) throw new Error("Say what needs doing");
    const candidate = candidateId ? await myCandidate(ctx, candidateId, access) : null;
    if (candidateId && !candidate) throw new Error("Candidate not found");
    const roundId = ctx.db.normalizeId("hrRecords", String(candidate?.fields.reqId ?? ""));
    const round = roundId ? await ctx.db.get(roundId) : null;
    const mine = round && (access.full || mayRecruitFor(access, Number(round.fields.job))) ? round : null;
    return await ctx.runMutation(api.tasks.createTask, {
      briefId: briefId ?? (await briefFor(ctx, access, mine)),
      title: title.trim().slice(0, 200),
      assigneeId,
      ...(candidate ? { candidateId: candidate._id } : {}),
      ...(deadline !== undefined ? { deadline } : {}),
      ...(note?.trim() ? { description: note.trim().slice(0, 5000) } : {}),
    });
  },
});
