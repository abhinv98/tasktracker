"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui";
import { TRACKERS, type Field, type TrackerKey } from "@/convex/lib/hrTrackers";
import { toBook, todayIST, tone, type Book, type Row } from "@/lib/hrHealth";

/** What every HR tracker screen needs: the rows by tracker, the staff list and today's date. */
export type HrData = {
  full: boolean;
  /** The signed-in person's user id: "mine" filters and "@me" defaults use it. */
  me: string;
  book: Book;
  byId: Map<string, Row>;
  people: { _id: string; name: string }[];
  personName: (id: string) => string;
  /** Website positions a hiring round can be tied to (the caller's own, unless HR). */
  jobs: { id: string; name: string }[];
  today: string;
};

type Loaded = { full: boolean; me: string; rows: Row[]; people: { _id: string; name: string }[]; jobs: { id: string; name: string }[] };

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
    return {
      full: data.full,
      me: data.me,
      book: toBook(data.rows),
      byId: new Map(data.rows.map((r) => [r._id as string, r])),
      people: data.people,
      personName: (id: string) => names.get(id) ?? "",
      jobs: data.jobs,
      today,
    };
  }, [data, today]);
}

export const fieldsOf = (tracker: TrackerKey) => TRACKERS[tracker].fields as readonly Field[];

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
  const value = row.fields[field.key];
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "user") return data.personName(String(value));
  if (field.type === "job") return data.jobs.find((j) => j.id === String(value))?.name ?? "";
  if (field.type === "ref") {
    const target = data.byId.get(String(value));
    return target ? (field.ref === "rounds" ? `${target.code} · ${rowTitle(target, data)}` : rowTitle(target, data)) : "";
  }
  if (field.type === "date") return fmtDate(String(value), data.today);
  return String(value);
}

const TONE = { bad: "danger", warn: "warning", ok: "success", done: "neutral" } as const;

export function HealthBadge({ label }: { label: string }) {
  if (!label) return null;
  return <Badge variant={TONE[tone(label)]}>{label}</Badge>;
}
