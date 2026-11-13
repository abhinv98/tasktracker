// Self-check for the "open too long" rule on HR requests (src/lib/hrRequests.ts):
//   node scripts/hrStale.check.ts
import assert from "node:assert/strict";
import { hrDaysOpen, isHrRequestStale, HR_STALE_AFTER_DAYS } from "../src/lib/hrRequests.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 13, 12);
const raised = (daysAgo: number, status: "pending" | "accepted" | "in_progress" | "completed" | "declined") => ({
  status,
  createdAt: now - daysAgo * DAY,
});

assert.equal(HR_STALE_AFTER_DAYS, 3);
// Open and within three days: fine. Past three days: overdue, whatever the open status.
assert.equal(isHrRequestStale(raised(2.9, "pending"), now), false);
assert.equal(isHrRequestStale(raised(3, "pending"), now), false); // exactly three days is not "more than"
assert.equal(isHrRequestStale(raised(3.01, "pending"), now), true);
assert.equal(isHrRequestStale(raised(88, "accepted"), now), true);
assert.equal(isHrRequestStale(raised(10, "in_progress"), now), true);
// Closed requests are never chased, however old.
assert.equal(isHrRequestStale(raised(200, "completed"), now), false);
assert.equal(isHrRequestStale(raised(200, "declined"), now), false);
assert.equal(hrDaysOpen(raised(88.5, "accepted"), now), 88);
assert.equal(hrDaysOpen(raised(88.5, "completed"), now), 0);

console.log("hrStale: ok");
