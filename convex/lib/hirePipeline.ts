// The steps someone goes through once shortlisted, as data. Pipelines are named;
// positions and hiring rounds pick one (lib/pipelines.ts). A candidate's `stage`
// holds the name of the step they are at. Both sides read this file.
import { webLink } from "./links";

export const STEP_KINDS = {
  sourcing: "Sourcing",
  screening: "Screening",
  interview: "Interview",
  assignment: "Assignment",
  review: "Review",
  offer: "Offer",
  joining: "Joining",
  other: "Other",
} as const;
export type StepKind = keyof typeof STEP_KINDS;

export type Step = {
  /** Stays the same when a step is renamed or moved, so candidates follow it. */
  id: string;
  name: string;
  kind: StepKind;
  /** Who usually does it: the interviewer, the reviewer. */
  owner?: string;
  /** How long it should take. Moving someone in sets their next date from it. */
  days?: number;
  /** What to check, or the assignment itself. */
  note?: string;
  /** The assignment, a question sheet: anything worth opening at this step. */
  link?: string;
};

/** Ends of the road. Never steps of their own, whatever the pipeline. */
export const CLOSING = ["Joined", "Rejected", "Withdrawn", "On Hold"] as const;

export const STANDARD_STEPS: Step[] = [
  { id: "sourced", name: "Sourced", kind: "sourcing" },
  { id: "contacted", name: "Contacted", kind: "sourcing" },
  { id: "screening", name: "Screening", kind: "screening" },
  { id: "interview-1", name: "Interview 1", kind: "interview" },
  { id: "interview-2", name: "Interview 2", kind: "interview" },
  { id: "assignment", name: "Assignment", kind: "assignment" },
  { id: "review", name: "Final Review", kind: "review" },
  { id: "offer", name: "Offer", kind: "offer" },
  { id: "joining", name: "Joining", kind: "joining" },
];

export const MAX_STEPS = 15;

/** The pipeline everyone is on who has not been given another. */
export const STANDARD = "standard";

/** The first one picked that exists: a hiring round's, then its position's, then the role above it. */
export const pickPipeline = (known: { has(key: string): boolean }, ...picked: unknown[]): string =>
  picked.find((key): key is string => typeof key === "string" && known.has(key)) ?? STANDARD;

/** Where someone starts when shortlisted: screening, or the first step that is not sourcing. */
export const entryStep = (steps: readonly Step[]): Step =>
  steps.find((s) => s.kind === "screening") ?? steps.find((s) => s.kind !== "sourcing") ?? steps[0];

/** Has nothing happened with them yet: at the entry step, before it, or nowhere known. */
export const barelyStarted = (steps: readonly Step[], stage: string) =>
  steps.findIndex((s) => s.name === stage) <= steps.indexOf(entryStep(steps));

/**
 * The step a stage becomes in another pipeline: the one of the same name, else
 * the same kind at the same turn, else whatever the step before it becomes, so
 * nobody is sent back further than they have to be.
 */
export function fitStage(stage: string, from: readonly Step[], to: readonly Step[]): string {
  if ((CLOSING as readonly string[]).includes(stage)) return stage;
  const start = entryStep(to);
  const at = from.findIndex((s) => s.name === stage);
  if (at < 0) return to.some((s) => s.name === stage) ? stage : start.name;
  for (let i = at; i >= 0; i--) {
    const turn = from.slice(0, i).filter((s) => s.kind === from[i].kind).length;
    const alike = to.filter((s) => s.kind === from[i].kind);
    const hit = to.find((s) => s.name === from[i].name) ?? alike[Math.min(turn, alike.length - 1)];
    if (!hit) continue;
    // Someone past the start there is not put before it here.
    const past = i < at && at >= from.indexOf(entryStep(from)) && to.indexOf(hit) < to.indexOf(start);
    return past ? start.name : hit.name;
  }
  return start.name;
}

const RANK = Object.keys(STEP_KINDS) as StepKind[];

/** Step names of several pipelines in one row: the first as it is, and the others' steps beside steps of their kind. */
export function mergeNames(lists: readonly (readonly Step[])[]): string[] {
  const out: Step[] = [...(lists[0] ?? [])];
  for (const step of lists.slice(1).flat()) {
    if (out.some((s) => s.name === step.name)) continue;
    const at = out.findLastIndex((s) => RANK.indexOf(s.kind) <= RANK.indexOf(step.kind));
    out.splice(at + 1, 0, step);
  }
  return out.map((s) => s.name);
}

