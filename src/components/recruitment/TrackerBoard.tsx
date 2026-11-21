"use client";

import { useState } from "react";
import { TRACKERS, type TrackerKey } from "@/convex/lib/hrTrackers";
import { tone, type Row } from "@/lib/hrHealth";
import { useQuickSave } from "./hrFields";
import { HealthBadge, boardValue, fieldsOf, fmtDate, moveFields, rowTitle, show, type HrData } from "./hrShared";

const COLUMN = "flex w-[212px] shrink-0 flex-col rounded-lg border bg-[var(--bg-primary)] transition-colors";

/**
 * A tracker laid out by one of its dropdowns (a candidate's stage, a task's
 * status): one column per value, cards dragged between them. The values that
 * mean "finished" sit at the end as slim drop targets, so the board stays about
 * live work. A card opens the same panel as a table row, which is also where a
 * stage is changed without a mouse.
 */
export function TrackerBoard({
  tracker,
  items,
  data,
  skip = [],
  onOpen,
  onShowClosed,
}: {
  tracker: TrackerKey;
  items: { row: Row; label: string }[];
  data: HrData;
  /** Fields the list is already filtered to: every card would say the same thing. */
  skip?: string[];
  onOpen: (row: Row) => void;
  /** Switch to the list filtered to one finished value. */
  onShowClosed: (value: string) => void;
}) {
  const meta = TRACKERS[tracker] as (typeof TRACKERS)[TrackerKey] & { board: string; boardClosed?: readonly string[] };
  const field = fieldsOf(tracker).find((f) => f.key === meta.board)!;
  const closed = meta.boardClosed ?? [];
  const live = (field.options ?? []).filter((o) => !closed.includes(o));
  const quickSave = useQuickSave();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (value: string) => {
    const moved = items.find((i) => i.row._id === dragging)?.row;
    setDragging(null);
    setOver(null);
    if (!moved || boardValue(moved) === value) return;
    void quickSave(moved, moveFields(tracker, value), `${rowTitle(moved, data) || moved.code} moved to ${value}`);
  };
  const target = (value: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(value);
    },
    onDragLeave: () => setOver((o) => (o === value ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      drop(value);
    },
  });
  // The second line of a card: what it belongs to, else whose it is.
  const seconds = fieldsOf(tracker).filter(
    (f) => (f.type === "ref" || f.type === "user") && f.key !== meta.title && !skip.includes(f.key)
  );
  const secondLine = (row: Row) => seconds.map((f) => show(f, row, data)).find(Boolean) ?? "";
  const dueKey = ["nextDue", "dueDate", "plannedJoin"].find((k) => fieldsOf(tracker).some((f) => f.key === k));

  // Rows with no value yet (or one that is no longer an option) get a column of
  // their own at the front, so nothing is on the list but missing from the board.
  const known = new Set<string>(field.options ?? []);
  const unplaced = items.some((i) => {
    const v = boardValue(i.row);
    return v !== null && !known.has(v);
  });
  const NONE = "";

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-3">
      {[...(unplaced ? [NONE] : []), ...live].map((value) => {
        const cards = items.filter((i) => {
          const v = boardValue(i.row);
          return value === NONE ? v !== null && !known.has(v) : v === value;
        });
        const heading = value === NONE ? `No ${field.label.toLowerCase()}` : value;
        return (
          <section
            key={value || "none"}
            aria-label={`${heading}, ${cards.length}`}
            {...(value === NONE ? {} : target(value))}
            className={`${COLUMN} ${over === value && value !== NONE ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]" : "border-[var(--border)]"}`}
          >
            <h3 className="flex items-baseline justify-between gap-2 px-3 pb-1.5 pt-2.5 text-[12px] font-semibold text-[var(--text-primary)]">
              <span className="truncate">{heading}</span>
              <span className="font-normal tabular-nums text-[var(--text-muted)]">{cards.length}</span>
            </h3>
            <ul className="flex min-h-[56px] flex-col gap-1.5 px-1.5 pb-1.5">
              {cards.map(({ row, label }) => {
                const due = dueKey ? String(row.fields[dueKey] ?? "") : "";
                const late = due !== "" && due < data.today;
                return (
                  <li key={row._id}>
                    {/* A div, not a button: Firefox does not start a drag from a button. */}
                    <div
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", row._id);
                        setDragging(row._id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onClick={() => onOpen(row)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        onOpen(row);
                      }}
                      className={`w-full cursor-grab rounded-md border border-[var(--border)] bg-white px-2.5 py-2 text-left shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:border-[var(--border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] active:cursor-grabbing ${
                        dragging === row._id ? "opacity-40" : ""
                      }`}
                    >
                      <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                        {rowTitle(row, data) || row.code}
                      </span>
                      {secondLine(row) && (
                        <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">{secondLine(row)}</span>
                      )}
                      {row.fields.nextAction && (
                        <span className="mt-1 line-clamp-2 block text-[12px] text-[var(--text-secondary)]">{String(row.fields.nextAction)}</span>
                      )}
                      {(due || tone(label) === "bad" || tone(label) === "warn") && (
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className={`text-[12px] tabular-nums ${late ? "font-medium text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                            {due ? fmtDate(due, data.today) : ""}
                          </span>
                          {tone(label) !== "ok" && tone(label) !== "done" && <HealthBadge label={label} />}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {closed.map((value) => {
        const count = items.filter((i) => boardValue(i.row) === value).length;
        return (
          <section
            key={value}
            aria-label={`${value}, ${count}`}
            {...target(value)}
            className={`flex w-[124px] shrink-0 flex-col rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
              over === value ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]" : "border-[var(--border-strong)]"
            }`}
          >
            <h3 className="text-[12px] font-semibold text-[var(--text-secondary)]">{value}</h3>
            <button
              type="button"
              disabled={count === 0}
              onClick={() => onShowClosed(value)}
              className="mt-1 text-left text-[12px] tabular-nums text-[var(--text-muted)] underline-offset-2 enabled:hover:text-[var(--text-primary)] enabled:hover:underline"
            >
              {count === 0 ? "None" : `${count} · show`}
            </button>
          </section>
        );
      })}
    </div>
  );
}
