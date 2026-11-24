"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ATTENTION, health, type Row } from "@/lib/hrHealth";
import type { HrData } from "./hrShared";

const isClosed = (r: Row) => String(r.fields.hiringStatus ?? "").startsWith("Closed");
/** "none": candidates who are in no round. */
export const NO_ROUND = "none";

/**
 * The hiring rounds down the side of Candidates. Pick one and its candidates
 * are beside it. The number is everyone in it, as the list shows them.
 */
export function RoundsRail({ data, value, onPick }: { data: HrData; value: string; onPick: (id: string) => void }) {
  const people = data.book.pipeline;
  const count = (id: string) => people.filter((c) => String(c.fields.reqId ?? "") === id).length;
  const rounds = data.book.rounds.map((r) => ({ r, n: count(r._id) }));
  const running = rounds
    .filter(({ r }) => !isClosed(r))
    .sort((a, b) => Number(b.r.fields.hiringStatus === "Open") - Number(a.r.fields.hiringStatus === "Open") || b.n - a.n || b.r.code.localeCompare(a.r.code));
  const closed = rounds.filter(({ r }) => isClosed(r)).sort((a, b) => b.r.code.localeCompare(a.r.code));
  const [folded, setFolded] = useState(true);
  const showClosed = !folded || closed.some(({ r }) => r._id === value);

  const item = (id: string, title: string, n: number, sub?: string, warn?: boolean) => (
    <li key={id || "all"}>
      <button
        type="button"
        aria-current={value === id ? "true" : undefined}
        onClick={() => onPick(id)}
        className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
          value === id ? "bg-white shadow-[inset_0_0_0_1px_var(--border-strong)]" : "hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] first-letter:uppercase ${value === id ? "font-semibold" : "font-medium"} text-[var(--text-primary)]`}>{title}</span>
          {sub && <span className={`block truncate text-[12px] ${warn ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{sub}</span>}
        </span>
        <span className="shrink-0 pt-px text-[12px] tabular-nums text-[var(--text-secondary)]">{n}</span>
      </button>
    </li>
  );
  const round = ({ r, n }: { r: Row; n: number }) => {
    const label = health(r, data.book, data.today);
    const flag = !isClosed(r) && (!r.fields.job ? "not tied to a position" : ATTENTION.rounds.includes(label) ? label.toLowerCase() : "");
    return item(r._id, String(r.fields.role ?? r.code), n, [r.code, flag || String(r.fields.hiringStatus ?? "")].filter(Boolean).join(" · "), !!flag);
  };

  return (
    <nav aria-label="Hiring rounds" className="hidden lg:block lg:max-h-[calc(100dvh-150px)] lg:overflow-y-auto">
      <ul className="flex flex-col gap-0.5">
        {item("", "All candidates", people.length)}
        {(count("") > 0 || value === NO_ROUND) && item(NO_ROUND, "Not in a round yet", count(""))}
      </ul>
      <h2 className="mb-1 mt-4 px-2.5 text-[12px] font-semibold text-[var(--text-secondary)]">
        Hiring rounds <span className="font-normal tabular-nums text-[var(--text-muted)]">{running.length}</span>
      </h2>
      {running.length === 0 ? (
        <p className="px-2.5 text-[12px] text-[var(--text-muted)]">None running. Open one with the button above.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">{running.map(round)}</ul>
      )}
      {closed.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showClosed}
            onClick={() => setFolded((v) => !v)}
            className="mt-4 flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)]"
          >
            {showClosed ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
            Closed <span className="font-normal tabular-nums text-[var(--text-muted)]">{closed.length}</span>
          </button>
          {showClosed && <ul className="mt-0.5 flex flex-col gap-0.5">{closed.map(round)}</ul>}
        </>
      )}
    </nav>
  );
}
