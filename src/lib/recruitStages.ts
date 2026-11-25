export type Stage =
  | "applied"
  | "screened"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "on_hold";

/**
 * The hiring funnel, in order. The first five are the path forward; Rejected
 * and On Hold are exits available from any point, which is why they sit at the
 * end rather than in the sequence.
 */
export const STAGES: { value: Stage; label: string; color: string; exit?: boolean }[] = [
  { value: "applied", label: "Applied", color: "#6b7280" },
  // HR's own word for this step, and the cultform status it was imported from.
  { value: "screened", label: "Shortlisted", color: "#2563eb" },
  { value: "interview", label: "Interview", color: "#7c3aed" },
  { value: "offer", label: "Offer", color: "#d97706" },
  { value: "hired", label: "Hired", color: "#059669" },
  { value: "on_hold", label: "On Hold", color: "#a3a199", exit: true },
  { value: "rejected", label: "Rejected", color: "#b91c1c", exit: true },
];

/**
 * What an application can be on the Positions pages: new, or one of three
 * decisions. Everything after shortlisting happens on Candidates, so the later
 * stages read as Shortlisted here.
 */
export type PositionStatus = "new" | "shortlisted" | "on_hold" | "rejected";

export const POSITION_STATUSES: { value: PositionStatus; label: string; stage: Stage; color: string }[] = [
  { value: "new", label: "New", stage: "applied", color: "#6b7280" },
  { value: "shortlisted", label: "Shortlisted", stage: "screened", color: "#2563eb" },
  { value: "on_hold", label: "On hold", stage: "on_hold", color: "#a3a199" },
  { value: "rejected", label: "Rejected", stage: "rejected", color: "#b91c1c" },
];

/** MUST match the counts in convex/recruitment.ts listJobs. */
export function positionStatus(stage?: Stage | null): PositionStatus {
  if (!stage || stage === "applied") return "new";
  return stage === "on_hold" || stage === "rejected" ? stage : "shortlisted";
}

export const isPositionStatus = (s: string | null): s is PositionStatus => POSITION_STATUSES.some((p) => p.value === s);

export function stageMeta(s: Stage) {
  return STAGES.find((x) => x.value === s) ?? STAGES[0];
}

/** An interviewer's verdict, as it is stored (Proceed, Hold, Reject) and as it is said. */
export const VERDICTS = {
  Proceed: { label: "Good fit", tone: "text-[var(--accent-employee-text)]" },
  Hold: { label: "Hold", tone: "text-[var(--text-secondary)]" },
  Reject: { label: "Not a fit", tone: "text-[var(--danger)]" },
} as const;
export type Verdict = keyof typeof VERDICTS;
