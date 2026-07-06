"use client";

import { CheckCircle2, Circle, Clock, Loader2, PauseCircle } from "lucide-react";

/** Internal task statuses shown in the portal — the single source of truth. */
export const TASK_STATUS: Record<
  string,
  { label: string; color: string; icon: "pending" | "progress" | "review" | "done" | "hold" }
> = {
  pending: { label: "Pending", color: "var(--p-text-3)", icon: "pending" },
  "in-progress": { label: "In progress", color: "var(--p-warning)", icon: "progress" },
  review: { label: "In review", color: "var(--p-info)", icon: "review" },
  done: { label: "Completed", color: "var(--p-success)", icon: "done" },
  "on-hold": { label: "On hold", color: "var(--p-text-3)", icon: "hold" },
};

/** Client-request display statuses (JSR rows, new-task list). */
export const REQUEST_STATUS: Record<string, { label: string; dot: string }> = {
  pending_review: { label: "Awaiting review", dot: "var(--p-warning)" },
  accepted: { label: "Accepted", dot: "var(--p-info)" },
  in_progress: { label: "In progress", dot: "var(--p-brand)" },
  in_review: { label: "In review", dot: "var(--p-info)" },
  completed: { label: "Completed", dot: "var(--p-success)" },
  declined: { label: "Declined", dot: "var(--p-danger)" },
  on_hold: { label: "Under review", dot: "var(--p-text-3)" },
};

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatPostDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

export function daysUntil(ts: number): { text: string; urgent: boolean; overdue: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(ts);
  deadline.setHours(0, 0, 0, 0);
  const days = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, urgent: true, overdue: true };
  if (days === 0) return { text: "Due today", urgent: true, overdue: false };
  if (days === 1) return { text: "Due tomorrow", urgent: true, overdue: false };
  if (days <= 3) return { text: `${days} days left`, urgent: true, overdue: false };
  if (days <= 7) return { text: `${days} days left`, urgent: false, overdue: false };
  return { text: `${days} days left`, urgent: false, overdue: false };
}

export function monthLabel(m: string) {
  if (!m || m === "unscheduled") return "Unscheduled";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function StatusIcon({ status, brandColor }: { status: string; brandColor: string }) {
  const info = TASK_STATUS[status];
  if (!info) return null;
  // In-progress spinner is a progress indicator — the sanctioned brand slot.
  const color = status === "in-progress" ? brandColor : info.color;
  if (info.icon === "done") return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color }} />;
  if (info.icon === "progress") return <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color }} />;
  if (info.icon === "review") return <Clock className="h-4 w-4 shrink-0" style={{ color }} />;
  if (info.icon === "hold") return <PauseCircle className="h-4 w-4 shrink-0" style={{ color }} />;
  return <Circle className="h-3.5 w-3.5 shrink-0" style={{ color }} />;
}

/** Month filter chips — the shared "segregate by month" control. */
export function MonthChips({
  months,
  selected,
  onSelect,
  brandColor,
  showAll = true,
}: {
  months: string[];
  selected: string;
  onSelect: (m: string) => void;
  brandColor: string;
  showAll?: boolean;
}) {
  if (months.length === 0) return null;
  const chipClass = (active: boolean) =>
    `px-3 h-8 rounded-[var(--p-radius-sm)] text-[12px] font-medium border ${
      active
        ? "text-white border-transparent"
        : "text-[var(--p-text-2)] border-[var(--p-border)] bg-[var(--p-surface)] hover:border-[var(--p-border-strong)]"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showAll && (
        <button
          onClick={() => onSelect("")}
          className={chipClass(selected === "")}
          style={selected === "" ? { backgroundColor: brandColor } : {}}
        >
          All months
        </button>
      )}
      {months.map((m) => (
        <button
          key={m}
          onClick={() => onSelect(m)}
          className={chipClass(selected === m)}
          style={selected === m ? { backgroundColor: brandColor } : {}}
        >
          {monthLabel(m)}
        </button>
      ))}
    </div>
  );
}

/** Section card shell used across portal tabs. */
export function PortalCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-[var(--p-surface)] rounded-[var(--p-radius-lg)] border border-[var(--p-border)] overflow-hidden ${className}`}
      style={{ boxShadow: "var(--p-shadow)" }}
    >
      {children}
    </section>
  );
}

export function PortalCardHeader({
  icon,
  title,
  count,
}: {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  /** Deprecated — kept for call-site compatibility; headers stay neutral. */
  brandColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--p-border)]">
      {icon && (
        <div className="w-7 h-7 rounded-[var(--p-radius-sm)] flex items-center justify-center bg-[var(--p-surface-2)] text-[var(--p-text-2)]">
          {icon}
        </div>
      )}
      <h2 className="p-section">
        {title}
        {count !== undefined && (
          <span className="font-normal text-[var(--p-text-3)]"> · {count}</span>
        )}
      </h2>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="w-12 h-12 rounded-[var(--p-radius-md)] bg-[var(--p-surface-2)] flex items-center justify-center mx-auto mb-3 text-[var(--p-text-3)]">
        {icon}
      </div>
      <p className="p-body text-[var(--p-text-2)]">{title}</p>
      {hint && <p className="p-secondary text-[var(--p-text-3)] mt-0.5">{hint}</p>}
    </div>
  );
}
