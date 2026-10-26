"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function getStartOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isSameDay(a: number, b: number): boolean {
  return getStartOfDay(a) === getStartOfDay(b);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: Date[] = [];
  // Previous month padding
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, -startPad + i + 1);
    days.push(d);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }
  return days;
}

interface DatePickerProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Set date",
  disabled,
  className = "",
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Fixed to the viewport, not absolute: inside a modal's scrolling body an
  // absolute calendar was clipped and had to be scrolled to.
  const [pos, setPos] = useState<React.CSSProperties>({});
  const [viewDate, setViewDate] = useState(() => {
    const base = value ? new Date(value) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function place() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const width = 280;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const dropUp = window.innerHeight - rect.bottom < 380 && rect.top > 380;
      setPos(
        dropUp
          ? { position: "fixed", left, bottom: window.innerHeight - rect.top + 4 }
          : { position: "fixed", left, top: rect.bottom + 4 }
      );
    }
    place();
    // Follow the field if the page or a modal body scrolls under it.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const displayLabel = value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : placeholder;
  const today = getStartOfDay(Date.now());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const days = getDaysInMonth(viewYear, viewMonth);

  function goPrev() {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  }
  function goNext() {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  }
  function selectDay(d: Date) {
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    onChange(endOfDay.getTime());
    setOpen(false);
  }
  function clear() {
    onChange(undefined);
    setOpen(false);
  }
  function setToday() {
    onChange(today);
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="flex items-center gap-2 w-full min-w-[140px] bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[var(--text-primary)] h-8 px-2.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] focus:ring-offset-1 hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CalendarIcon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        <span className="truncate">{displayLabel}</span>
      </button>

      {open && pos.position && (
        <div style={pos} className="z-50 w-[280px] bg-white rounded-xl border border-[var(--border)] shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <span className="font-semibold text-[15px] text-[var(--text-primary)]">
              {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={goPrev}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {DAYS.map((day, i) => (
              <div
                key={i}
                className="h-8 flex items-center justify-center text-[11px] font-medium text-[var(--text-muted)]"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
            {days.map((d, i) => {
              const ts = d.getTime();
              const isCurrentMonth = d.getMonth() === viewMonth;
              const selected = value !== undefined && isSameDay(ts, value);
              const isToday = isSameDay(ts, today);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(d)}
                  className={`
                    h-8 rounded-md text-[13px] font-medium transition-colors
                    ${!isCurrentMonth ? "text-[var(--text-disabled)]" : "text-[var(--text-primary)]"}
                    ${selected ? "bg-[var(--accent-admin-strong)] text-white hover:bg-[var(--accent-admin-strong)]" : ""}
                    ${!selected && isCurrentMonth ? "hover:bg-[var(--bg-hover)]" : ""}
                    ${isToday && !selected ? "ring-1 ring-[var(--accent-admin)]" : ""}
                  `}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-primary)]">
            <button
              type="button"
              onClick={clear}
              className="text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={setToday}
              className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
