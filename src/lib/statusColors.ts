export const BRIEF_STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  active: "#3b82f6",
  "in-progress": "#f59e0b",
  review: "#8b5cf6",
  completed: "#10b981",
  archived: "#9ca3af",
  rejected: "#ef4444",
  on_hold: "#f97316",
  sent_to_client: "#06b6d4",
};

export const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  "in-progress": { label: "In Progress", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  review: { label: "Review", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  done: { label: "Done", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

export const BRIEF_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  "in-progress": "In Progress",
  review: "Review",
  completed: "Completed",
  archived: "Archived",
  rejected: "Rejected",
  on_hold: "On Hold",
  sent_to_client: "Sent to Client",
};
