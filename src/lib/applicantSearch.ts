import { matches } from "../../convex/lib/applicantMatch";
import { parseCtcLpa, parseNoticeDays, parseYears } from "./recruitParse";

export { matches };

// Searching and narrowing a list of applicants, in the browser: the list is
// already there, so every keystroke answers at once.

export type Searchable = {
  name: string; email: string; number: string; position: string; jobName?: string;
  experience: string; expectedCtc: string; noticePeriod: string;
};
export type Narrow = { search: string; years: string; expected: string; notice: string; role: string };
export const NO_NARROW: Narrow = { search: "", years: "", expected: "", notice: "", role: "" };

export function narrow<T extends Searchable>(rows: readonly T[], n: Narrow): T[] {
  return rows.filter((a) => {
    if (!matches(a, n.search)) return false;
    if (n.role && a.position.trim() !== n.role) return false;
    if (n.years && (parseYears(a.experience) ?? -1) < Number(n.years)) return false;
    if (n.expected) {
      const pay = parseCtcLpa(a.expectedCtc);
      if (pay === null || pay > Number(n.expected)) return false;
    }
    if (n.notice) {
      const days = parseNoticeDays(a.noticePeriod);
      if (days === null || days > Number(n.notice)) return false;
    }
    return true;
  });
}
