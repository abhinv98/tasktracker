// Searching applicants. Run: npx tsx scripts/applicantSearch.check.ts
import assert from "node:assert";
import { NO_NARROW, matches, narrow } from "../src/lib/applicantSearch";

const a = {
  name: "Priya Anil Shah", email: "priya.s@gmail.com", number: "+91 98765-43210", position: "Sr. Designer",
  experience: "3 years", expectedCtc: "900000 LPA", noticePeriod: "2 months",
};
for (const yes of ["", "  ", "p", "PRIYA", "shah priya", "priya design", "gmail", "98765", "987 654", "+91 98765 43210", "43210"]) assert.ok(matches(a, yes), yes);
for (const no of ["rahul", "priya rahul", "11111", "98", "priya 98765x"]) assert.ok(!matches(a, no), no);
const keep = (n: Partial<typeof NO_NARROW>) => narrow([a], { ...NO_NARROW, ...n }).length === 1;
assert.ok(keep({}) && keep({ years: "3" }) && keep({ expected: "9" }) && keep({ notice: "60" }) && keep({ role: "Sr. Designer" }));
assert.ok(!keep({ years: "4" }) && !keep({ expected: "8" }) && !keep({ notice: "30" }) && !keep({ role: "Jr. Designer" }));
const blank = { ...a, experience: "", expectedCtc: "", noticePeriod: "" };
assert.equal(narrow([blank], { ...NO_NARROW, expected: "9" }).length, 0, "asked for pay, none given");
assert.equal(narrow([blank], NO_NARROW).length, 1);
console.log("applicantSearch: ok");
