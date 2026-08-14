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
  { value: "screened", label: "Screened", color: "#2563eb" },
  { value: "interview", label: "Interview", color: "#7c3aed" },
  { value: "offer", label: "Offer", color: "#d97706" },
  { value: "hired", label: "Hired", color: "#059669" },
  { value: "on_hold", label: "On Hold", color: "#a3a199", exit: true },
  { value: "rejected", label: "Rejected", color: "#b91c1c", exit: true },
];

/** Stages that mean the candidate is still in the running. */
export const OPEN_STAGES: Stage[] = ["applied", "screened", "interview", "offer"];

export function stageMeta(s: Stage) {
  return STAGES.find((x) => x.value === s) ?? STAGES[0];
}
