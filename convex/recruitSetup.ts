import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { mayRecruitFor, myCandidate, recruitAccess, type RecruitAccess } from "./lib/guards";
import { REMOVED, moveRow, moveToPosition, refit, rowsOf, settleTeams, standing, today, withTeam } from "./lib/candidates";
import { CLOSING, STANDARD, cleanSteps, fitStage, positionCode, type Step } from "./lib/hirePipeline";
import { livePositions, loadPipelines, type Pipelines } from "./lib/pipelines";
import type { Fields } from "./lib/hrTrackers";

// Positions, and the pipelines people go through in them. HR and super admins only,
// except moving applicants, which anyone hiring may do between their own positions.
// The website's application form lists exactly the positions that are open here
// (recruitment.openPositions).

async function requireFull(ctx: MutationCtx | QueryCtx): Promise<RecruitAccess> {
  const access = await recruitAccess(ctx);
  if (!access?.full) throw new ConvexError("Only HR and super admins can do this");
  return access;
}

const bySource = (ctx: MutationCtx | QueryCtx, id: number) =>
  ctx.db.query("recruitJobs").withIndex("by_source", (q) => q.eq("sourceId", id)).first();

async function livePosition(ctx: MutationCtx, id: number) {
  const job = await bySource(ctx, id);
  const all = await ctx.db.query("recruitJobs").collect();
  if (!job || !livePositions(all).some((j) => j._id === job._id)) throw new ConvexError("That position no longer exists");
  return job;
}

const STATUS = v.union(v.literal("new"), v.literal("shortlisted"), v.literal("on_hold"), v.literal("rejected"));
type Status = "new" | "shortlisted" | "on_hold" | "rejected";
/** MUST match positionStatus in src/lib/recruitStages.ts. */
const statusOf = (c: Doc<"recruitCandidates">): Status => {
  const s = c.stage ?? "applied";
  return s === "applied" ? "new" : s === "on_hold" || s === "rejected" ? s : "shortlisted";
};

const isClosed = (round: { fields: Fields }) => String(round.fields.hiringStatus ?? "").startsWith("Closed");
const without = (fields: Fields, key: string): Fields => Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key));

