interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
        {children}
      </tr>
    </thead>
  );
}

export function TableHead({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`h-8 px-3 text-left font-medium text-[12px] text-[var(--text-muted)] whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      className={`
        border-b border-[var(--border-subtle)] bg-white
        transition-colors duration-150
        hover:bg-[var(--bg-primary)]
        ${onClick ? "cursor-pointer" : ""}
      `}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`h-9 px-3 py-1.5 text-[13px] text-[var(--text-primary)] ${className}`}
    >
      {children}
    </td>
  );
}
