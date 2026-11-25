"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui";
import { STANDARD, STANDARD_STEPS, mergeNames, type Step } from "@/convex/lib/hirePipeline";
import { TRACKERS, type Field, type TrackerKey } from "@/convex/lib/hrTrackers";
import type { Team } from "@/lib/recruitTeams";
import { formatLpa, formatYears, parseCtcLpa, parseYears } from "@/lib/recruitParse";
import { toBook, todayIST, tone, type Book, type Row } from "@/lib/hrHealth";

/** What every HR tracker screen needs: the rows by tracker, the staff list and today's date. */
export type HrData = {
  full: boolean;
  /** Sees applicants' current and expected CTC. The server leaves them out for anyone else. */
  pay: boolean;
  /** The signed-in person's user id: "mine" filters and "@me" defaults use it. */
  me: string;
  book: Book;
  byId: Map<string, Row>;
  people: { _id: string; name: string }[];
  personName: (id: string) => string;
  /** Website positions a row can be tied to (the caller's own, unless HR). */
  jobs: Job[];
  today: string;
  /** The hiring pipelines there are to pick from, the standard one first. */
  pipelines: Pipeline[];
  pipelineName: (key: string | undefined) => string;
  teams: Team[];
  teamName: (id: string) => string;
  /** The position someone is hired for: their hiring round's, else the one they applied for, or the role under it they named. */
  positionOf: (fields: Record<string, unknown>) => Job | undefined;
  /** The teams a candidate could be for: their position's. */
  teamsOf: (row: Row) => string[];
  /** A position's live candidates that are one team's ("" for not decided). */
  inTeam: (job: string, team: string) => Row[];
  /** Is this row's position that one, or a role under it? */
  isAt: (row: Row, job: string) => boolean;
  /** The steps of a position's pipeline (the standard one without a position). */
  stepsFor: (job: string | null | undefined) => Step[];
  /** The steps of a candidate, or of everyone in an open position. */
  stepsOf: (row: Row) => Step[];
};

export type Pipeline = { key: string; name: string; steps: Step[] };
/** `teams`: the ones its people join, its own or the role above it's. */
type Job = { id: string; name: string; hrOwner?: string; hiringManager?: string; pipeline?: string; parent?: string; open?: boolean; teams?: string[]; divide?: boolean };
type Loaded = {
  full: boolean;
  pay?: boolean;
  me: string;
  rows: Row[];
  people: { _id: string; name: string }[];
  jobs: Job[];
  pipelines?: Pipeline[];
  teams?: Team[];
};

/** Rows handed in directly, for a preview or a test, instead of the live query. */
export const HrPreview = createContext<Loaded | null>(null);

export function useHrData(): HrData | undefined {
  const preview = useContext(HrPreview);
  const live = useQuery(api.hrOps.all, preview ? "skip" : {});
  // null (no access) reads as "still loading": the layout is already sending
  // that person back to their dashboard.
  const data: Loaded | undefined = preview ?? live ?? undefined;
  // Outside the memo, so a page left open overnight moves on to the new day.
  const today = todayIST();
  return useMemo(() => {
    if (!data) return undefined;
    const names = new Map(data.people.map((p) => [p._id as string, p.name]));
    const byId = new Map(data.rows.map((r) => [r._id as string, r]));
    const pipelines = data.pipelines ?? [{ key: STANDARD, name: "Standard", steps: STANDARD_STEPS }];
    const positionOf = (fields: Record<string, unknown>) => {
      const round = byId.get(String(fields.reqId ?? ""))?.fields;
      const id = String(round?.job || fields.job || "");
      // The website files people under the position, with a role under it as text.
      const role = round?.job ? undefined : data.jobs.find((j) => j.parent === id && j.name.toLowerCase() === String(fields.roleOriginal ?? "").trim().toLowerCase());
      return role ?? data.jobs.find((j) => j.id === id);
    };
    // A position's people include those of the roles under it.
    const sameOrAbove = (j: Job | undefined, id: string) => j?.id === id || (j?.parent === id && !!j);
    const at = (key: string | undefined) => pipelines.find((p) => p.key === key) ?? pipelines[0];
    return {
      full: data.full,
      pay: data.pay === true,
      me: data.me,
      book: toBook(data.rows),
      byId,
      people: data.people,
      personName: (id: string) => names.get(id) ?? "",
      jobs: data.jobs,
      today,
      teams: data.teams ?? [],
      teamName: (id) => data.teams?.find((t) => t._id === id)?.name ?? "",
      positionOf,
      inTeam: (job, team) =>
        data.rows.filter((r) => {
          const at = boardValue(r);
          return r.tracker === "pipeline" && (r.team ?? "") === team && at !== null && (at === "Joined" ? team !== "" : !CLOSED.includes(at)) && sameOrAbove(positionOf(r.fields), job);
        }),
      isAt: (row, job) => sameOrAbove(positionOf(row.fields), job),
      teamsOf: (row) => positionOf(row.fields)?.teams ?? [],
      pipelines,
      pipelineName: (key) => at(key).name,
      // The server has worked out which pipeline each of them is on (hrOps.all).
      stepsFor: (job) => at(data.jobs.find((j) => j.id === job)?.pipeline).steps,
      stepsOf: (row) => at(row.pipeline).steps,
    };
  }, [data, today]);
}

