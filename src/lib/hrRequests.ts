export type HrCategory =
  | "appointment_letter"
  | "appraisal_letter"
  | "reimbursement_comp_off"
  | "attendance_regularization";

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
