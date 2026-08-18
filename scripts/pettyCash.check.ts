/**
 * Self-check for the petty-cash maths. No framework — run it with:
 *   node scripts/pettyCash.check.ts
 *
 * Covers the parts that are easy to get subtly wrong and expensive to get
 * wrong in a money ledger: the outstanding clamp, the status rules, and the
 * fact that a returned record stops counting as outstanding.
 */
import assert from "node:assert/strict";
import {
  canAccessPettyCash,
  computeTotals,
  groupByAllocator,
  groupByMonth,
  outstandingOf,
  statusOf,
  type Disbursement,
} from "../src/lib/pettyCash.ts";

function d(over: Partial<Disbursement>): Disbursement {
  return {
    _id: Math.random().toString(36).slice(2),
    allocator: "Vivek",
    giver: "Dhriti",
    recipient: "Driver",
    amountAllocated: 0,
    amountGiven: 0,
    amountSpent: 0,
    givenDate: "2026-08-01",
    remainderReturned: false,
    ...over,
  };
}

// Outstanding: unspent cash still in the wild.
assert.equal(outstandingOf(d({ amountGiven: 1000, amountSpent: 400 })), 600);
// Returned kills it, even with a remainder on paper.
assert.equal(
  outstandingOf(d({ amountGiven: 1000, amountSpent: 400, remainderReturned: true })),
  0
);
// Overspend must not read as negative outstanding — that would silently
// cancel out another record's real outstanding in the headline total.
assert.equal(outstandingOf(d({ amountGiven: 500, amountSpent: 900 })), 0);

// Status rules.
assert.equal(statusOf(d({ amountGiven: 1000, amountSpent: 400 })), "outstanding");
assert.equal(statusOf(d({ amountGiven: 1000, amountSpent: 1000 })), "spent");
assert.equal(
  statusOf(d({ amountGiven: 1000, amountSpent: 0, remainderReturned: true })),
  "returned"
);

// Totals add up across a mixed ledger.
const ledger = [
  d({ amountAllocated: 5000, amountGiven: 2000, amountSpent: 1200 }),
  d({ amountAllocated: 0, amountGiven: 1000, amountSpent: 1000 }),
  d({
    amountAllocated: 3000,
    amountGiven: 900,
    amountSpent: 100,
    remainderReturned: true,
  }),
];
const t = computeTotals(ledger);
assert.equal(t.allocated, 8000);
assert.equal(t.handedOff, 3900);
assert.equal(t.spent, 2300);
assert.equal(t.outstanding, 800); // only the first record is still out

// Grouping keeps every record and sorts newest month first.
const grouped = groupByMonth([
  d({ givenDate: "2026-07-15" }),
  d({ givenDate: "2026-08-02" }),
  d({ givenDate: "2026-08-20" }),
]);
assert.deepEqual(grouped.map((g) => g.key), ["2026-08", "2026-07"]);
assert.equal(grouped.reduce((n, g) => n + g.items.length, 0), 3);

const byAllocator = groupByAllocator([
  d({ allocator: "Vivek", amountAllocated: 100 }),
  d({ allocator: "Mayur", amountAllocated: 900 }),
  d({ allocator: "Vivek", amountAllocated: 50 }),
]);
assert.deepEqual(byAllocator.map((a) => a.name), ["Mayur", "Vivek"]); // biggest book first
assert.equal(byAllocator[1].count, 2);

// Access: the whole point of the page being restricted.
assert.equal(canAccessPettyCash({ isSuperAdmin: true }), true);
assert.equal(canAccessPettyCash({ isAccountant: true }), true);
assert.equal(canAccessPettyCash({ isHR: true }), true);
assert.equal(canAccessPettyCash({ email: "dhriti@ecultify.com" }), true);
assert.equal(canAccessPettyCash({ email: "DHRITI@ecultify.com" }), true);
assert.equal(canAccessPettyCash({ email: "someone@ecultify.com" }), false);
assert.equal(canAccessPettyCash(null), false);

console.log("petty cash checks passed");
