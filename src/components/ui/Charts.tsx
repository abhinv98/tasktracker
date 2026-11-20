"use client";

import { Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { iconButtonClass } from "./classes";

/**
 * Small, dependency-free charts in the HRMS app's layout, drawn in this app's
 * colours: thin marks, one baseline, values in text ink (never series colour),
 * a hover tooltip on every mark, and a table twin behind a toggle so no number
 * is readable by colour alone.
 */

type Row = (string | number | null)[];

const EMPTY = <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">No data yet.</p>;

/** Card + title + one-line description + table twin. Every chart sits in one. */
export function ChartCard({
  title,
  description,
  table,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  /** The same numbers as rows. Omit for cards that are already a list. */
  table?: { columns: string[]; rows: Row[] };
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`rounded-lg border border-[var(--border)] bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {table && (
          <button
            type="button"
            aria-pressed={showTable}
            aria-label={showTable ? "Show chart" : "Show table"}
            title={showTable ? "Show chart" : "Show table"}
            onClick={() => setShowTable((v) => !v)}
            className={`${iconButtonClass} -mr-1.5 -mt-1.5 ${showTable ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : ""}`}
          >
            <Table2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {table && showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[12px] text-[var(--text-muted)]">
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-[var(--border-subtle)] last:border-0">
                  {row.map((cell, i) => (
                    <td key={i} className={`py-1.5 ${i === 0 ? "text-left" : "text-right tabular-nums"}`}>
                      {cell ?? "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Horizontal bars for one series: label, bar, value. */
export function BarList({
  items,
  max,
  color = "var(--accent-employee)",
}: {
  /** `text` replaces the plain number at the end of the row (e.g. "268/287"). */
  items: { label: string; value: number; text?: string }[];
  max?: number;
  color?: string;
}) {
  if (items.length === 0) return EMPTY;
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]"
        >
          <span className="truncate text-[var(--text-primary)]">{item.label}</span>
          <div className="h-3 rounded-r-[4px] bg-[var(--border-subtle)]">
            <div
              className="h-full rounded-r-[4px] transition-[width] duration-200"
              style={{ width: `${Math.min(100, (item.value / top) * 100)}%`, background: color }}
              aria-hidden
            />
          </div>
          <span className="min-w-10 text-right tabular-nums text-[var(--text-secondary)]">
            {item.text ?? item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A share of a total as text: "–" with no total, "<1%" for a sliver. */
export function shareLabel(value: number, total: number) {
  if (total <= 0) return "–";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

/** One 100% bar split into segments, with a legend carrying count and share. */
export function StackedBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  if (total === 0) return EMPTY;
  const pct = (v: number) => shareLabel(v, total);
  return (
    <div>
      <div
        className="flex h-4 gap-0.5 overflow-hidden rounded-[4px]"
        role="img"
        aria-label={shown.map((s) => `${s.label} ${s.value}`).join(", ")}
      >
        {shown.map((s, i) => (
          <div
            key={i}
            title={`${s.label}: ${s.value} (${pct(s.value)})`}
            style={{ flexGrow: s.value, background: s.color }}
            className="min-w-0.5"
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
        {shown.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="text-[var(--text-muted)]">{s.label}</span>
            <span className="tabular-nums text-[var(--text-primary)]">{s.value}</span>
            <span className="text-[12px] text-[var(--text-muted)]">{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const W = 600;

/** One column per category, with the value above it and a tooltip on hover. */
export function Columns({
  categories,
  values,
  name,
  color = "var(--accent-employee)",
  height = 180,
}: {
  categories: string[];
  values: number[];
  /** What the numbers count, for the tooltip and screen readers. */
  name: string;
  color?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  if (categories.length === 0) return EMPTY;
  const pad = { top: 22, bottom: 24, left: 8, right: 8 };
  const plotH = height - pad.top - pad.bottom;
  const slot = (W - pad.left - pad.right) / categories.length;
  const barW = Math.min(28, slot * 0.55);
  const scale = plotH / Math.max(1, ...values);
  const baseline = pad.top + plotH;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={`${id}-title`}
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-title`}>{name} by period</title>
        <line x1={pad.left} x2={W - pad.right} y1={baseline} y2={baseline} stroke="var(--border)" strokeWidth={1} />
        {categories.map((cat, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const v = values[i] ?? 0;
          const h = v * scale;
          return (
            <g key={`${cat}-${i}`} opacity={hover !== null && hover !== i ? 0.45 : 1} style={{ transition: "opacity 150ms" }}>
              <rect
                x={pad.left + slot * i}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {h > 0 && (
                <>
                  <rect x={cx - barW / 2} y={baseline - h} width={barW} height={h} rx={4} fill={color} style={{ pointerEvents: "none" }} />
                  {/* Square off the bottom corners so the column sits on the baseline. */}
                  <rect x={cx - barW / 2} y={baseline - Math.min(4, h)} width={barW} height={Math.min(4, h)} fill={color} style={{ pointerEvents: "none" }} />
                </>
              )}
              <text x={cx} y={baseline - h - 6} textAnchor="middle" fontSize={11} fontWeight={500} fill="var(--text-primary)" style={{ pointerEvents: "none" }}>
                {v}
              </text>
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)" style={{ pointerEvents: "none" }}>
                {cat}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-[var(--text-primary)] px-2.5 py-1.5 text-[12px] whitespace-nowrap text-white shadow-md"
          style={{ left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%` }}
        >
          <span className="font-medium">{categories[hover]}</span> · {values[hover] ?? 0} {name.toLowerCase()}
        </div>
      )}
    </div>
  );
}

/** Stat tile: label, figure, an optional change and note, and a sparkline. */
export function SparkStat({
  label,
  value,
  delta,
  hint,
  bad = false,
  spark,
}: {
  label: string;
  value: number | string;
  /** A change against the previous period. `good: null` keeps it neutral. */
  delta?: { text: string; good: boolean | null };
  hint?: string;
  /** Colours the note as bad news. */
  bad?: boolean;
  spark?: number[];
}) {
  const vals = spark ?? [];
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals, 1);
  const pts = vals
    .map((v, i) => `${(i / Math.max(1, vals.length - 1)) * 100},${28 - ((v - lo) / Math.max(1, hi - lo)) * 26}`)
    .join(" ");
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white px-4 py-3.5">
      <div className="text-[12px] text-[var(--text-secondary)]">{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="shrink-0">
          <div className="text-[24px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">{value}</div>
          {(delta || hint) && (
            <div className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[12px]">
              {delta && (
                <span
                  className={`font-medium tabular-nums ${
                    delta.good === true
                      ? "text-[var(--accent-employee-text)]"
                      : delta.good === false
                        ? "text-[var(--danger)]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {delta.text}
                </span>
              )}
              {hint && (
                <span className={bad ? "font-medium text-[var(--danger)]" : "text-[var(--text-muted)]"}>{hint}</span>
              )}
            </div>
          )}
        </div>
        {vals.length > 1 && (
          <svg viewBox="0 0 100 30" className="h-8 min-w-8 max-w-20 flex-1" preserveAspectRatio="none" aria-hidden>
            <polyline points={pts} fill="none" stroke="var(--text-muted)" strokeOpacity={0.6} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    </div>
  );
}
