import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Right-aligned slot for buttons / filters */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header: title + subtitle left, actions right, hairline below.
 * Keeps every page's top edge identical — use instead of hand-rolled headers.
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b border-[var(--border-subtle)] ${className}`}
    >
      <div className="flex items-start gap-2.5">
        {Icon && (
          <Icon className="h-5 w-5 mt-[5px] text-[var(--accent-admin-text)] shrink-0" />
        )}
        <div>
          <h1 className="font-semibold text-[24px] text-[var(--text-primary)] tracking-[-0.02em] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
