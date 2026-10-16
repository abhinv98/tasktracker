import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** A number that goes somewhere: big figure, label, optional trend line,
 *  and the whole tile links to the list behind the number. */
export function StatTile({
  label,
  value,
  hint,
  hintTone = "muted",
  href,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  hintTone?: "muted" | "good" | "bad";
  href: string;
  icon?: LucideIcon;
}) {
  const tone =
    hintTone === "good"
      ? "text-[var(--accent-employee-text)]"
      : hintTone === "bad"
        ? "text-[var(--danger)]"
        : "text-[var(--text-muted)]";
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-white px-4 py-3.5 hover:border-[var(--border-strong)] hover:shadow-sm transition-all"
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
        {Icon && <Icon className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-admin-text)] transition-colors" />}
        {label}
      </span>
      <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-[var(--text-primary)]">
        {value}
      </span>
      {hint && <span className={`text-[11px] ${tone}`}>{hint}</span>}
    </Link>
  );
}

/** Section title with an optional count pill and a right-aligned link. */
export function SectionHeader({
  title,
  count,
  tone = "neutral",
  action,
}: {
  title: string;
  count?: number;
  tone?: "neutral" | "danger";
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="flex items-center gap-2 font-semibold text-[17px] tracking-tight text-[var(--text-primary)]">
        {title}
        {count !== undefined && count > 0 && (
          <span
            className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold tabular-nums ${
              tone === "danger"
                ? "bg-[var(--danger-dim)] text-[var(--danger)]"
                : "bg-[var(--bg-hover)] text-[var(--text-secondary)]"
            }`}
          >
            {count}
          </span>
        )}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}
