/**
 * Self-check for the petty-cash float maths. No framework — run it with:
 *   node scripts/pettyCash.check.ts
 *
 * The scenario in the middle is the one from the spec: a 14,900 float, 2,000
 * handed to Gaurav for the ration, 650 returned, leaving 13,550 in hand.
 */
import assert from "node:assert/strict";
import {
  canAccessPettyCash,
  computeTotals,
  groupByHolder,
  groupByMonth,
  outstandingOf,
  returnedOf,
  spentOf,
  type Allocation,
  type Handout,
} from "../src/lib/pettyCash.ts";

function alloc(over: Partial<Allocation> = {}): Allocation {
  return {
    _id: Math.random().toString(36).slice(2),
    holderId: "hr",
    holderName: "Sakshi",
    amount: 0,
    date: "2026-08-01",
    ...over,
  };
}

function hand(over: Partial<Handout> = {}): Handout {
  return {
    _id: Math.random().toString(36).slice(2),
    holderId: "hr",
    holderName: "Sakshi",
    recipient: "Gaurav",
    purpose: "Weekly ration",
    amountGiven: 0,
    givenDate: "2026-08-05",
    settled: false,
    ...over,
  };
}

// An unsettled handout is OUT, not spent. This is the whole point of the
// model — booking it as spent on the way out would overstate expenses and
// understate what's owed back.
const open = hand({ amountGiven: 2000 });
assert.equal(spentOf(open), 0);
assert.equal(outstandingOf(open), 2000);
assert.equal(returnedOf(open), 0);

// Once settled, spent = given − returned, and nothing is outstanding.
const settled = hand({ amountGiven: 2000, settled: true, amountReturned: 650 });
assert.equal(spentOf(settled), 1350);
assert.equal(outstandingOf(settled), 0);
assert.equal(returnedOf(settled), 650);

// The spec's scenario, end to end.
const t = computeTotals([alloc({ amount: 14900 })], [settled]);
assert.equal(t.allocated, 14900);
assert.equal(t.handedOut, 2000);
assert.equal(t.returned, 650);
assert.equal(t.spent, 1350);
assert.equal(t.outstanding, 0);
assert.equal(t.inHand, 13550); // 14900 − 1350

// Mid-flight: the same float with the cash still out. In hand drops by the
// full handout until the remainder comes back.
const midFlight = computeTotals([alloc({ amount: 14900 })], [hand({ amountGiven: 2000 })]);
assert.equal(midFlight.spent, 0);
assert.equal(midFlight.outstanding, 2000);
assert.equal(midFlight.inHand, 12900);

// The two ways of stating in-hand must agree, or the page contradicts itself.
for (const tt of [t, midFlight]) {
  assert.equal(tt.inHand, tt.allocated - tt.spent - tt.outstanding);
  assert.equal(tt.inHand, tt.allocated - tt.handedOut + tt.returned);
}

// Spending the lot: nothing returned, everything spent.
const allSpent = computeTotals(
  [alloc({ amount: 5000 })],
  [hand({ amountGiven: 2000, settled: true, amountReturned: 0 })]
);
assert.equal(allSpent.spent, 2000);
assert.equal(allSpent.inHand, 3000);

// Floats are per holder and don't bleed into each other.
const holders = groupByHolder(
  [
    alloc({ holderId: "hr", holderName: "Sakshi", amount: 14900 }),
    alloc({ holderId: "acc", holderName: "Janshi", amount: 5000 }),
  ],
  [
    hand({ holderId: "hr", amountGiven: 2000, settled: true, amountReturned: 650 }),
    hand({ holderId: "acc", holderName: "Janshi", amountGiven: 1000 }),
  ],
  [
    { _id: "hr", name: "Sakshi" },
    { _id: "acc", name: "Janshi" },
  ]
);
const sakshi = holders.find((h) => h.holderId === "hr")!;
const janshi = holders.find((h) => h.holderId === "acc")!;
assert.equal(sakshi.totals.inHand, 13550);
assert.equal(sakshi.openCount, 0);
assert.equal(janshi.totals.inHand, 4000); // 1000 still out
assert.equal(janshi.openCount, 1);
assert.equal(holders[0].name, "Sakshi"); // biggest float first

// Month grouping keeps every row, newest month first.
const months = groupByMonth([
  hand({ givenDate: "2026-07-15", amountGiven: 100 }),
  hand({ givenDate: "2026-08-02", amountGiven: 200 }),
  hand({ givenDate: "2026-08-20", amountGiven: 300 }),
]);
assert.deepEqual(months.map((m) => m.key), ["2026-08", "2026-07"]);
assert.equal(months[0].given, 500);
assert.equal(months.reduce((n, m) => n + m.items.length, 0), 3);

// Access: the reason this page is restricted at all.
assert.equal(canAccessPettyCash({ isSuperAdmin: true }), true);
assert.equal(canAccessPettyCash({ isAccountant: true }), true);
assert.equal(canAccessPettyCash({ isHR: true }), true);
assert.equal(canAccessPettyCash({ email: "dhriti@ecultify.com" }), true);
assert.equal(canAccessPettyCash({ email: "DHRITI@ecultify.com" }), true);
assert.equal(canAccessPettyCash({ email: "someone@ecultify.com" }), false);
assert.equal(canAccessPettyCash(null), false);

console.log("petty cash float checks passed");
