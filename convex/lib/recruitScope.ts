import { mayRecruitFor, type RecruitAccess } from "./guards";
import { TRACKERS, TRACKER_KEYS, isTracker, type Field, type Fields } from "./hrTrackers";

// Which tracker rows someone hiring for a few positions may see.

export type Slim = { _id: string; tracker: string; fields: Fields };

/** Is this row inside a scoped person's positions, given the rows already known to be? */
export function inScope(row: Omit<Slim, "_id">, access: RecruitAccess, seen: ReadonlySet<string>) {
  if (!isTracker(row.tracker) || TRACKERS[row.tracker].hrOnly) return false;
  if (row.tracker === "rounds") {
    return typeof row.fields.job === "string" && mayRecruitFor(access, Number(row.fields.job));
  }
  // A candidate with no open position yet belongs to the website position they
  // were shortlisted from. Once they have one, that decides.
  if (row.tracker === "pipeline" && !row.fields.reqId) {
    return typeof row.fields.job === "string" && mayRecruitFor(access, Number(row.fields.job));
  }
  // Everything else belongs to whatever it points at: a candidate to its open
  // position, an interview to its candidate.
  return (TRACKERS[row.tracker].fields as readonly Field[]).some(
    (f) => f.type === "ref" && seen.has(String(row.fields[f.key] ?? ""))
  );
}

/** The ids a scoped person may see. Trackers only point back at earlier ones
 *  (candidate -> round, interview -> candidate), so one pass in tracker order does it. */
export function scopeOf(rows: Slim[], access: RecruitAccess): Set<string> {
  const seen = new Set<string>();
  for (const tracker of TRACKER_KEYS) {
    for (const row of rows) {
      if (row.tracker === tracker && inScope(row, access, seen)) seen.add(row._id);
    }
  }
  return seen;
}
