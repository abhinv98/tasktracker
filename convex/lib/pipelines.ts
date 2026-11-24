import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { STANDARD, STANDARD_STEPS, pickPipeline, type Step } from "./hirePipeline";
import type { Fields } from "./hrTrackers";

// Pipelines are named. A position picks one, and a hiring round can pick another
// for the people in it. Nothing picked is the role above's, or the standard one.

type WithFields = { fields: Fields };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Which pipeline applies to whom, worked out from the stored rows. */
export function pipelineBook(
  rows: Doc<"recruitPipelines">[],
  allJobs: Doc<"recruitJobs">[],
  roundRows: Doc<"hrRecords">[]
) {
  const list = new Map<string, { name: string; steps: Step[]; updatedAt: number }>([
    [STANDARD, { name: "Standard", steps: STANDARD_STEPS, updatedAt: 0 }],
  ]);
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
    list.set(r.standard ? STANDARD : r._id, { name: r.name, steps: r.steps, updatedAt: r.updatedAt });
  }
  const rounds = new Map(roundRows.map((r) => [String(r._id), r]));
  // Removed ones last: a role made again under an old name is the one people are found under.
  const jobs = [...allJobs].sort((a, b) => Number(!!a.removedAt) - Number(!!b.removedAt));
  const job = (id: number | null | undefined) => jobs.find((j) => j.sourceId === id);

  const keyFor = (id: number | null | undefined, round?: Fields): string =>
    pickPipeline(list, round?.pipeline, job(id)?.pipeline, job(job(id)?.parentSourceId)?.pipeline);
  /** The website files people under the parent role, with the sub-role as text. A role
   *  that was removed counts only if it went together with the position above it. */
  const roleOf = (id: number, text: string) =>
    jobs.find((j) => j.parentSourceId === id && same(j.name, text) && (!j.removedAt || j.removedAt === job(id)?.removedAt));
  const roundOf = (row: WithFields) => rounds.get(String(row.fields.reqId ?? ""))?.fields;
  /** The position someone is being hired for: their hiring round's, else the one they applied for. */
  const jobOf = (row: WithFields): number | null => {
    const id = Number(roundOf(row)?.job || row.fields.job || NaN);
    if (Number.isNaN(id)) return null;
    return roundOf(row)?.job ? id : (roleOf(id, String(row.fields.roleOriginal ?? ""))?.sourceId ?? id);
  };
  /** The teams a position's people join: its own, else the role above it's. `of` is the position that says so. */
  const teamsOf = (id: number | null | undefined) => {
    const own = job(id);
    const says = own?.teams?.length ? own : job(own?.parentSourceId);
    return { of: says?.sourceId ?? null, teams: (says?.teams ?? []) as string[], divide: says?.divide === true };
  };
  const keyOf = (row: WithFields) => keyFor(jobOf(row), roundOf(row));
  const at = (key: string) => list.get(key)!.steps;
  return {
    list,
    jobs,
    rounds,
    roleOf,
    jobOf,
    teamsOf,
    keyFor,
    keyOf,
    /** The steps of a position, or of one hiring round for it. */
    stepsFor: (id: number | null | undefined, round?: Fields) => at(keyFor(id, round)),
    /** The steps of the person in a Candidates row. */
    stepsOf: (row: WithFields) => at(keyOf(row)),
  };
}

export type Pipelines = ReturnType<typeof pipelineBook>;

export async function loadPipelines(ctx: QueryCtx | MutationCtx): Promise<Pipelines> {
  return pipelineBook(
    await ctx.db.query("recruitPipelines").collect(),
    await ctx.db.query("recruitJobs").collect(),
    await ctx.db.query("hrRecords").withIndex("by_tracker", (q) => q.eq("tracker", "rounds")).collect()
  );
}

/** Positions that exist: not removed, nor under one that was. */
export const livePositions = <T extends Pick<Doc<"recruitJobs">, "sourceId" | "parentSourceId" | "removedAt">>(jobs: T[]): T[] => {
  const gone = new Set(jobs.filter((j) => j.removedAt).map((j) => j.sourceId));
  return jobs.filter((j) => !j.removedAt && !(j.parentSourceId != null && gone.has(j.parentSourceId)));
};
