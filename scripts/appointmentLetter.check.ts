// Self-check for the appointment letter figures (src/lib/appointmentLetter.ts),
// against the sample letter the template was made from:
//   node scripts/appointmentLetter.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { fillLetterXml, letterValues, longDate, paySlip } from "../src/lib/appointmentLetter.ts";

assert.equal(longDate("2026-11-02"), "2nd November 2026");
assert.equal(longDate("2026-10-20"), "20th October 2026");
assert.equal(longDate("2026-01-11"), "11th January 2026");
assert.equal(longDate("2026-03-23"), "23rd March 2026");

// The sample: 2.4 LPA in probation, 3 LPA after.
assert.deepEqual(paySlip(2.4), { gross: 20000, basic: 10000, hra: 5000, other: 5000 });
assert.deepEqual(paySlip(3), { gross: 25000, basic: 12500, hra: 6250, other: 6250 });
const slip = paySlip(4.25); // an awkward figure still adds up
assert.equal(slip.basic + slip.hra + slip.other, slip.gross);

const v = letterValues({
  name: "Asha & Co <test>", designation: "Brand Solutions Executive", reportsTo: "Director, Brand Solutions - N. M.",
  joiningDate: "2026-11-02", letterDate: "2026-10-20", confirmedLpa: 3, probationLpa: 2.4, probationMonths: null,
});
assert.equal(v.salaryA, "INR 2,40,000 per annum");
assert.equal(v.salaryB, "INR 3,00,000 per annum");
assert.equal(v.probationMonths, "3");
assert.equal(v.p_gross, "20,000");
assert.equal(v.c_basic, "12,500");
// One figure throughout: no "revised to" clause.
const flat = letterValues({ ...{ name: "A", designation: "D", reportsTo: "R", joiningDate: "2026-11-02", letterDate: "2026-10-20" }, confirmedLpa: 3, probationLpa: null, probationMonths: 6 });
assert.equal(flat.salaryMid + flat.salaryB, "");
assert.equal(flat.p_gross, flat.c_gross);

// The real template: every placeholder is filled, and text is escaped.
const doc = strFromU8(unzipSync(new Uint8Array(readFileSync("src/assets/appointment-letter-template.docx")))["word/document.xml"]);
const filled = fillLetterXml(doc, v);
assert.ok(!filled.includes("{{"));
assert.ok(filled.includes("Asha &amp; Co &lt;test&gt;"));
assert.ok(filled.includes("2nd November 2026"));
assert.throws(() => fillLetterXml("{{nope}}", v));
console.log("appointmentLetter: all checks passed");
