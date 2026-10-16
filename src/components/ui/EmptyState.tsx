import type { LucideIcon } from "lucide-react";

/** One empty-state look for every page: icon, a short line, optional hint and action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-2 py-12 px-6 rounded-xl border border-dashed border-[var(--border)] bg-white ${className}`}
    >
      {Icon && <Icon className="h-8 w-8 text-[var(--text-muted)]" aria-hidden />}
      <p className="text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
      {description && (
        <p className="text-[12px] text-[var(--text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
