interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  accent?: "admin" | "manager" | "employee" | "none";
}

const accentColors: Record<string, string> = {
  admin: "var(--accent-admin)",
  manager: "var(--accent-manager)",
  employee: "var(--accent-employee)",
};

export function Card({ children, className = "", style, accent }: CardProps) {
  const hasAccent = accent && accent !== "none";
  return (
    <div
      className={`relative bg-white rounded-xl border border-[var(--border)] shadow-sm p-5 ${className}`}
      style={{
        ...(hasAccent ? { borderLeft: `3px solid ${accentColors[accent]}` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
