import { Calendar, User } from "lucide-react";
import { Badge } from "../primitives/Badge";

export type TaskStatus = "pending" | "in-progress" | "review" | "done";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "To Do",
  "in-progress": "In Progress",
  review: "In Review",
  done: "Done",
};

const STATUS_STYLE: Record<TaskStatus, { color: string; bg: string }> = {
  pending: { color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  "in-progress": { color: "#3B82F6", bg: "#EFF6FF" },
  review: { color: "#F59E0B", bg: "#FFFBEB" },
  done: { color: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TaskCard({
  title,
  brief,
  assignee,
  deadline,
  status,
  highlighted = false,
  style,
  className = "",
}: {
  title: string;
  brief: string;
  assignee?: string;
  deadline?: string;
  status: TaskStatus;
  highlighted?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 shadow-sm ${className}`}
      style={{
        borderColor: highlighted ? "var(--accent-admin)" : "var(--border)",
        boxShadow: highlighted
          ? "0 8px 24px rgba(217, 119, 87, 0.18)"
          : "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
          {title}
        </p>
        <StatusBadge status={status} />
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">{brief}</p>
      <div className="flex items-center gap-3 mt-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        {assignee && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {assignee}
          </span>
        )}
        {deadline && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {deadline}
          </span>
        )}
      </div>
    </div>
  );
}
