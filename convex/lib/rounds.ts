// Which hiring round takes someone. Pure: the server places people by it, and
// Setup says beforehand where they would go.

type Round = { fields: Record<string, unknown> };
type Rounds = Iterable<readonly [string, Round]>;
/** What has to be known about teams: which exist, and which ones a position hires into. */
export type TeamRule = { isTeam: (id: string) => boolean; teamsOf: (job: number) => { teams: readonly string[] } };
/** A person's positions, nearest first: the role they named, their position, the one above it. */
export type Order = readonly (number | null | undefined)[];

/**
 * A team's own round suits its people best. One for nobody in particular takes
 * whoever its position hires for: anyone, in a position with no teams. Another
 * team's is never theirs, nor one team's for someone who is not decided.
 */
function suits(round: Round, job: number, team: string | undefined, rule: TeamRule): 0 | 1 | 2 {
  const { teams } = rule.teamsOf(job);
  const said = String(round.fields.team ?? "");
  const of = said && rule.isTeam(said) && (teams.length === 0 || teams.includes(said)) ? said : undefined;
  if (of && of === team) return 2;
  if (teams.length === 0) return !of || !team ? 1 : 0;
  if (of) return 0;
  return team ? (teams.includes(team) ? 1 : 0) : teams.length > 1 ? 1 : 0;
}

const isFor = (round: Round, job: number) => String(round.fields.job ?? "") === String(job);

/** The open round that takes someone: for the nearest of their positions that has one, the best suited, newest. */
export function openRound(rounds: Rounds, order: Order, team: string | undefined, rule: TeamRule): string | undefined {
  const open = [...rounds].filter(([, r]) => r.fields.hiringStatus === "Open");
  for (const job of order) {
    if (job == null) continue;
    let best: { id: string; by: number } | undefined;
    for (const [id, r] of open) {
      const by = isFor(r, job) ? suits(r, job, team, rule) : 0;
      if (by > 0 && by >= (best?.by ?? 0)) best = { id, by };
    }
    if (best) return best.id;
  }
}

/** Would this round take them, open or not, if people were put into it now? Not when another open one suits them better. */
export function takes([id, round]: readonly [string, Round], rounds: Rounds, order: Order, team: string | undefined, rule: TeamRule): boolean {
  const others = [...rounds].filter(([key, r]) => key !== id && r.fields.hiringStatus === "Open");
  for (const job of order) {
    if (job == null) continue;
    const here = isFor(round, job) ? suits(round, job, team, rule) : 0;
    const elsewhere = Math.max(0, ...others.map(([, r]) => (isFor(r, job) ? suits(r, job, team, rule) : 0)));
    if (here > 0 && here >= elsewhere) return true;
    if (here > 0 || elsewhere > 0) return false;
  }
  return false;
}
