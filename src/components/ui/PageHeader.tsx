import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** No longer drawn: the sidebar already carries the page's icon, and a
   *  title reads cleaner as a plain noun. Kept so call sites compile. */
  icon?: LucideIcon;
  /** Right-aligned slot for buttons / filters */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header: title + subtitle left, actions right. Matches the
 * dashboard header (no hairline; spacing does the separating).
 * Keeps every page's top edge identical — use instead of hand-rolled headers.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <div>
          <h1 className="font-semibold text-[26px] text-[var(--text-primary)] tracking-[-0.02em] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
