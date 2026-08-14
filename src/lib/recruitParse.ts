/**
 * Candidate figures arrive in whatever the application form let people type,
 * and the form blindly appended " LPA" to it. Real values in the data:
 *
 *   "6 LPA"        already in lakhs
 *   "600000"       raw annual rupees, no suffix
 *   "900000 LPA"   raw annual rupees with a meaningless " LPA" glued on
 *   "0 LPA" / "0"  fresher, or declined to say
 *   "5.5 LPA"      lakhs with a decimal
 *
 * Everything is normalised to a number of lakhs per annum so the columns are
 * comparable and sortable. Run the self-check after touching any of this:
 *   node --experimental-strip-types scripts/check-recruit-parse.ts
 */

/** Anything at or above this is annual rupees, not lakhs. Nobody earns ₹999/yr,
 *  and nobody earns 1,000 LPA (₹100 crore), so the split is unambiguous. */
const RUPEES_THRESHOLD = 1000;

/** Lakhs per annum, or null when absent / zero / unparseable. */
export function parseCtcLpa(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  if (!isFinite(n) || n <= 0) return null;
  return n >= RUPEES_THRESHOLD ? n / 100000 : n;
}

/** "₹5.4L" — one decimal, trailing .0 dropped. */
export function formatLpa(lpa: number | null): string {
  if (lpa == null) return "";
  const s = lpa >= 100 ? lpa.toFixed(0) : lpa.toFixed(1).replace(/\.0$/, "");
  return `₹${s}L`;
}

/** Years of experience. 0 is a real answer (fresher), so it isn't null. */
export function parseYears(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = String(raw).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return isFinite(n) && n >= 0 ? n : null;
}

export function formatYears(y: number | null): string {
  if (y == null) return "";
  if (y === 0) return "Fresher";
  return `${y % 1 === 0 ? y : y.toFixed(1)} yr`;
}

/** Notice period in days; "Immediate" is 0 so it sorts to the top. */
export function parseNoticeDays(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.startsWith("imm")) return 0;
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  // "3 months" style answers exist in free-text fields; treat small numbers
  // followed by "month" as months rather than days.
  if (/month/.test(s)) return n * 30;
  return n;
}

export function formatNotice(days: number | null): string {
  if (days == null) return "";
  if (days === 0) return "Immediate";
  return `${days}d`;
}
