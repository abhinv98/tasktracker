import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { STANDARD, STANDARD_STEPS, pickPipeline, type Step } from "./hirePipeline";
import { standing, type Fields } from "./hrTrackers";
import { openRound, type Order, type TeamRule } from "./rounds";

// Pipelines are named. A position picks one, and a hiring round can pick another
// for the people in it. Nothing picked is the role above's, or the standard one.

type WithFields = { fields: Fields };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Which pipeline applies to whom, worked out from the stored rows. */
export function pipelineBook(
  rows: Doc<"recruitPipelines">[],
  allJobs: Doc<"recruitJobs">[],
  roundRows: Doc<"hrRecords">[],
  /** The teams there are. Left out, every team counts. */
  teamIds?: readonly string[]
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
  const isTeam = (id: string) => !teamIds || teamIds.includes(id);
  const roundOf = (row: WithFields) => rounds.get(String(row.fields.reqId ?? ""))?.fields;
  /** The position someone is being hired for: their hiring round's, else the one they applied for. */
  const jobOf = (row: WithFields): number | null => {
    const id = Number(roundOf(row)?.job || row.fields.job || NaN);
    if (Number.isNaN(id)) return null;
    return roundOf(row)?.job ? id : (roleOf(id, String(row.fields.roleOriginal ?? ""))?.sourceId ?? id);
  };
  /** The teams a position's people join. A role under it joins the same. `of` is the position that says so. */
  const teamsOf = (id: number | null | undefined) => {
    const own = job(id);
    const says = job(own?.parentSourceId) ?? own;
    return { of: says?.sourceId ?? null, teams: ((says?.teams ?? []) as string[]).filter(isTeam), divide: says?.divide === true };
  };
  const rule: TeamRule = { isTeam, teamsOf };
  /** A team, if it exists and this position hires into it (or says nothing about teams). What it
   *  does not hire into is ignored, never erased: ticked again, everyone is where they were. */
  const valid = (id: number | null | undefined, team: unknown): string | undefined => {
    const t = String(team ?? "");
    const { teams } = teamsOf(id);
    return t && isTeam(t) && (teams.length === 0 || teams.includes(t)) ? t : undefined;
  };
  /** Their hiring round's team, if it is one team's. A round tied to no position says nothing until it is. */
  const roundTeam = (row: WithFields): string | undefined => {
    const round = roundOf(row);
    return round?.job ? valid(Number(round.job), round.team) : undefined;
  };
  /**
   * Whose someone is, the one answer everywhere: what is stored on them, else
   * their position's only team. Their round does not decide it: settleTeams keeps
   * the two in step. Undefined is not decided (or a position with no team).
   */
  const teamOf = (row: WithFields): string | undefined => {
    const job = jobOf(row);
    const { teams } = teamsOf(job);
    return valid(job, row.fields.team) ?? (teams.length === 1 ? teams[0] : undefined);
  };
  /** The team someone takes along to another position: theirs, if it is hired into there too. Nothing is stored that was only worked out, where there is one team or none. */
  const carried = (row: WithFields, to: number | null): string | undefined => {
    const had = teamOf(row);
    return had && valid(to, had) && (teamsOf(to).teams.length > 1 || row.fields.team === had) ? had : undefined;
  };
  /** The positions whose rounds could take someone, nearest first. */
  const orderOf = (id: number, text: string): Order => [roleOf(id, text)?.sourceId, id, job(id)?.parentSourceId];
  const keyOf = (row: WithFields) => keyFor(jobOf(row), roundOf(row));
  const at = (key: string) => list.get(key)!.steps;
  return {
    list,
    jobs,
    rounds,
    roleOf,
    jobOf,
    teamsOf,
    valid,
    teamOf,
    carried,
    roundTeam,
    rule,
    orderOf,
    /** The open round that would take the person in a Candidates row, were they this team's. Being hired in another position's round: one of that position's. */
    roundFor: (row: WithFields, team: string | undefined) => {
      const own = orderOf(Number(row.fields.job), String(row.fields.roleOriginal ?? ""));
      const now = jobOf(row);
      return openRound(rounds, now === null || own.includes(now) ? own : [now, job(now)?.parentSourceId], team, rule);
    },
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
    await ctx.db.query("hrRecords").withIndex("by_tracker", (q) => q.eq("tracker", "rounds")).collect(),
    (await ctx.db.query("teams").collect()).map((t) => t._id)
  );
}

/** Positions that exist: not removed, nor under one that was. */
export const livePositions = <T extends Pick<Doc<"recruitJobs">, "sourceId" | "parentSourceId" | "removedAt">>(jobs: T[]): T[] => {
  const gone = new Set(jobs.filter((j) => j.removedAt).map((j) => j.sourceId));
  return jobs.filter((j) => !j.removedAt && !(j.parentSourceId != null && gone.has(j.parentSourceId)));
};
