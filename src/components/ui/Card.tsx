interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  accent?: "admin" | "manager" | "employee" | "none";
}

const accentColors: Record<string, string> = {
  admin: "var(--accent-admin)",
  manager: "var(--accent-manager)",
  employee: "var(--accent-employee)",
};

export function Card({
  children,
  className = "",
  hover = false,
  onClick,
  style,
  accent,
}: CardProps) {
  const hasAccent = accent && accent !== "none";
  const accentColor = hasAccent ? accentColors[accent] : undefined;

  return (
    <div
      className={`
        relative bg-white rounded-xl border border-[var(--border)] shadow-sm
        p-5 transition-all duration-150
        ${hover || onClick ? "hover:shadow-md hover:border-[var(--border-strong)] cursor-pointer" : ""}
        ${className}
      `}
      style={{
        ...(hasAccent && accentColor
          ? { borderLeft: `3px solid ${accentColor}` }
          : {}),
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
