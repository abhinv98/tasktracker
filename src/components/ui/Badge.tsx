type BadgeVariant = "admin" | "manager" | "employee" | "neutral" | "status" | "success";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  admin: "bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]",
  manager: "bg-[var(--accent-manager-dim)] text-[var(--accent-manager-text)]",
  employee: "bg-[var(--accent-employee-dim)] text-[var(--accent-employee-text)]",
  neutral: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
  status: "bg-[var(--bg-hover)] text-[var(--text-primary)]",
  success: "bg-emerald-50 text-emerald-700",
};

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5
        font-medium text-[11px] leading-[16px]
        rounded
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  /** Dot + label color */
  color: string;
  label: string;
  /**
   * True when the VIEWER is the person this item is waiting on. Gives the dot
   * a slow halo so "mine" is findable at a glance in a dense board.
   * Be strict with it: if everything pulses, nothing does.
   */
  mine?: boolean;
  className?: string;
}

/**
 * Status indicator: small colored dot + neutral text. Quieter than a filled
 * pill — use for task/brief statuses so busy tables stay scannable.
 */
export function StatusBadge({
  color,
  label,
  mine = false,
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium text-[12px] text-[var(--text-primary)] whitespace-nowrap ${className}`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
          mine ? "animate-awaiting-you" : ""
        }`}
        style={
          {
            backgroundColor: color,
            // The halo is the status colour at low alpha, so it reads as the
            // same signal getting louder rather than a second, competing one.
            ...(mine ? { "--awaiting-hue": `${color}59` } : {}),
          } as React.CSSProperties
        }
      />
      {label}
      {/* The halo is decorative; the state has to survive without it. */}
      {mine && <span className="sr-only">— waiting on you</span>}
    </span>
  );
}
