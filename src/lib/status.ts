/**
 * Single source of truth for task status → color/label mapping.
 *
 * Consumed by dashboard, calendar cards, canvas nodes, StatusBadge, portal —
 * anywhere a task status needs a dot color, chip background, or display label.
 * Values match the palette previously duplicated per-page (e.g. STATUS_COLORS
 * in content-calendar), plus the previously unmapped "on-hold".
 */
export const TASK_STATUS_META: Record<string, { label: string; dot: string; bg: string }> = {
  pending:       { label: "Pending",     dot: "#6b7280", bg: "#f3f4f6" },
  "in-progress": { label: "In Progress", dot: "#f59e0b", bg: "#fef3c7" },
  review:        { label: "Review",      dot: "#8b5cf6", bg: "#ede9fe" },
  done:          { label: "Done",        dot: "#10b981", bg: "#d1fae5" },
  "on-hold":     { label: "On Hold",     dot: "#78716c", bg: "#f5f5f4" },
};

/** Meta for a task status, falling back to `pending` for unknown values. */
export function taskStatusMeta(status: string): { label: string; dot: string; bg: string } {
  return TASK_STATUS_META[status] ?? TASK_STATUS_META.pending;
}

/** Overdue = past its deadline and still in the assignee's hands
 *  (pending / in progress / on hold). Review and Done never count — see
 *  STATUSES.txt. */
export function isTaskOverdue(t: { deadline?: number | null; status: string }, now = Date.now()) {
  return !!t.deadline && t.deadline < now && t.status !== "done" && t.status !== "review";
}
