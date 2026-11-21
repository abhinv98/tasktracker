"use client";

import { Check, ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The HRMS app's list furniture, in this app's colours:
 *  - Tray: a small panel that opens under the button that asked for it, for
 *    the "and also…" choices that would otherwise crowd a toolbar.
 *  - FilterTray: a tray holding one filter's options.
 *  - StatChips: a row of counts you can click to filter by.
 *  - SearchField: the search box that leads a filter row.
 */

const TrayContext = createContext<{ close: () => void }>({ close: () => {} });

const TRIGGER =
  "inline-flex items-center gap-1.5 h-control px-3 rounded-control border bg-white text-[13px] font-medium whitespace-nowrap transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)]";

export function Tray({
  label,
  icon: Icon,
  active = false,
  title,
  width = "w-max min-w-56 max-w-[24rem]",
  align = "start",
  children,
}: {
  /** What the button says. */
  label: ReactNode;
  icon?: LucideIcon;
  /** Marks the button when its tray holds something that is switched on. */
  active?: boolean;
  /** A quiet heading inside the tray. */
  title?: string;
  /** Tailwind width classes for the tray. By default it grows to fit its
   *  longest row, and is never narrower than the button it hangs from. */
  width?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside or Escape closes it. The tray sits inside its own wrapper,
  // so a pick inside it (a date in a calendar, say) does not count as outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${TRIGGER} ${
          active
            ? "border-[var(--accent-admin)] text-[var(--text-primary)]"
            : "border-[var(--border)] text-[var(--text-primary)]"
        }`}
      >
        {Icon && <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />}
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
      </button>
      {open && (
        <div
          className={`animate-scaleIn absolute top-full z-30 mt-1.5 flex max-h-[24rem] flex-col gap-0.5 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-1 shadow-lg min-w-full ${width} ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {title && (
            <p className="px-2 pb-1 pt-1.5 text-[12px] font-semibold text-[var(--text-primary)]">{title}</p>
          )}
          <TrayContext.Provider value={{ close: () => setOpen(false) }}>{children}</TrayContext.Provider>
        </div>
      )}
    </div>
  );
}

/** One row in a tray. `active` marks the single current choice. */
export function TrayItem({
  label,
  icon: Icon,
  active = false,
  destructive = false,
  onSelect,
  closeOnSelect = true,
}: {
  label: ReactNode;
  icon?: LucideIcon;
  active?: boolean;
  destructive?: boolean;
  onSelect: () => void;
  closeOnSelect?: boolean;
}) {
  const { close } = useContext(TrayContext);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        onSelect();
        if (closeOnSelect) close();
      }}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus:outline-none ${
        destructive
          ? "text-[var(--danger)] hover:bg-[var(--danger-dim)] focus-visible:bg-[var(--danger-dim)]"
          : active
            ? "bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]"
            : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
      }`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
    </button>
  );
}

/** One filter: a button named after it, and a tray of its options. An empty
 *  value means "all". Once set, the button says what it is set to. */
export function FilterTray({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  /** The "no filter" row, e.g. "All managers". */
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Tray
      active={!!current}
      title={label}
      label={
        current ? (
          <>
            <span className="font-normal text-[var(--text-muted)]">{label}:</span>
            <span className="max-w-[160px] truncate">{current.label}</span>
          </>
        ) : (
          label
        )
      }
    >
      <TrayItem label={allLabel} active={!current} onSelect={() => onChange("")} />
      {options.map((o) => (
        <TrayItem key={o.value} label={o.label} active={o.value === value} onSelect={() => onChange(o.value)} />
      ))}
    </Tray>
  );
}

/** A row of counts that doubles as a filter: click a number to see its rows. */
export function StatChips<K extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: K | null;
  /** `count` undefined shows a dash: the number is not loaded yet. */
  options: readonly { value: K; label: string; count?: number; dot?: string }[];
  onChange: (value: K) => void;
  /** What the row filters by, for screen readers. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid grid-cols-2 gap-2 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none ${className}`}
    >
      {options.map((o) => {
        const pressed = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
              pressed
                ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]"
                : "border-[var(--border)] bg-white hover:bg-[var(--bg-hover)]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
              {o.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.dot }} aria-hidden />}
              <span className="truncate">{o.label}</span>
            </span>
            <span
              className={`text-[18px] font-semibold leading-none tabular-nums ${
                pressed ? "text-[var(--accent-admin-text)]" : "text-[var(--text-primary)]"
              }`}
            >
              {o.count ?? "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The search box at the head of a filter row, with a clear button. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name, e.g. "Search briefs". */
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-48 flex-1 sm:max-w-xs ${className}`}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
        aria-hidden
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full border border-[var(--border)] bg-white pl-8 pr-8 text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
