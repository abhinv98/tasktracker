export type HrCategory =
  | "appointment_letter"
  | "appraisal_letter"
  | "reimbursement_comp_off"
  | "attendance_regularization"
  | "other";

export type HrStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "declined";

export const HR_CATEGORIES: { value: HrCategory; label: string }[] = [
  { value: "appointment_letter", label: "Appointment Letter" },
  { value: "appraisal_letter", label: "Appraisal Letter" },
  { value: "reimbursement_comp_off", label: "Reimbursement & Comp Off" },
  { value: "attendance_regularization", label: "Attendance Regularization" },
  // Last on purpose: a catch-all offered first invites everything into it.
  { value: "other", label: "Other" },
];

export const HR_STATUSES: { value: HrStatus; label: string; color: string }[] = [
  { value: "pending", label: "Pending", color: "#d97706" },
  { value: "accepted", label: "Accepted", color: "#2563eb" },
  { value: "in_progress", label: "In Progress", color: "#7c3aed" },
  { value: "completed", label: "Completed", color: "#059669" },
  { value: "declined", label: "Declined", color: "#b91c1c" },
];

export function categoryLabel(c: HrCategory): string {
  return HR_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export function statusMeta(s: HrStatus) {
  return HR_STATUSES.find((x) => x.value === s) ?? HR_STATUSES[0];
}

/** A request still open this many days after it was raised is overdue for an answer. */
export const HR_STALE_AFTER_DAYS = 3;

/** Open = HR has not finished with it (not completed, not declined). */
export function isHrRequestOpen(status: HrStatus): boolean {
  return status !== "completed" && status !== "declined";
}

/** Whole days since an open request was raised; 0 once it is closed. */
export function hrDaysOpen(r: { status: HrStatus; createdAt: number }, now: number): number {
  return isHrRequestOpen(r.status) ? Math.floor((now - r.createdAt) / 86_400_000) : 0;
}

/** Open for MORE than the limit: at exactly three days it is not yet late. */
export function isHrRequestStale(r: { status: HrStatus; createdAt: number }, now: number): boolean {
  return isHrRequestOpen(r.status) && now - r.createdAt > HR_STALE_AFTER_DAYS * 86_400_000;
}
