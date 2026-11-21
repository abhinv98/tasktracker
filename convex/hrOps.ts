import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./lib/internalAuth";
import {
  TRACKERS,
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
// Access has two levels:
//   full     - HR and super admins: every tracker, the dashboard, and who
//              else gets in.
//   delegate - a brand manager or employee they have given recruitment
//              access (users.canRecruit): the hiring trackers only.

const fieldsValidator = v.record(v.string(), v.union(v.string(), v.number(), v.null()));

/** Who is asking and at which level, or null for someone with no way in. */
async function getAccess(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  const user = userId && (await ctx.db.get(userId));
  const full = !!user && (user.isHR === true || user.isSuperAdmin === true);
  return user && (full || user.canRecruit === true) ? { user, full } : null;
}

/** Mutations refuse outright. Queries use getAccess and answer null, so a page
 *  whose reader just lost access shows nothing instead of crashing. */
async function requireAccess(ctx: QueryCtx | MutationCtx) {
  const access = await getAccess(ctx);
  if (!access) throw new Error("Recruitment is HR only");
  return access;
}

function trackerFor(key: string, full: boolean): TrackerKey {
  if (!isTracker(key)) throw new Error("Unknown tracker");
  if (TRACKERS[key].hrOnly && !full) throw new Error("This tracker is HR only");
  return key;
}

/** Today's date in India, the way the trackers store dates. */
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** The next workbook-style ID for a tracker, given its rows: REQ-26-013 follows REQ-26-012. */
function codeAfter(rows: { code: string }[], tracker: TrackerKey) {
  const head = `${TRACKERS[tracker].prefix}-${today().slice(2, 4)}-`;
  const last = Math.max(
    0,
    ...rows.filter((r) => r.code.startsWith(head)).map((r) => Number(r.code.slice(head.length)) || 0)
  );
  return head + String(last + 1).padStart(3, "0");
}

const rowsOf = (ctx: MutationCtx, tracker: TrackerKey) =>
  ctx.db
    .query("hrRecords")
    .withIndex("by_tracker", (q) => q.eq("tracker", tracker))
    .collect();

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
    if (field.type === "user") {
      const id = ctx.db.normalizeId("users", value);
      const person = id && (await ctx.db.get(id));
      if (!person || person.role === "client") throw new Error(`${field.label}: pick a team member`);
    }
  }
}

/** Everything the caller may see, in one read: the screens work out health,
 *  counts and the dashboard from it (src/lib/hrHealth.ts). */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const access = await getAccess(ctx);
    if (!access) return null;
    const { full } = access;
    const rows = (await ctx.db.query("hrRecords").collect())
      .filter((r) => isTracker(r.tracker) && (full || !TRACKERS[r.tracker].hrOnly))
      .map((r) => ({ _id: r._id, tracker: r.tracker as TrackerKey, code: r.code, fields: r.fields }));
    const people = (await ctx.db.query("users").collect())
      .filter((u) => u.role !== "client" && u.isReviewer !== true)
      .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unnamed" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { full, rows, people };
  },
});

