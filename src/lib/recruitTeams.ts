// Positions as a tree under the teams their people join, and hiring rounds
// matched to positions by name. Pure: checked by scripts/recruitTeams.check.ts.

export type Team = { _id: string; name: string; color: string };

/** A position that hires into several teams is under each of them; one with none comes last, under null. */
export function byTeam<T>(positions: readonly T[], teams: readonly Team[], teamsOf: (p: T) => readonly string[]) {
  const groups: { team: Team | null; positions: T[] }[] = teams
    .map((team) => ({ team, positions: positions.filter((p) => teamsOf(p).includes(team._id)) }))
    .filter((g) => g.positions.length > 0);
  const none = positions.filter((p) => !teams.some((t) => teamsOf(p).includes(t._id)));
  return none.length ? [...groups, { team: null, positions: none }] : groups;
}

const WEIGHT: Record<string, number> = { jr: 0.25, sr: 0.25, junior: 0.25, senior: 0.25, intern: 2 };
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w))
  );
const weigh = (list: Iterable<string>) => [...list].reduce((n, w) => n + (WEIGHT[w] ?? 1), 0);

/** The position a hiring round is most likely for, going by its name. Undefined when nothing is close. */
export function guessPosition<T extends { name: string }>(role: string, positions: readonly T[]): T | undefined {
  const mine = words(role);
  const short = role.toLowerCase().replace(/[^a-z]/g, "");
  let best: { at: number; p: T } | undefined;
  for (const p of positions) {
    const theirs = words(p.name);
    const initials = p.name.split(/\s+/).map((w) => w[0]?.toLowerCase() ?? "").join("");
    const shared = weigh([...mine].filter((w) => theirs.has(w)));
    const at = initials.length > 1 && short === initials ? 1 : shared / weigh(new Set([...mine, ...theirs]));
    if (at > (best?.at ?? 0)) best = { at, p };
  }
  return best && best.at >= 0.5 ? best.p : undefined;
}
