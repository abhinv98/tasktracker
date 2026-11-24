"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, ChevronDown, ChevronUp, ExternalLink, FileText, Pause, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button, useToast } from "@/components/ui";
import { plainMessage } from "@/components/ui/Toast";
import { fieldClass } from "@/components/ui/classes";
import { Tray } from "@/components/ui/Tray";
import { POSITION_STATUSES, positionStatus, type PositionStatus, type Stage } from "@/lib/recruitStages";
import type { Narrow } from "@/lib/applicantSearch";
import { formatLpa, formatNotice, formatYears, parseCtcLpa, parseNoticeDays, parseYears } from "@/lib/recruitParse";
import type { Row } from "@/lib/hrHealth";
import { boardValue, type HrData } from "./hrShared";

export type Applicant = Doc<"recruitCandidates"> & { jobName?: string };

/* ── Moving someone ────────────────────────────────────────── */

const DONE: Record<PositionStatus, string> = {
  new: "back to New", shortlisted: "shortlisted", on_hold: "put on hold", rejected: "rejected",
};

/** Change people's status, with the result as a toast. True when it went through. */
export function useMoveApplicants() {
  const setStage = useMutation(api.recruitment.setStage);
  const { toast } = useToast();
  /** `team`: whose they are shortlisted for, where the position hires into several. */
  return async (ids: Id<"recruitCandidates">[], to: PositionStatus, who?: string, team?: string) => {
    try {
      const { updated, added, teamed } = await setStage({
        candidateIds: ids,
        stage: POSITION_STATUSES.find((s) => s.value === to)!.stage,
        ...(team && to === "shortlisted" ? { team: team as Id<"teams"> } : {}),
      });
      const subject = ids.length === 1 && who ? who : `${updated}`;
      toast(
        "success",
        !updated && !added && teamed
          ? `${teamed === 1 && who ? who : teamed} ${teamed === 1 ? "has" : "have"} their team now`
          : updated || added
          ? `${subject} ${DONE[to]}${to === "shortlisted" && added ? `. ${added === 1 ? "Now" : `${added} now`} on Candidates` : ""}`
          : "Nothing to change"
      );
      return true;
    } catch (err) {
      const why = err instanceof ConvexError ? String(err.data) : plainMessage(err instanceof Error ? err.message : "");
      toast("error", who && !why.includes(who) ? `${who}: ${why}` : why);
      return false;
    }
  };
}

const ICONS = { shortlisted: Check, on_hold: Pause, rejected: X } as const;
const VERB = { shortlisted: "Shortlist", on_hold: "Hold", rejected: "Reject" } as const;
export const DECISIONS = ["shortlisted", "on_hold", "rejected"] as const;
const ON = {
  shortlisted: "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]",
  on_hold: "border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]",
  rejected: "border-[var(--danger)] bg-[var(--danger-dim)] text-[var(--danger)]",
} as const;

