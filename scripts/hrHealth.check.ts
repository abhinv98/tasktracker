// Self-check for the HR tracker alerts (src/lib/hrHealth.ts), which mirror the
// formulas in the founders' recruitment workbook:
//   node scripts/hrHealth.check.ts
import assert from "node:assert/strict";
import { health, derived, radar, headline, toBook, type Row } from "../src/lib/hrHealth.ts";

const today = "2026-11-21";
let n = 0;
const row = (tracker: Row["tracker"], fields: Row["fields"], id = `${tracker}${++n}`): Row => ({
  _id: id, tracker, code: id, fields,
});

const round = row("rounds", { role: "Designer", hiringStatus: "Open", approvalStatus: "Approved", openings: 2, requestDate: "2026-11-01", nextDue: "2026-11-25", lastUpdate: "2026-11-20" }, "R1");
const cand = row("pipeline", { name: "A", reqId: "R1", verification: "Verified", status: "Active", nextDue: "2026-11-22", lastUpdate: "2026-11-20" }, "C1");
const book = toBook([
  round,
  cand,
  row("pipeline", { name: "B", reqId: "R1", verification: "To Verify", status: "Active" }),
  row("interviews", { candidateId: "C1", status: "Completed", feedbackDue: "2026-11-19" }),
  row("interviews", { candidateId: "C1", status: "Planned", date: "2026-11-25" }),
  row("offers", { candidateId: "C1", stage: "Accepted", plannedJoin: "2026-12-01", approvalStatus: "Approved" }),
  row("onboarding", { candidateId: "C1", plannedJoining: "2026-11-10", actualJoining: "2026-11-10" }),
  row("log", { date: "2026-11-20", action: "x", founderAttention: "Yes" }),
  row("log", { date: "2026-11-01", action: "old" }),
]);
const h = (r: Row) => health(r, book, today);

// Rounds: the order of the checks matters, exactly as in the sheet.
assert.equal(h(round), "On Track");
assert.equal(h(row("rounds", { hiringStatus: "To Confirm", approvalStatus: "Approved" })), "Verify status");
assert.equal(h(row("rounds", { hiringStatus: "Open", approvalStatus: "Pending", blocker: "x" })), "Approval pending");
assert.equal(h(row("rounds", { hiringStatus: "Open", approvalStatus: "Approved", blocker: "x" })), "Blocked");
assert.equal(h(row("rounds", { hiringStatus: "Open", approvalStatus: "Approved", nextDue: "2026-11-20" })), "Overdue");
assert.equal(h(row("rounds", { hiringStatus: "Open", approvalStatus: "Approved", nextDue: "2026-11-30", lastUpdate: "2026-11-15" })), "Stale");
assert.equal(h(row("rounds", { hiringStatus: "Open", approvalStatus: "Approved", nextDue: "2026-11-30", lastUpdate: "2026-11-16" })), "On Track"); // 5 days is not "more than 5"
assert.equal(h(row("rounds", { hiringStatus: "Open", approvalStatus: "Approved" })), "Needs next date");
assert.equal(h(row("rounds", { hiringStatus: "Closed - Filled" })), "Closed");

// Candidates.
assert.equal(h(cand), "On Track");
assert.equal(h(book.pipeline[1]), "Verify first");
assert.equal(h(row("pipeline", { verification: "Verified", status: "Rejected" })), "Closed");

// Interviews, assignments, offers, onboarding.
assert.equal(h(book.interviews[0]), "Feedback overdue");
assert.equal(h(book.interviews[1]), "Upcoming");
assert.equal(h(row("interviews", { status: "Completed" })), "Set feedback due");
assert.equal(h(row("interviews", { status: "Planned", date: "2026-11-20" })), "Interview overdue");
assert.equal(h(row("interviews", { status: "No Show" })), "No Show");
assert.equal(h(row("assignments", {})), "Not sent");
assert.equal(h(row("assignments", { sentDate: "2026-11-10", submissionDue: "2026-11-15" })), "Candidate overdue");
assert.equal(h(row("assignments", { sentDate: "2026-11-10", receivedDate: "2026-11-14", reviewDue: "2026-11-30" })), "Under review");
assert.equal(h(book.offers[0]), "On Track");
assert.equal(h(row("offers", { stage: "Approval Required", approvalStatus: "Pending", approvalRequested: "2026-11-17" })), "Approval overdue");
assert.equal(h(row("offers", { stage: "Accepted", plannedJoin: "2026-11-20" })), "Join delayed");
assert.equal(h(book.onboarding[0]), "Docs pending");
assert.equal(h(row("onboarding", { plannedJoining: "2026-11-20" })), "Joining delayed");

// The rest.
assert.equal(h(row("interns", { status: "Active", endDate: "2026-12-01" })), "End date near");
assert.equal(h(row("campus", { stage: "Contacted", nextFollowUp: "2026-12-01", lastContact: "2026-10-01" })), "No recent contact");
assert.equal(h(row("projects", { stage: "Drafting" })), "Needs next date");

// Calculated columns on the round: only the verified candidate counts, one joined of two openings.
const d = Object.fromEntries(derived(round, book, today).map((x) => [x.label, x.value]));
assert.deepEqual(d, { "Verified candidates": 1, "Interviews completed": 1, "Offers accepted": 1, Joined: 1, "Vacancies left": 1, "Days open": 20 });

// Dashboard.
const top = headline(book, today);
assert.deepEqual(
  { a: top.activeCycles, v: top.vacantSeats, c: top.activeCandidates, p: top.approvals, l: top.lastLog, t: top.candidatesToVerify },
  { a: 1, v: 1, c: 1, p: 0, l: "2026-11-20", t: 1 }
);
const lines = Object.fromEntries(radar(book, today).map((x) => [x.key, [x.open, x.attention]]));
assert.deepEqual(lines.interviews, [1, 1]); // one planned; one with feedback overdue
assert.deepEqual(lines.pipeline, [1, 0]);
assert.deepEqual(lines.onboarding, [1, 1]);
assert.deepEqual(lines.log, [1, 1]); // only the entry from the last 7 days

console.log("hrHealth: all checks passed");
