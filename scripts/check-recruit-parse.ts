/**
 * Self-check for the candidate figure parsers. These sit on a money path
 * (salary comparisons drive who HR shortlists), so they get a runnable check.
 *
 *   node --experimental-strip-types scripts/check-recruit-parse.ts
 *
 * Cases are taken from the real distribution in recruitCandidates.
 */
import assert from "node:assert/strict";
import {
  parseCtcLpa,
  formatLpa,
  parseYears,
  formatYears,
  parseNoticeDays,
  formatNotice,
} from "../src/lib/recruitParse.ts";

// ── CTC: the three formats the form actually produced ──
assert.equal(parseCtcLpa("6 LPA"), 6);
assert.equal(parseCtcLpa("5.5 LPA"), 5.5);
assert.equal(parseCtcLpa("600000"), 6);
assert.equal(parseCtcLpa("900000 LPA"), 9);
assert.equal(parseCtcLpa("1343000 LPA"), 13.43);
assert.equal(parseCtcLpa("540000 LPA"), 5.4);
assert.equal(parseCtcLpa("12,00,000"), 12); // commas, Indian grouping

// ── absent / zero / junk all collapse to null ──
assert.equal(parseCtcLpa("0 LPA"), null);
assert.equal(parseCtcLpa("0"), null);
assert.equal(parseCtcLpa(""), null);
assert.equal(parseCtcLpa(undefined), null);
assert.equal(parseCtcLpa("don't have"), null);
assert.equal(parseCtcLpa("-5"), null);

// ── the threshold boundary ──
assert.equal(parseCtcLpa("999"), 999, "just under the threshold stays lakhs");
assert.equal(parseCtcLpa("1000"), 0.01, "at the threshold it's rupees");

// ── formatting ──
assert.equal(formatLpa(6), "₹6L");
assert.equal(formatLpa(5.4), "₹5.4L");
assert.equal(formatLpa(13.43), "₹13.4L");
assert.equal(formatLpa(null), "");

// ── experience: 0 is a real answer, not missing ──
assert.equal(parseYears("5"), 5);
assert.equal(parseYears("2.6"), 2.6);
assert.equal(parseYears("0"), 0);
assert.equal(parseYears(""), null);
assert.equal(formatYears(0), "Fresher");
assert.equal(formatYears(5), "5 yr");
assert.equal(formatYears(2.6), "2.6 yr");

// ── notice: Immediate must sort ahead of every dated notice ──
assert.equal(parseNoticeDays("Immediate"), 0);
assert.equal(parseNoticeDays("30 days"), 30);
assert.equal(parseNoticeDays("90 days"), 90);
assert.equal(parseNoticeDays("3 months"), 90);
assert.equal(parseNoticeDays(""), null);
assert.equal(formatNotice(0), "Immediate");
assert.equal(formatNotice(30), "30d");

const order = ["60 days", "Immediate", "15 days"]
  .map(parseNoticeDays)
  .sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
assert.deepEqual(order, [0, 15, 60]);

console.log("✓ recruit parsers: all checks passed");
