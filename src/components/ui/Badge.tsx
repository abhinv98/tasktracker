type BadgeVariant = "admin" | "manager" | "employee" | "neutral" | "status";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  admin: "bg-[var(--accent-admin-dim)] text-[var(--accent-admin)]",
  manager: "bg-[var(--accent-manager-dim)] text-[var(--accent-manager)]",
  employee: "bg-[var(--accent-employee-dim)] text-[var(--accent-employee)]",
  neutral: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
  status: "bg-[var(--bg-hover)] text-[var(--text-primary)]",
};

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5
        font-medium text-[11px]
        rounded-md
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