export const save = mutation({
  args: { tracker: v.string(), id: v.optional(v.id("hrRecords")), fields: fieldsValidator },
  handler: async (ctx, args) => {
    const { user, full } = await requireAccess(ctx);
    const tracker = trackerFor(args.tracker, full);
    const existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!existing || existing.tracker !== tracker)) throw new Error("Row not found");
    // An edit sends only what changed, laid over the row as it is now, so two
    // people editing different fields of one row do not undo each other.
    const fields = cleanFields(tracker, { ...existing?.fields, ...args.fields });
    await checkLinks(ctx, tracker, fields);
    for (const field of TRACKERS[tracker].fields as readonly Field[]) {
      if (field.stamp) fields[field.key] = today();
    }
    const now = Date.now();
    if (!existing) {
      return await ctx.db.insert("hrRecords", {
        tracker,
        code: codeAfter(await rowsOf(ctx, tracker), tracker),
        fields,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    // Values the form does not show (the link back to a website application)
    // ride along untouched.
    const known = new Set((TRACKERS[tracker].fields as readonly Field[]).map((x) => x.key));
    const hidden = Object.fromEntries(Object.entries(existing.fields).filter(([key]) => !known.has(key)));
    await ctx.db.patch(existing._id, { fields: { ...hidden, ...fields }, updatedAt: now });
    return existing._id;
  },
});

export const remove = mutation({
  args: { id: v.id("hrRecords") },
  handler: async (ctx, { id }) => {
    const { full } = await requireAccess(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    trackerFor(row.tracker, full);
    // A round with candidates, or a candidate with interviews, stays: deleting
    // it would leave those rows pointing at nothing.
    const others = await ctx.db.query("hrRecords").collect();
    const user = others.find((o) => Object.values(o.fields).includes(id));
    if (user) {
      const hrOnly = isTracker(user.tracker) && TRACKERS[user.tracker].hrOnly;
      // A delegate is not told about rows they cannot see.
      if (hrOnly && !full) throw new Error(`${row.code} is linked to an HR record. Ask HR to remove it.`);
      const label = isTracker(user.tracker) ? TRACKERS[user.tracker].label : user.tracker;
      throw new Error(`${row.code} is still used by ${user.code} in ${label}. Remove or re-point that first.`);
    }
    await ctx.db.delete(id);
  },
});

/** Put shortlisted website applicants into a hiring round's pipeline. */
export const addApplicants = mutation({
  args: { candidateIds: v.array(v.id("recruitCandidates")), roundId: v.id("hrRecords") },
  handler: async (ctx, { candidateIds, roundId }) => {
    const { user } = await requireAccess(ctx);
    const round = await ctx.db.get(roundId);
    if (!round || round.tracker !== "rounds") throw new Error("Hiring round not found");
    // Read once: each new row is added to this list, which keeps the IDs
    // running on and skips an applicant listed twice.
    const pipeline: { code: string; fields: Fields }[] = await rowsOf(ctx, "pipeline");
    let added = 0;
    for (const candidateId of candidateIds) {
      const c = await ctx.db.get(candidateId);
      if (!c) continue;
      if (pipeline.some((p) => p.fields.applicantId === candidateId && p.fields.reqId === roundId)) continue;
      const now = Date.now();
      const code = codeAfter(pipeline, "pipeline");
      pipeline.push({ code, fields: { applicantId: candidateId, reqId: roundId } });
      await ctx.db.insert("hrRecords", {
        tracker: "pipeline",
        code,
        fields: {
          name: c.name,
          reqId: roundId,
          roleOriginal: c.position,
          contact: [c.email, c.number].filter(Boolean).join(" · "),
          source: "Website",
          firstContact: today(),
          stage: "Screening",
          status: "Active",
          hrOwner: user._id,
          verification: "Verified",
          origin: "New",
          lastUpdate: today(),
          applicantId: candidateId,
          ...(c.resume ? { resume: c.resume } : {}),
        },
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      // The application itself moves to Shortlisted, unless HR already moved it on.
      if ((c.stage ?? "applied") === "applied") {
        await ctx.db.patch(candidateId, { stage: "screened", stageUpdatedAt: now });
        await ctx.db.insert("recruitActivity", {
          candidateId,
          kind: "stage",
          body: `Added to hiring round ${round.code}`,
          fromStage: "applied",
          toStage: "screened",
          authorId: user._id,
          authorName: user.name ?? user.email ?? "HR",
          createdAt: now,
        });
      }
      added++;
    }
    return { added, skipped: candidateIds.length - added };
  },
});

/* ── Who gets in ───────────────────────────────────────────── */

export const accessList = query({
  args: {},
  handler: async (ctx) => {
    const access = await getAccess(ctx);
    if (!access?.full) return null;
    return (await ctx.db.query("users").collect())
      .filter((u) => u.role !== "client" && u.isReviewer !== true)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? u.email ?? "Unnamed",
        email: u.email ?? "",
        designation: u.designation ?? "",
        role: u.role ?? "employee",
        // HR and super admins always have it; the switch is for everyone else.
        builtIn: u.isHR === true || u.isSuperAdmin === true,
        canRecruit: u.canRecruit === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setRecruitAccess = mutation({
  args: { userId: v.id("users"), allowed: v.boolean() },
  handler: async (ctx, { userId, allowed }) => {
    const { full } = await requireAccess(ctx);
    if (!full) throw new Error("Only HR and super admins manage recruitment access");
    const target = await ctx.db.get(userId);
    if (!target || target.role === "client" || target.isReviewer === true) throw new Error("Pick a team member");
    await ctx.db.patch(userId, { canRecruit: allowed });
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
    let added = 0;
    for (const row of rows) {
      if (!isTracker(row.tracker)) throw new Error(`Unknown tracker ${row.tracker}`);
      if (idOf.has(`${row.tracker}:${row.code}`)) continue;
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
