import Link from "next/link";

/** One card for a row of peer numbers, split by hairlines instead of a box
 *  per number. Two across on a phone (an odd last cell takes the full row),
 *  one row from `lg` up. */
export function StatStrip({
  children,
  className = "",
  bare = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Inside a Panel: the panel already draws the frame. */
  bare?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-2 lg:grid-cols-none lg:grid-flow-col lg:auto-cols-fr gap-px overflow-hidden bg-[var(--border-subtle)] ${bare ? "" : "rounded-lg border border-[var(--border)]"} [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 ${className}`}
    >
      {children}
    </div>
  );
}

/** One number in a StatStrip: label, figure, optional note. With `href` the
 *  whole cell links to the list behind the number. Colour only when the note
 *  is bad news; a clear queue is not a signal. */
export function StatTile({
  label,
  value,
  hint,
  bad = false,
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  bad?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
      <span className="text-[24px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
        {value}
      </span>
      {hint && (
        <span className={`text-[12px] ${bad ? "font-medium text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
          {hint}
        </span>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="flex flex-col gap-1.5 bg-white px-4 py-3.5 hover:bg-[var(--bg-primary)] transition-colors focus-visible:outline-offset-[-2px]"
    >
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-1.5 bg-white px-4 py-3.5">{body}</div>
  );
}

/** Section title with an optional count and a right-aligned link. The count is
 *  a plain grey number; only a queue that needs action (`tone="danger"`) gets
 *  the tinted pill. */
export function SectionHeader({
  title,
  count,
  tone = "neutral",
  action,
  className = "mb-3",
}: {
  title: string;
  count?: number;
  tone?: "neutral" | "danger";
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 className="flex items-center gap-2 font-semibold text-[14px] text-[var(--text-primary)]">
        {title}
        {count !== undefined && count > 0 &&
          (tone === "danger" ? (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[12px] font-semibold tabular-nums bg-[var(--danger-dim)] text-[var(--danger)]">
              {count}
            </span>
          ) : (
            <span className="font-normal tabular-nums text-[var(--text-muted)]">{count}</span>
          ))}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/** The one frame every dashboard block sits in: a title bar (title, count,
 *  link) over its rows. Same bar height and padding everywhere, so blocks
 *  line up across the grid. */
export function Panel({
  children,
  className = "",
  ...header
}: {
  title: string;
  count?: number;
  tone?: "neutral" | "danger";
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[var(--border)] bg-white overflow-hidden ${className}`}>
      <SectionHeader {...header} className="h-11 px-4 border-b border-[var(--border-subtle)]" />
      {children}
    </section>
  );
}

/** A panel with nothing in it keeps its frame and says so in one line. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3.5 text-[13px] text-[var(--text-muted)]">{children}</p>;
}
