"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/* PortalButton                                                        */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "text-white border border-transparent hover:opacity-90",
  secondary:
    "bg-[var(--p-surface)] text-[var(--p-text)] border border-[var(--p-border-strong)] hover:bg-[var(--p-surface-2)]",
  ghost:
    "bg-transparent text-[var(--p-text-2)] border border-transparent hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]",
  danger: "bg-[var(--p-danger)] text-white border border-transparent hover:opacity-90",
};

export function PortalButton({
  variant = "primary",
  size,
  loading = false,
  disabled,
  className = "",
  children,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  loading?: boolean;
}) {
  const height = (size ?? (variant === "ghost" ? "sm" : "md")) === "sm" ? "h-8 px-3" : "h-9 px-3.5";
  return (
    <button
      disabled={disabled || loading}
      className={`relative inline-flex items-center justify-center gap-1.5 ${height} rounded-[var(--p-radius-sm)] text-[12.5px] font-semibold whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none ${BUTTON_VARIANT_CLASS[variant]} ${className}`}
      style={variant === "primary" ? { backgroundColor: "var(--p-brand)", ...style } : style}
      {...props}
    >
      <span className={`inline-flex items-center gap-1.5 ${loading ? "invisible" : ""}`}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* PortalStatusChip — 6px dot + label on surface-2                     */
/* ------------------------------------------------------------------ */

export function PortalStatusChip({
  label,
  dotColor,
  overdue = false,
  className = "",
}: {
  label: string;
  /** CSS color for the dot, e.g. "var(--p-success)" or a brand color. */
  dotColor: string;
  /** The one sanctioned tinted chip: overdue gets a danger-soft background. */
  overdue?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-[var(--p-radius-sm)] text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{
        backgroundColor: overdue ? "var(--p-danger-soft)" : "var(--p-surface-2)",
        color: overdue ? "var(--p-danger)" : "var(--p-text-2)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: overdue ? "var(--p-danger)" : dotColor }}
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortalPageHeader — title + one-line description + optional action   */
/* ------------------------------------------------------------------ */

export function PortalPageHeader({
  title,
  description,
  count,
  action,
}: {
  title: string;
  description?: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="p-title">
          {title}
          {count !== undefined && (
            <span className="font-normal text-[var(--p-text-3)]"> · {count}</span>
          )}
        </h1>
        {description && <p className="p-secondary mt-1">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PortalListRow — icon slot, title + meta line, right slot            */
/* ------------------------------------------------------------------ */

export function PortalListRow({
  icon,
  title,
  meta,
  right,
  href,
  onClick,
  divider = true,
  className = "",
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  divider?: boolean;
  className?: string;
  /** Optional expanded content rendered below the row line. */
  children?: React.ReactNode;
}) {
  const interactive = !!href || !!onClick;
  const inner = (
    <>
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block p-body font-medium truncate">{title}</span>
        {meta && <span className="block p-secondary text-[var(--p-text-3)] truncate mt-0.5">{meta}</span>}
      </span>
      {right && <span className="shrink-0 flex items-center gap-2">{right}</span>}
    </>
  );

  const rowClass = `flex items-center gap-3 w-full text-left px-5 py-3 ${
    interactive ? "hover:bg-[var(--p-surface-2)] cursor-pointer" : ""
  }`;

  return (
    <div className={`${divider ? "border-b border-[var(--p-border)] last:border-b-0" : ""} ${className}`}>
      {href ? (
        <Link href={href} className={rowClass}>
          {inner}
        </Link>
      ) : onClick ? (
        <button onClick={onClick} className={rowClass}>
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PortalSkeleton — shimmer rows or cards                              */
/* ------------------------------------------------------------------ */

export function PortalSkeleton({
  rows = 4,
  variant = "rows",
}: {
  rows?: number;
  variant?: "rows" | "cards";
}) {
  if (variant === "cards") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface)] overflow-hidden"
          >
            <div className="p-shimmer aspect-video rounded-none" />
            <div className="p-4 space-y-2">
              <div className="p-shimmer h-3.5 w-3/4" />
              <div className="p-shimmer h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface)] overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--p-border)] last:border-b-0"
        >
          <div className="p-shimmer w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="p-shimmer h-3.5 w-1/2" />
            <div className="p-shimmer h-3 w-1/4" />
          </div>
          <div className="p-shimmer h-6 w-20" />
        </div>
      ))}
    </div>
  );
}