const clip = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A pipeline someone saved, checked and tidied. Throws a readable message on the first problem. */
export function cleanSteps(input: readonly Step[]): Step[] {
  if (input.length === 0) throw new Error("A pipeline needs at least one step");
  if (input.length > MAX_STEPS) throw new Error(`A pipeline has at most ${MAX_STEPS} steps`);
  const names = new Set<string>();
  const ids = new Set<string>();
  return input.map((raw) => {
    const name = clip(raw.name, 40);
    if (!name) throw new Error("Every step needs a name");
    if (CLOSING.some((c) => c.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" is where the pipeline ends, so it cannot be a step`);
    if (names.has(name.toLowerCase())) throw new Error(`Two steps are called "${name}"`);
    names.add(name.toLowerCase());
    if (!/^[a-z0-9-]{1,40}$/.test(raw.id) || ids.has(raw.id)) throw new Error(`"${name}" could not be saved. Remove it and add it again.`);
    ids.add(raw.id);
    if (!Object.prototype.hasOwnProperty.call(STEP_KINDS, raw.kind)) throw new Error(`Pick what kind of step "${name}" is`);
    const days = raw.days;
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) throw new Error(`${name}: days must be between 1 and 90`);
    const note = String(raw.note ?? "").trim().slice(0, 2000);
    const link = webLink(String(raw.link ?? "")).slice(0, 500);
    if (raw.link?.trim() && !link) throw new Error(`${name}: paste a full web address as its link`);
    return {
      id: raw.id,
      name,
      kind: raw.kind,
      ...(raw.owner ? { owner: raw.owner } : {}),
      ...(days ? { days } : {}),
      ...(note ? { note } : {}),
      ...(link ? { link } : {}),
    };
  });
}

/* ── The three questions ───────────────────────────────────── */

export type Shape = {
  screening: boolean;
  interviews: number;
  /** "none", "first" (before any interview), or after interview n. */
  assignment: "none" | "first" | number;
};

export function shapeOf(steps: readonly Step[]): Shape {
  const at = steps.findIndex((s) => s.kind === "assignment");
  const before = steps.slice(0, Math.max(at, 0)).filter((s) => s.kind === "interview").length;
  return {
    screening: steps.some((s) => s.kind === "screening"),
    interviews: steps.filter((s) => s.kind === "interview").length,
    assignment: at < 0 ? "none" : before === 0 ? "first" : before,
  };
}

/** A step of this kind with an id and a name nothing else in the pipeline has, nor
 *  anything taken out of it: people still at an old step must not turn up in a new one. */
export function newStep(steps: readonly Step[], kind: StepKind, name: string, gone: readonly Step[] = []): Step {
  const free = (make: (n: number) => string, taken: (x: string) => boolean) => {
    let n = 1;
    while (taken(make(n))) n++;
    return make(n);
  };
  return {
    id: free((n) => (n === 1 ? kind : `${kind}-${n}`), (id) => [...steps, ...gone].some((s) => s.id === id)),
    name: free((n) => (n === 1 ? name : `${name} (${n})`), (x) => steps.some((s) => s.name.toLowerCase() === x.toLowerCase())),
    kind,
  };
}

/**
 * Change a pipeline to fit the three answers, touching nothing they do not ask
 * about. `gone` is what was taken out of it, oldest first: asking for a step of
 * that kind again gives the same one back, with everything set on it.
 */
export function reshape(steps: readonly Step[], shape: Shape, gone: readonly Step[] = []): Step[] {
  let out = [...steps];
  const after = (...kinds: StepKind[]) => out.findLastIndex((s) => kinds.includes(s.kind)) + 1;
  const give = (kind: StepKind, name: string) =>
    gone.findLast((g) => g.kind === kind && !out.some((s) => s.id === g.id || s.name.toLowerCase() === g.name.toLowerCase())) ??
    newStep(out, kind, name, gone);

  if (!shape.screening) out = out.filter((s) => s.kind !== "screening");
  else if (!out.some((s) => s.kind === "screening")) out.splice(after("sourcing"), 0, give("screening", "Screening"));

  const interviews = () => out.filter((s) => s.kind === "interview");
  const extra = new Set(interviews().slice(shape.interviews));
  out = out.filter((s) => !extra.has(s));
  while (interviews().length < shape.interviews) {
    const at = after("interview") || after("sourcing", "screening", "assignment");
    out.splice(at, 0, give("interview", `Interview ${interviews().length + 1}`));
  }

  const want = typeof shape.assignment === "number" ? Math.min(shape.assignment, shape.interviews) || "first" : shape.assignment;
  if (want === shapeOf(out).assignment) return out;
  const there = out.filter((s) => s.kind === "assignment");
  out = out.filter((s) => s.kind !== "assignment");
  if (want === "none") return out;
  const first = out.findIndex((s) => s.kind === "interview");
  const at = want === "first" ? (first < 0 ? after("sourcing", "screening") : first) : out.indexOf(interviews()[want - 1]) + 1;
  out.splice(at, 0, ...(there.length ? there : [give("assignment", "Assignment")]));
  return out;
}

/** POS-007. The number is the position's own and is never given out again. */
export const positionCode = (sourceId: number) => `POS-${String(sourceId).padStart(3, "0")}`;
