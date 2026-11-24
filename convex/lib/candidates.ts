import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { RecruitAccess } from "./guards";
import { TRACKERS, type TrackerKey } from "./hrTrackers";

// Website applicants (recruitCandidates) becoming candidates (the `pipeline`
// tracker). Shortlisting someone on a position, and adding them to an open
// position by hand, both come through here.

/** Cleared rows are kept under this prefix: off every screen, but recoverable
 *  (hrOps.restoreArchived), and their IDs are never handed out again. */
export const ARCHIVED = "archived:";

/** Today's date in India, the way the trackers store dates. */
export const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

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
 */
export async function addToCandidates(
  ctx: MutationCtx,
  access: RecruitAccess,
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
    if (target && there.some((r) => r.fields.reqId === target._id)) continue;
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
      firstContact: today(),
      stage: START[c.stage ?? ""] ?? "Screening",
      status: "Active",
      hrOwner: access.userId,
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