const CLOSED: readonly string[] = TRACKERS.pipeline.boardClosed;

export const fieldsOf = (tracker: TrackerKey) => TRACKERS[tracker].fields as readonly Field[];

/** The ones this person sees: amounts are for whoever sees pay. */
export const seenFields = (tracker: TrackerKey, data: HrData | undefined) =>
  // Approving a hiring round is HR's and the founders' (hrOps.save keeps it so).
  fieldsOf(tracker).filter((f) => (!f.pay || data?.pay) && !(tracker === "rounds" && f.key === "approvalStatus" && !data?.full));

/** Mine: I am named on it in any of its people fields (owner, interviewer, reviewer…). */
export const isMine = (row: Row, data: HrData) =>
  fieldsOf(row.tracker).some((f) => f.type === "user" && row.fields[f.key] === data.me);

/** The values a new row starts with: the tracker's defaults, "@me" and "@today" filled in. */
export function startingValues(tracker: TrackerKey, data: HrData, given: Record<string, string> = {}) {
  const draft: Record<string, string> = {};
  for (const f of fieldsOf(tracker)) {
    const value = given[f.key] || (f.initial === "@me" ? data.me : f.initial === "@today" ? data.today : f.initial);
    if (value) draft[f.key] = value;
  }
  return draft;
}

/**
 * What changes when a row moves to another column of its board. A candidate
 * moved to a closing stage (Rejected, Joined…) takes that as their status too,
 * and one moved back into play becomes Active again.
 */
export function moveFields(tracker: TrackerKey, to: string): Record<string, string> {
  const meta = TRACKERS[tracker] as { board?: string; boardClosed?: readonly string[] };
  if (!meta.board) return {};
  if (tracker !== "pipeline") return { [meta.board]: to };
  return { stage: to, status: meta.boardClosed?.includes(to) ? to : "Active" };
}

/**
 * Which board column a row sits in. A candidate closed by status (Withdrawn,
 * say) belongs with the closed ones even if their stage was never moved, and an
 * archived one is off the board. "" means the row has no column yet.
 */
export function boardValue(row: Row): string | null {
  const meta = TRACKERS[row.tracker] as { board?: string; boardClosed?: readonly string[] };
  if (!meta.board) return null;
  const value = String(row.fields[meta.board] ?? "");
  if (row.tracker !== "pipeline") return value;
  const status = String(row.fields.status ?? "");
  if (status === "Archived") return null;
  return meta.boardClosed?.includes(status) ? status : value;
}

/** The steps a list of candidates goes through between them, in one order. */
export function stepNames(rows: readonly Row[], data: HrData): string[] {
  const lists = [...new Set(rows.map((r) => data.stepsOf(r)))];
  return mergeNames(lists.length ? lists : [data.stepsFor(null)]);
}

/** YYYY-MM-DD some days after another. */
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/** What a row is called: its title column, followed through to the candidate or round it points at. */
export function rowTitle(row: Row | undefined, data: HrData): string {
  if (!row) return "";
  const field = fieldsOf(row.tracker).find((f) => f.key === TRACKERS[row.tracker].title);
  const value = row.fields[TRACKERS[row.tracker].title];
  if (field?.type === "ref") return rowTitle(data.byId.get(String(value ?? "")), data);
  return value === null || value === undefined ? "" : String(value);
}

/** 2026-11-21 -> "21 Nov", with the year when it is not this one. */
export function fmtDate(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "2-digit" }),
  });
}

/** One cell's value as text. */
export function show(field: Field, row: Row, data: HrData): string {
  // Nothing picked still means one applies: its position's.
  const value = field.type === "pipeline" ? row.pipeline : field.type === "team" ? row.team : row.fields[field.key];
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "user") return data.personName(String(value));
  // A removed position is not on the list: what they applied for is still known.
  if (field.type === "job") return data.jobs.find((j) => j.id === String(value))?.name ?? String(row.fields.roleOriginal ?? "");
  if (field.type === "ref") {
    const target = data.byId.get(String(value));
    return target ? (field.ref === "rounds" ? `${target.code} · ${rowTitle(target, data)}` : rowTitle(target, data)) : "";
  }
  if (field.type === "pipeline") return data.pipelineName(String(value));
  if (field.type === "team") return data.teamName(String(value));
  if (field.type === "date") return fmtDate(String(value), data.today);
  if (field.as === "lpa") return formatLpa(parseCtcLpa(String(value)));
  if (field.as === "years") return formatYears(parseYears(String(value)));
  return String(value);
}

const TONE = { bad: "danger", warn: "warning", ok: "success", done: "neutral" } as const;

export function HealthBadge({ label }: { label: string }) {
  if (!label) return null;
  return <Badge variant={TONE[tone(label)]}>{label}</Badge>;
}