/** The three decisions. The current one is filled; pressing it again takes the person back to New. */
export function Decide({
  stage,
  name,
  onMove,
  large = false,
}: {
  stage?: Stage | null;
  name: string;
  onMove: (to: PositionStatus) => void;
  large?: boolean;
}) {
  const now = positionStatus(stage);
  return (
    <div role="group" aria-label={`Decision on ${name}`} className="flex gap-1">
      {DECISIONS.map((d) => {
        const Icon = ICONS[d];
        const on = now === d;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            title={on ? `${VERB[d]}: on. Press to take back to New` : VERB[d]}
            onClick={(e) => {
              e.stopPropagation();
              onMove(on ? "new" : d);
            }}
            className={`inline-flex items-center gap-1 rounded-control border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
              large ? "h-control px-3 text-[13px]" : "h-7 px-2 text-[12px]"
            } ${on ? ON[d] : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"}`}
          >
            <Icon size={large ? 14 : 12} aria-hidden />
            {VERB[d]}
            {large && <kbd className="ml-1 text-[11px] font-normal opacity-60">{VERB[d][0]}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Narrowing a list ──────────────────────────────────────── */

/** The last value a live query gave, so a list stays on screen while the next one
 *  loads. A different `of` is a different list: nothing of the old one is kept. */
export function useLast<T>(value: T | undefined, of = ""): T | undefined {
  const [last, setLast] = useState({ value, of });
  if (value !== undefined ? value !== last.value || of !== last.of : of !== last.of) setLast({ value, of });
  return value ?? (last.of === of ? last.value : undefined);
}

/** Experience, pay and notice, in one small panel. */
export function NarrowTray({ value, onChange, pay }: { value: Narrow; onChange: (n: Narrow) => void; pay: boolean }) {
  const on = [value.years, value.expected, value.notice].filter(Boolean).length;
  return (
    <Tray icon={SlidersHorizontal} active={on > 0} label={on ? `Filters · ${on}` : "Filters"} width="w-60">
      <div className="flex flex-col gap-2.5 p-2">
        {(
          [
            ["years", "At least this many years", "3"],
            ["expected", "Expects at most (₹ LPA)", "8"],
            ["notice", "Notice of at most (days)", "30"],
          ] as const
        )
          .filter(([key]) => pay || key !== "expected")
          .map(([key, label, hint]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
            <input
              type="number"
              min="0"
              value={value[key]}
              placeholder={hint}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              className={`${fieldClass} w-full tabular-nums`}
            />
          </label>
        ))}
        {on > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...value, years: "", expected: "", notice: "" })}
            className="self-start text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
          >
            Clear these
          </button>
        )}
      </div>
    </Tray>
  );
}

/* ── The table ─────────────────────────────────────────────── */

type SortKey = "name" | "years" | "current" | "expected" | "notice" | "added";
const PAGE = 100;
const dash = <span className="text-[var(--text-disabled)]">–</span>;

/** Where each applicant is on Candidates, by application. */
export function placesOf(data: HrData | undefined, job?: string): Map<string, Place> {
  const places = new Map<string, Place>();
  // Someone can be in more than one position's round: here, what they are in this one.
  const last = (r: Row) => Number(!!job && !!data?.isAt(r, job));
  for (const r of [...(data?.book.pipeline ?? [])].sort((a, b) => last(a) - last(b))) {
    if (typeof r.fields.applicantId !== "string" || boardValue(r) === null) continue;
    places.set(r.fields.applicantId, { id: r._id, stage: boardValue(r) || "Candidates", team: r.team ?? "", here: !job || !!data?.isAt(r, job) });
  }
  return places;
}
/** `here`: for the position asked about, not another one. */
type Place = { id: string; stage: string; team: string; here: boolean };

/** The old form kept no dates until 22 May 2026. Everyone without one came before that (cultform's ids run in order). */
export const UNDATED = "Before 22 May 26";
const added = (ts?: number | null) =>
  ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "";

/** People who applied, with the decision on each row. Sorts in place; tick rows to act on several. */
export function ApplicantsTable({
  rows,
  roleColumn,
  selected,
  onSelect,
  onOpen,
  onMove,
  places,
  teams,
  pay,
  highlight,
}: {
  rows: Applicant[];
  /** What the second column says: the role within a position, or the position itself. */
  roleColumn: { label: string; of: (a: Applicant) => string } | null;
  selected: ReadonlySet<string>;
  onSelect: (ids: Set<string>) => void;
  /** Opens someone, with the list as it is on screen so the panel can step through it. */
  onOpen: (id: Id<"recruitCandidates">, order: Id<"recruitCandidates">[]) => void;
  onMove: (a: Applicant, to: PositionStatus) => void;
  places: ReadonlyMap<string, Place>;
  /** Where a position hires into several teams: whose each shortlisted person is, and a way to say. */
  teams?: { options: { _id: string; name: string }[]; divide: boolean; onPick: (a: Applicant, team: string) => void };
  /** Shows what they earn and expect. Off for whoever HR has not given it to. */
  pay: boolean;
  highlight?: string | null;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "added", dir: -1 });
  const [showing, setShowing] = useState(PAGE);

  // Parse once, then sort on the parsed numbers: sorting the raw strings
  // would put "900000 LPA" above "9 LPA" despite being the same salary.
  const sorted = useMemo(() => {
    const parsed = rows.map((a) => ({
      a,
      years: parseYears(a.experience),
      current: parseCtcLpa(a.currentCtc),
      expected: parseCtcLpa(a.expectedCtc),
      notice: parseNoticeDays(a.noticePeriod),
      // No date means before there were any.
      added: a.createdAt ?? 0,
    }));
    return parsed.sort((x, y) => {
      if (sort.key === "name") return x.a.name.localeCompare(y.a.name) * sort.dir;
      const [m, n] = [x[sort.key], y[sort.key]];
      // Missing values always sink, whichever way the column is sorted.
      if (m == null || n == null) return Number(m == null) - Number(n == null);
      return (m - n) * sort.dir;
    });
  }, [rows, sort]);

  const shown = sorted.slice(0, showing);
  const order = sorted.map((r) => r.a._id);
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r._id));
  const heads: { key: SortKey | null; label: string; right?: boolean }[] = [
    { key: "name", label: "Applicant" },
    ...(roleColumn ? [{ key: null, label: roleColumn.label }] : []),
    { key: "years", label: "Exp", right: true },
    ...(pay
      ? [
          { key: "current" as const, label: "Current", right: true },
          { key: "expected" as const, label: "Expects", right: true },
        ]
      : []),
    { key: "notice", label: "Notice", right: true },
    { key: "added", label: "Applied", right: true },
    { key: null, label: "CV" },
    { key: null, label: "Decision" },
  ];
  const TD = "px-3 py-2 text-[13px] text-[var(--text-secondary)]";
  const NUM = `${TD} whitespace-nowrap text-right tabular-nums`;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={() => onSelect(allOn ? new Set() : new Set(rows.map((r) => r._id)))}
                  aria-label={`Select all ${rows.length}`}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--text-primary)]"
                />
              </th>
              {heads.map((h) => {
                const on = h.key !== null && sort.key === h.key;
                return (
                  <th
                    key={h.label}
                    aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    className={`h-8 whitespace-nowrap px-3 text-[12px] font-medium text-[var(--text-muted)] ${h.right ? "text-right" : "text-left"}`}
                  >
                    {h.key ? (
                      <button
                        type="button"
                        onClick={() => setSort((s) => ({ key: h.key!, dir: s.key === h.key ? (s.dir === 1 ? -1 : 1) : h.key === "name" ? 1 : -1 }))}
                        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--text-primary)] ${on ? "text-[var(--text-primary)]" : ""}`}
                      >
                        {h.label}
                        {on && (sort.dir === 1 ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)}
                      </button>
                    ) : (
                      h.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ a, years, current, expected, notice }) => {
              const place = places.get(a._id);
              return (
                <tr
                  key={a._id}
                  className={`border-b border-[var(--border-subtle)] transition-colors last:border-0 ${
                    highlight === a._id ? "bg-[var(--accent-admin-dim)]" : selected.has(a._id) ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-primary)]"
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(a._id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (!next.delete(a._id)) next.add(a._id);
                        onSelect(next);
                      }}
                      aria-label={`Select ${a.name}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--text-primary)]"
                    />
                  </td>
                  {/* Capped: a few people pasted a whole paragraph as their name. */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onOpen(a._id, order)}
                      title={a.name}
                      className="block max-w-[300px] truncate text-left text-[13px] font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                    >
                      {a.name}
                    </button>
                    <span className="block max-w-[300px] truncate text-[12px] text-[var(--text-muted)]" title={`${a.email} ${a.number}`}>
                      {[a.email, a.number].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  {roleColumn && (
                    <td className={TD}>
                      <div className="max-w-[160px] truncate" title={roleColumn.of(a)}>
                        {roleColumn.of(a) || dash}
                      </div>
                    </td>
                  )}
                  <td className={NUM}>{years == null ? dash : formatYears(years)}</td>
                  {pay && (
                    <>
                      <td className={NUM}>{current == null ? dash : formatLpa(current)}</td>
                      <td className={`${NUM} text-[var(--text-primary)]`}>{expected == null ? dash : formatLpa(expected)}</td>
                    </>
                  )}
                  <td className={NUM}>{notice == null ? dash : formatNotice(notice)}</td>
                  <td className={`${NUM} text-[12px] text-[var(--text-muted)]`}>{added(a.createdAt) || UNDATED}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-1">
                      {(
                        [
                          [a.resume, "Open résumé", FileText],
                          [a.portfolioLink, "Open portfolio", ExternalLink],
                        ] as const
                      ).map(
                        ([href, label, Icon]) =>
                          href && (
                            <a
                              key={label}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              title={label}
                              aria-label={`${label}: ${a.name}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            >
                              <Icon size={14} />
                            </a>
                          )
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Decide stage={a.stage} name={a.name} onMove={(to) => onMove(a, to)} />
                    {place && positionStatus(a.stage) === "shortlisted" && (
                      <span className="mt-1 flex items-center gap-2">
                        <Link
                          href={`/recruitment/t/pipeline?open=${place.id}`}
                          className="text-[12px] text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
                        >
                          On Candidates: {place.stage}
                        </Link>
                        {teams && place.here && (
                          <select
                            value={place.team ?? ""}
                            aria-label={`Team for ${a.name}`}
                            onChange={(e) => teams.onPick(a, e.target.value)}
                            className={`h-6 rounded-md border bg-white px-1 text-[12px] ${place.team ? "border-[var(--border)] text-[var(--text-secondary)]" : "border-[var(--accent-admin)] text-[var(--accent-admin-text)]"}`}
                          >
                            {/* Where people are divided, nobody stays undecided. */}
                            {(!teams.divide || !place.team) && <option value="">Team not decided</option>}
                            {teams.options.map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > shown.length && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-3 py-2">
          <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
            Showing {shown.length} of {sorted.length.toLocaleString()}
          </span>
          <Button variant="secondary" onClick={() => setShowing((n) => n + PAGE)}>
            Show {Math.min(PAGE, sorted.length - shown.length)} more
          </Button>
        </div>
      )}
    </div>
  );
}