/** Everything the setup screen shows. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access?.full) return null;
    const book = await loadPipelines(ctx);
    const { jobs, list } = book;
    const teams = (await ctx.db.query("teams").collect())
      .map((t) => ({ _id: t._id, name: t.name, color: t.color }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const onlyLive = (ids: readonly string[]) => teams.filter((t) => ids.includes(t._id)).map((t) => t._id);
    const live = new Set(livePositions(jobs).map((j) => j._id));
    // Each person under what they are for: a role's are the role's (as recruitment.listJobs counts them).
    const roleIds = new Map(livePositions(jobs).filter((j) => j.parentSourceId != null).map((j) => [`${j.parentSourceId} ${j.name.trim().toLowerCase()}`, j.sourceId]));
    const counts = new Map<number, Record<Status, number>>();
    for (const c of await ctx.db.query("recruitCandidates").collect()) {
      const at = roleIds.get(`${c.jobSourceId} ${c.position.trim().toLowerCase()}`) ?? c.jobSourceId;
      const n = counts.get(at) ?? { new: 0, shortlisted: 0, on_hold: 0, rejected: 0 };
      n[statusOf(c)]++;
      counts.set(at, n);
    }
    // People in play, by pipeline and step: what a change to its steps would touch.
    const inPlay = new Map<string, Map<string, number>>();
    for (const row of await ctx.db.query("hrRecords").withIndex("by_tracker", (q) => q.eq("tracker", "pipeline")).collect()) {
      if (standing(row.fields) !== "Active") continue;
      const at = inPlay.get(book.keyOf(row)) ?? new Map<string, number>();
      const stage = String(row.fields.stage ?? "");
      inPlay.set(book.keyOf(row), at.set(stage, (at.get(stage) ?? 0) + 1));
    }
    const picked = (key: unknown) => (typeof key === "string" && list.has(key) ? key : "");
    return {
      teams,
      pipelines: [...list].map(([key, p]) => ({
        key,
        ...p,
        // Step names can be anything, so they travel as pairs rather than as keys.
        inPlay: [...(inPlay.get(key) ?? [])].map(([stage, n]) => ({ stage, n })),
      })),
      rounds: [...book.rounds.values()]
        .filter((r) => !isClosed(r))
        .map((r) => ({
          _id: r._id,
          code: r.code,
          role: String(r.fields.role ?? ""),
          status: String(r.fields.hiringStatus ?? ""),
          job: r.fields.job ? Number(r.fields.job) : null,
          /** The one picked for it, and the one that applies. */
          pipeline: picked(r.fields.pipeline),
          uses: book.keyFor(Number(r.fields.job), r.fields),
        }))
        .sort((a, b) => b.code.localeCompare(a.code)),
      positions: jobs
        .map((j) => ({
          id: j.sourceId,
          code: positionCode(j.sourceId),
          name: j.name,
          description: j.description,
          parent: j.parentSourceId ?? null,
          open: j.status !== "closed",
          closesOn: j.closesOn ?? "",
          hrOwner: (j.hrOwner ?? "") as string,
          hiringManager: (j.hiringManager ?? "") as string,
          removed: !live.has(j._id),
          removedAt: j.removedAt ?? null,
          counts: counts.get(j.sourceId) ?? { new: 0, shortlisted: 0, on_hold: 0, rejected: 0 },
          pipeline: picked(j.pipeline),
          uses: book.keyFor(j.sourceId),
          /** The teams picked for it, and the ones that apply. */
          teams: onlyLive(j.teams ?? []),
          usesTeams: onlyLive(book.teamsOf(j.sourceId).teams),
          divide: book.teamsOf(j.sourceId).divide,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/* ── Positions ─────────────────────────────────────────────── */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Plain text: names are shown on the website and dropped into emails. */
const plain = (s: string | undefined, max: number) => (s ?? "").replace(/[<>"\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Create a position, or change one. A new one gets the next ID, and is on the
 * website form straight away unless told not to. A change sends only what
 * changed, so two people editing one position do not undo each other.
 */
export const savePosition = mutation({
  args: {
    id: v.optional(v.number()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Only when creating: the role it sits under. Its applicants file under that role. */
    parent: v.optional(v.union(v.number(), v.null())),
    open: v.optional(v.boolean()),
    closesOn: v.optional(v.string()),
    hrOwner: v.optional(v.union(v.id("users"), v.null())),
    hiringManager: v.optional(v.union(v.id("users"), v.null())),
    /** "" is the role above it's, or the standard one. */
    pipeline: v.optional(v.string()),
    /** A main position's. A role under it joins the same. */
    teams: v.optional(v.array(v.id("teams"))),
    divide: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFull(ctx);
    const before = await loadPipelines(ctx);
    const job = args.id === undefined ? null : await livePosition(ctx, args.id);
    const name = args.name === undefined && job ? job.name : plain(args.name, 80);
    if (!name) throw new ConvexError("Give the position a name");
    if (args.pipeline && !before.list.has(args.pipeline)) throw new ConvexError("That pipeline no longer exists");
    if (args.closesOn && !DATE.test(args.closesOn)) throw new ConvexError("Last day to apply must be a date");
    for (const who of [args.hrOwner, args.hiringManager]) {
      const user = who ? await ctx.db.get(who) : null;
      if (who && (!user || user.role === "client" || user.isReviewer === true)) throw new ConvexError("Pick a team member");
    }
    for (const t of args.teams ?? []) if (!(await ctx.db.get(t))) throw new ConvexError("That team no longer exists");
    if (!job || !same(job.name, name)) freeName(before.jobs, name);
    const open = args.open ?? job?.status !== "closed";
    const closesOn = args.closesOn ?? job?.closesOn ?? "";
    if (open && closesOn && closesOn < today() && (args.open || args.closesOn)) {
      throw new ConvexError("The last day to apply has already passed");
    }
    // A role joins its position's teams.
    const says = job ? before.teamsOf(job.sourceId).of === job.sourceId : args.parent == null;
    const patch = {
      ...(args.open === undefined ? {} : { status: args.open ? ("open" as const) : ("closed" as const) }),
      ...(args.description === undefined ? {} : { description: args.description.replace(/[<>\u0000-\u0008]/g, " ").trim().slice(0, 2000) }),
      ...(args.closesOn === undefined ? {} : { closesOn: args.closesOn || undefined }),
      ...(args.hrOwner === undefined ? {} : { hrOwner: args.hrOwner ?? undefined }),
      ...(args.hiringManager === undefined ? {} : { hiringManager: args.hiringManager ?? undefined }),
      ...(args.pipeline === undefined ? {} : { pipeline: args.pipeline || undefined }),
      ...(args.teams === undefined || !says ? {} : { teams: args.teams.length ? [...new Set(args.teams)] : undefined }),
      ...(args.divide === undefined || !says ? {} : { divide: args.divide || undefined }),
    };
    if (!job) {
      if (args.parent != null && (await livePosition(ctx, args.parent)).parentSourceId != null) {
        throw new ConvexError("A role can only sit under a main position");
      }
      // Above the IDs brought over from the old system, and past every removed one.
      const id = Math.max(1000, ...before.jobs.map((j) => j.sourceId)) + 1;
      await ctx.db.insert("recruitJobs", {
        sourceId: id,
        name,
        formUrl: "",
        parentSourceId: args.parent ?? null,
        status: "open",
        createdAt: Date.now(),
        description: "",
        ...patch,
      });
      // Anyone who already carries this role's name is under it now.
      return { id, code: positionCode(id), moved: await refit(ctx, before), divided: (await settleTeams(ctx)).get(id) ?? 0 };
    }
    await ctx.db.patch(job._id, patch);
    // Before a rename: people are found under a sub-role by its name.
    let moved = await refit(ctx, before);
    if (job.name !== name) {
      const named = await loadPipelines(ctx);
      await ctx.db.patch(job._id, { name });
      await renamed(ctx, job, name);
      moved += await refit(ctx, named);
    }
    return { id: job.sourceId, code: positionCode(job.sourceId), moved, divided: (await settleTeams(ctx)).get(job.sourceId) ?? 0 };
  },
});

/** Two positions with one name cannot be told apart on the website form. */
function freeName(jobs: Doc<"recruitJobs">[], name: string) {
  const twin = livePositions(jobs).find((j) => same(j.name, name));
  if (twin) throw new ConvexError(`There is already a position called ${twin.name} (${positionCode(twin.sourceId)})`);
}

/** People carry the role they applied for as text; it follows a rename. */
async function renamed(ctx: MutationCtx, job: Doc<"recruitJobs">, name: string) {
  const filedUnder = job.parentSourceId ?? job.sourceId;
  for (const c of await ctx.db.query("recruitCandidates").withIndex("by_job", (q) => q.eq("jobSourceId", filedUnder)).collect()) {
    if (same(c.position, job.name)) await ctx.db.patch(c._id, { position: name });
  }
  for (const row of await rowsOf(ctx, "pipeline")) {
    if (row.fields.job === String(filedUnder) && same(String(row.fields.roleOriginal ?? ""), job.name)) {
      await ctx.db.patch(row._id, { fields: { ...row.fields, roleOriginal: name } });
    }
  }
}

/** Off the website the day after their last day to apply. Runs daily. */
export const closePositions = internalMutation({
  args: {},
  handler: async (ctx) => {
    let closed = 0;
    for (const j of await ctx.db.query("recruitJobs").collect()) {
      if (!j.removedAt && j.status !== "closed" && j.closesOn && j.closesOn < today()) {
        await ctx.db.patch(j._id, { status: "closed" });
        closed++;
      }
    }
    return { closed };
  },
});

/* ── Which team someone is for ─────────────────────────────── */

/** Say which team shortlisted people are for, where their position hires into
 *  several (null: not decided). Their own positions', for someone hiring for a few. */
export const setTeam = mutation({
  args: {
    candidateIds: v.array(v.id("recruitCandidates")),
    team: v.union(v.id("teams"), v.null()),
    /** The position it is said for. What they are in another position is not touched. */
    position: v.number(),
  },
  handler: async (ctx, { candidateIds, team, position }) => {
    const access = await recruitAccess(ctx);
    if (!access) throw new ConvexError("Recruitment is HR only");
    const book = await loadPipelines(ctx);
    const root = (id: number | null) => book.jobs.find((j) => j.sourceId === id)?.parentSourceId ?? id;
    const ids = new Set<string>(candidateIds);
    let set = 0;
    for (const row of await rowsOf(ctx, "pipeline")) {
      if (!ids.has(String(row.fields.applicantId ?? "")) || standing(row.fields) !== "Active") continue;
      if (!access.full && !(await myCandidate(ctx, row._id, access))) continue;
      const job = book.jobOf(row);
      if (root(job) !== root(position)) continue;
      const { teams } = book.teamsOf(job);
      if (team !== null && teams.length > 0 && !teams.includes(team)) throw new ConvexError(`${String(row.fields.name ?? "Their")}: that position does not hire into this team`);
      if ((book.teamOf(row) ?? null) === team) continue;
      await ctx.db.patch(row._id, { fields: withTeam(row, team ?? undefined, book), updatedAt: Date.now() });
      set++;
    }
    await settleTeams(ctx);
    return { set };
  },
});

/* ── Joining a team ────────────────────────────────────────── */

/** Whether someone being hired has an account here yet, by the email they will
 *  sign in with, and whether it is on their team. Accounts are made by invite
 *  (users.createInvite) and put on a team with teams.addUserToTeam. */
export const joiner = query({
  args: { candidateId: v.id("hrRecords"), email: v.string() },
  handler: async (ctx, { candidateId, email }) => {
    const access = await recruitAccess(ctx);
    const row = access?.full ? await ctx.db.get(candidateId) : null;
    if (!row || row.tracker !== "pipeline") return null;
    const typed = email.trim().toLowerCase();
    const user = typed ? (await ctx.db.query("users").collect()).find((u) => u.email?.trim().toLowerCase() === typed && u.role !== "client" && u.isReviewer !== true) : undefined;
    const team = ctx.db.normalizeId("teams", (await loadPipelines(ctx)).teamOf(row) ?? "");
    const member =
      user && team
        ? await ctx.db.query("userTeams").withIndex("by_user_team", (q) => q.eq("userId", user._id).eq("teamId", team)).first()
        : null;
    return { userId: user?._id ?? null, name: user?.name ?? user?.email ?? "", inTeam: !!member };
  },
});

/* ── Moving people ─────────────────────────────────────────── */

/** Put applicants under another position. Both positions must be the caller's. */
export const moveApplicants = mutation({
  args: { candidateIds: v.array(v.id("recruitCandidates")), to: v.number() },
  handler: async (ctx, { candidateIds, to }) => {
    const access = await recruitAccess(ctx);
    if (!access) throw new ConvexError("Recruitment is HR only");
    const target = await livePosition(ctx, to);
    const people = [];
    for (const id of new Set(candidateIds)) {
      const c = await ctx.db.get(id);
      if (!c) continue;
      if (!mayRecruitFor(access, c.jobSourceId)) throw new ConvexError("You do not have access to this position");
      people.push(c);
    }
    const filedUnder = target.parentSourceId ?? target.sourceId;
    if (!mayRecruitFor(access, to) || !mayRecruitFor(access, filedUnder)) throw new ConvexError("You do not have access to that position");
    // Someone who had applied there too now has two applications in it.
    const there = new Set(
      (await ctx.db.query("recruitCandidates").withIndex("by_job", (q) => q.eq("jobSourceId", filedUnder)).collect()).map((c) => c.email.toLowerCase())
    );
    const twice = people.filter((c) => c.jobSourceId !== filedUnder && c.email && there.has(c.email.toLowerCase())).length;
    const mine = async (row: Doc<"hrRecords">) => access.full || !!(await myCandidate(ctx, row._id, access));
    const moved = await moveToPosition(ctx, people, target, access.user, await loadPipelines(ctx), mine);
    await settleTeams(ctx);
    return { moved, twice };
  },
});

/** Everything that hangs off a position and the roles under it. A role's people are filed under the position above it, by name. */
async function family(ctx: MutationCtx | QueryCtx, id: number) {
  const all = await ctx.db.query("recruitJobs").collect();
  const self = all.find((j) => j.sourceId === id);
  const jobs = all.filter((j) => j.sourceId === id || (j.parentSourceId === id && !j.removedAt));
  const ids = new Set(jobs.map((j) => j.sourceId));
  const parent = self?.parentSourceId ?? null;
  /** Is someone filed here? */
  const here = (job: unknown, role: unknown) =>
    ids.has(Number(job)) || (parent !== null && Number(job) === parent && same(String(role ?? ""), self!.name));
  const applicants = [];
  for (const jobId of new Set([...ids, ...(parent === null ? [] : [parent])])) {
    for (const c of await ctx.db.query("recruitCandidates").withIndex("by_job", (q) => q.eq("jobSourceId", jobId)).collect()) {
      if (here(c.jobSourceId, c.position)) applicants.push(c);
    }
  }
  const records = await ctx.db.query("hrRecords").collect();
  const rounds = records.filter((r) => r.tracker === "rounds" && ids.has(Number(r.fields.job ?? NaN)));
  const roundIds = new Set(rounds.map((r) => String(r._id)));
  const inRound = (r: { fields: Fields }) => roundIds.has(String(r.fields.reqId ?? ""));
  const pipeline = records.filter((r) => r.tracker === "pipeline" && (inRound(r) || here(r.fields.job, r.fields.roleOriginal)));
  // Being hired in another position's round: that one goes on deciding, whatever they applied for.
  const others = new Set(records.filter((r) => r.tracker === "rounds" && r.fields.job && !ids.has(Number(r.fields.job))).map((r) => String(r._id)));
  const elsewhere = (r: { fields: Fields }) => others.has(String(r.fields.reqId ?? ""));
  return { self, jobs, ids, parent, here, inRound, elsewhere, applicants, rounds, pipeline };
}

/** What removing a position would touch, for the box that asks first. */
export const removalInfo = query({
  args: { id: v.number() },
  handler: async (ctx, { id }) => {
    const access = await recruitAccess(ctx);
    if (!access?.full) return null;
    const f = await family(ctx, id);
    const counts: Record<Status, number> = { new: 0, shortlisted: 0, on_hold: 0, rejected: 0 };
    for (const c of f.applicants) counts[statusOf(c)]++;
    const templates = (await ctx.db.query("recruitTemplates").collect()).filter((t) => f.ids.has(t.jobSourceId)).length;
    const campaigns = (await ctx.db.query("recruitCampaigns").collect()).filter((c) => f.ids.has(c.jobSourceId)).length;
    const people = (await ctx.db.query("users").collect()).filter((u) => u.recruitJobs?.some((j) => f.ids.has(j)));
    return {
      counts,
      total: f.applicants.length,
      roles: f.jobs.filter((j) => j.sourceId !== id).map((j) => j.name),
      /** For a role: the position its people stay under. */
      under: f.parent === null ? "" : ((await bySource(ctx, f.parent))?.name ?? ""),
      rounds: f.rounds.filter((r) => !isClosed(r)).map((r) => r.code),
      inPlay: f.pipeline.filter((r) => standing(r.fields) === "Active" && !f.elsewhere(r)).length,
      templates,
      campaigns,
      people: people.map((u) => u.name ?? u.email ?? "Someone"),
    };
  },
});

/**
 * Take a position (and the roles under it) off the website and out of every
 * list. Its applicants go to another position, the ones picked, with everything
 * that was working on them; or they stay with it, set aside. Nothing is deleted:
 * the position can be restored, and its ID is never used again.
 */
export const removePosition = mutation({
  args: { id: v.number(), moveTo: v.union(v.number(), v.null()), statuses: v.array(STATUS) },
  handler: async (ctx, { id, moveTo, statuses }) => {
    const access = await requireFull(ctx);
    const job = await livePosition(ctx, id);
    const f = await family(ctx, id);
    const book = await loadPipelines(ctx);
    const now = Date.now();
    const gone = new Set<string>(); // applications that went elsewhere
    let moved = 0;
    if (moveTo !== null) {
      if (f.ids.has(moveTo)) throw new ConvexError("Pick a position that is not being removed");
      const target = await livePosition(ctx, moveTo);
      const filedUnder = target.parentSourceId ?? target.sourceId;
      // Its hiring rounds go too, and the people in them keep their round.
      const from = { ...book, kept: new Set(f.rounds.map((r) => String(r._id))) };
      for (const r of f.rounds) {
        await ctx.db.patch(r._id, { fields: { ...r.fields, job: String(target.sourceId) }, updatedAt: now });
      }
      const going = f.applicants.filter((c) => statuses.includes(statusOf(c)));
      for (const c of going) gone.add(c._id);
      moved = await moveToPosition(ctx, going, target, access.user, from, async () => true);
      // People on Candidates who did not come from the website come too.
      for (const row of f.pipeline) {
        if (row.fields.applicantId || !f.here(row.fields.job, row.fields.roleOriginal)) continue;
        await ctx.db.patch(row._id, { fields: moveRow(row, target, from, Number(row.fields.job)), updatedAt: now });
      }
      // ponytail: meetings are rewritten whole, transcripts included; page this if one position ever files hundreds.
      for (const jobId of f.ids) {
        for (const t of await ctx.db.query("recruitTemplates").withIndex("by_job", (q) => q.eq("jobSourceId", jobId)).collect()) {
          await ctx.db.patch(t._id, { jobSourceId: filedUnder });
        }
        for (const c of await ctx.db.query("recruitCampaigns").withIndex("by_job", (q) => q.eq("jobSourceId", jobId)).collect()) {
          await ctx.db.patch(c._id, { jobSourceId: filedUnder });
        }
        for (const m of await ctx.db.query("echoMeetings").withIndex("by_recruit_job", (q) => q.eq("recruitJobSourceId", jobId)).collect()) {
          await ctx.db.patch(m._id, { recruitJobSourceId: filedUnder });
        }
      }
    } else {
      for (const r of f.rounds) {
        if (isClosed(r)) continue;
        // What it was before rides along, so restoring the position opens it again.
        const fields = { ...r.fields, hiringStatus: "Closed - Cancelled", closedFrom: `${REMOVED}:${r.fields.hiringStatus ?? "Open"}`, lastUpdate: today() };
        await ctx.db.patch(r._id, { fields, updatedAt: now });
      }
    }
    for (const row of f.pipeline) {
      if (standing(row.fields) !== "Active" || f.elsewhere(row)) continue;
      if (!f.here(row.fields.job, row.fields.roleOriginal)) {
        // Applied for something else and was only in a round of this one: back to where they applied,
        // or aside with that, if it was removed before.
        if (moveTo !== null) continue;
        const there = book.jobs.find((j) => j.sourceId === Number(row.fields.job));
        const aside = there?.removedAt ? { status: "Archived", closedFrom: REMOVED, lastUpdate: today() } : {};
        await ctx.db.patch(row._id, { fields: { ...outOfRound(row, book), ...aside } as Fields, updatedAt: now });
      } else if (f.parent === null && (moveTo === null || (row.fields.applicantId && !gone.has(String(row.fields.applicantId))))) {
        // Stays with the removed position: off the board until it is restored, or they are moved.
        const fields = moveTo === null ? row.fields : outOfRound(row, book);
        await ctx.db.patch(row._id, { fields: { ...fields, status: "Archived", closedFrom: REMOVED, lastUpdate: today() }, updatedAt: now });
      } else if (f.parent !== null && f.inRound(row) && !gone.has(String(row.fields.applicantId ?? "")) && (moveTo === null || row.fields.applicantId)) {
        // A role's people stay under the position above it.
        await ctx.db.patch(row._id, { fields: outOfRound(row, book), updatedAt: now });
      }
    }
    for (const u of await ctx.db.query("users").collect()) {
      const left = u.recruitJobs?.filter((j) => !f.ids.has(j));
      if (left && left.length !== u.recruitJobs!.length) {
        await ctx.db.patch(u._id, left.length ? { recruitJobs: left } : { recruitJobs: undefined, recruitPay: undefined });
      }
    }
    for (const j of f.jobs) await ctx.db.patch(j._id, { status: "closed", removedAt: now, removedBy: access.userId });
    // Whoever else is in rounds that went is hired for another position now; a role's people are under the one above it.
    await refit(ctx, book);
    await settleTeams(ctx);
    return { moved, left: f.applicants.length - moved, name: job.name };
  },
});

/** A Candidates row without its hiring round, at the matching step of the position they applied for. */
function outOfRound(row: { fields: Fields }, book: Pipelines): Fields {
  const fields = without(row.fields, "reqId");
  return { ...fields, stage: fitStage(String(fields.stage ?? ""), book.stepsOf(row), book.stepsOf({ fields })) };
}

/** Bring a removed position back, closed on the website until HR opens it, with the
 *  people and rounds that were set aside with it. People moved away stay where they went. */
export const restorePosition = mutation({
  args: { id: v.number() },
  handler: async (ctx, { id }) => {
    await requireFull(ctx);
    const job = await bySource(ctx, id);
    if (!job?.removedAt) return;
    const all = await ctx.db.query("recruitJobs").collect();
    if (job.parentSourceId != null && all.find((j) => j.sourceId === job.parentSourceId)?.removedAt) {
      throw new ConvexError("Restore the position it sits under first");
    }
    // The roles that went with it come back with it.
    const back = all.filter((j) => j._id === job._id || (j.parentSourceId === id && j.removedAt === job.removedAt));
    for (const j of back) freeName(all, j.name);
    const book = await loadPipelines(ctx);
    for (const j of back) await ctx.db.patch(j._id, { removedAt: undefined, removedBy: undefined });
    await refit(ctx, book);
    const ids = new Set(back.map((j) => j.sourceId));
    const now = Date.now();
    for (const r of await rowsOf(ctx, "rounds")) {
      const was = String(r.fields.closedFrom ?? "");
      if (!ids.has(Number(r.fields.job ?? NaN)) || !was.startsWith(`${REMOVED}:`)) continue;
      // Only if nobody has touched its status since.
      const fields = without(r.fields, "closedFrom");
      if (fields.hiringStatus === "Closed - Cancelled") fields.hiringStatus = was.slice(REMOVED.length + 1);
      await ctx.db.patch(r._id, { fields, updatedAt: now });
    }
    for (const row of await rowsOf(ctx, "pipeline")) {
      if (row.fields.closedFrom !== REMOVED || !ids.has(Number(row.fields.job))) continue;
      await ctx.db.patch(row._id, { fields: { ...without(row.fields, "closedFrom"), status: "Active", lastUpdate: today() }, updatedAt: now });
    }
    await settleTeams(ctx);
  },
});

/* ── Pipelines ─────────────────────────────────────────────── */

const STEP = v.object({
  id: v.string(),
  name: v.string(),
  kind: v.union(
    v.literal("sourcing"), v.literal("screening"), v.literal("interview"), v.literal("assignment"),
    v.literal("review"), v.literal("offer"), v.literal("joining"), v.literal("other")
  ),
  owner: v.optional(v.id("users")),
  days: v.optional(v.number()),
  note: v.optional(v.string()),
  link: v.optional(v.string()),
});

/** The stored row behind a pipeline's key. The standard one has none until it is first changed. */
async function pipelineRow(ctx: MutationCtx, key: string): Promise<Doc<"recruitPipelines"> | null> {
  if (key === STANDARD) return (await ctx.db.query("recruitPipelines").collect()).find((r) => r.standard) ?? null;
  const id = ctx.db.normalizeId("recruitPipelines", key);
  const row = id && (await ctx.db.get(id));
  if (!row || row.standard) throw new ConvexError("That pipeline no longer exists");
  return row;
}

/**
 * Save a pipeline, or with no `key` make a new one. People on it follow a renamed
 * step. A step that goes must say where the people in play at it go (`moves`:
 * step id -> step id); anyone already closed is fitted quietly.
 */
export const savePipeline = mutation({
  args: {
    key: v.union(v.string(), v.null()),
    name: v.string(),
    steps: v.array(STEP),
    moves: v.record(v.string(), v.string()),
    /** `updatedAt` of the version these steps were made from. */
    from: v.optional(v.number()),
  },
  handler: async (ctx, { key, steps: input, moves, from, ...args }) => {
    const access = await requireFull(ctx);
    const book = await loadPipelines(ctx);
    const row = key === null ? null : await pipelineRow(ctx, key);
    // The whole list is saved at once, so someone else's change in between would be lost.
    if (key !== null && (row?.updatedAt ?? 0) !== (from ?? 0)) {
      throw new ConvexError("Someone else changed this pipeline while you had it open. Load their version, then make your change again.");
    }
    const name = key === STANDARD ? "Standard" : plain(args.name, 60);
    if (!name) throw new ConvexError("Give the pipeline a name");
    const twin = [...book.list].find(([k, p]) => k !== key && same(p.name, name));
    if (twin) throw new ConvexError(`There is already a pipeline called ${twin[1].name}`);
    let steps: Step[];
    try {
      steps = cleanSteps(input);
    } catch (err) {
      throw new ConvexError(err instanceof Error ? err.message : "These steps could not be saved");
    }
    for (const s of steps) {
      const owner = s.owner ? ctx.db.normalizeId("users", s.owner) : null;
      const user = owner ? await ctx.db.get(owner) : null;
      if (s.owner && (!user || user.role === "client" || user.isReviewer === true)) throw new ConvexError(`${s.name}: pick a team member`);
    }
    const now = Date.now();
    const doc = { name, steps: steps as Doc<"recruitPipelines">["steps"], updatedAt: now, updatedBy: access.userId };
    if (key === null) return { key: (await ctx.db.insert("recruitPipelines", doc)) as string, moved: 0, updatedAt: now };

    const before = book.list.get(key)!.steps;
    const to = new Map<string, string>(); // old step name -> new one
    for (const old of before) {
      const target = steps.find((s) => s.id === old.id) ?? steps.find((s) => s.id === moves[old.id]);
      if (target) to.set(old.name, target.name);
    }
    let moved = 0;
    for (const person of await rowsOf(ctx, "pipeline")) {
      const stage = String(person.fields.stage ?? "");
      if (book.keyOf(person) !== key || (CLOSING as readonly string[]).includes(stage)) continue;
      const live = standing(person.fields) === "Active";
      const next = to.get(stage) ?? (steps.some((s) => s.name === stage) ? stage : null);
      if (next === null && live && before.some((s) => s.name === stage)) {
        throw new ConvexError(`People are still at "${stage}". Say which step they go to.`);
      }
      const fitted = next ?? fitStage(stage, before, steps);
      if (fitted === stage) continue;
      await ctx.db.patch(person._id, { fields: { ...person.fields, stage: fitted }, updatedAt: now });
      if (live) moved++;
    }
    if (row) await ctx.db.patch(row._id, doc);
    else await ctx.db.insert("recruitPipelines", { ...doc, standard: true });
    return { key, moved, updatedAt: now };
  },
});

/** A pipeline goes. What used it is back on its position's, or the standard one, and people take the matching step. */
export const deletePipeline = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireFull(ctx);
    if (key === STANDARD) throw new ConvexError("The standard pipeline stays. It is what everything else falls back on.");
    const row = await pipelineRow(ctx, key);
    const before = await loadPipelines(ctx);
    for (const j of before.jobs) if (j.pipeline === key) await ctx.db.patch(j._id, { pipeline: undefined });
    for (const r of before.rounds.values()) {
      if (r.fields.pipeline === key) await ctx.db.patch(r._id, { fields: without(r.fields, "pipeline"), updatedAt: Date.now() });
    }
    await ctx.db.delete(row!._id);
    return { moved: await refit(ctx, before) };
  },
});

/** Which pipeline a position, or one hiring round, uses. "" is whatever it would have without one. */
export const setPipeline = mutation({
  args: { position: v.optional(v.number()), round: v.optional(v.id("hrRecords")), key: v.string() },
  handler: async (ctx, { position, round, key }) => {
    await requireFull(ctx);
    const before = await loadPipelines(ctx);
    if (key && !before.list.has(key)) throw new ConvexError("That pipeline no longer exists");
    if (position !== undefined) {
      await ctx.db.patch((await livePosition(ctx, position))._id, { pipeline: key || undefined });
    }
    if (round) {
      const row = await ctx.db.get(round);
      if (!row || row.tracker !== "rounds") throw new ConvexError("That hiring round no longer exists");
      await ctx.db.patch(round, {
        fields: key ? { ...row.fields, pipeline: key } : without(row.fields, "pipeline"),
        updatedAt: Date.now(),
      });
    }
    return { moved: await refit(ctx, before) };
  },
});
