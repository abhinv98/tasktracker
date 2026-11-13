// Self-check for the content calendar deadline field (src/lib/deadlineInput.ts):
//   node scripts/deadlineInput.check.ts
import assert from "node:assert/strict";
import { deadlineInputToMs, deadlineToInput, formatDeadline } from "../src/lib/deadlineInput.ts";

// Date only means end of that day, and reads back as date only.
const eod = deadlineInputToMs("2026-11-13");
assert.equal(eod, new Date(2026, 10, 13, 23, 59, 59).getTime());
assert.equal(deadlineToInput(eod), "2026-11-13");

// A picked time is kept and survives the round trip.
const six = deadlineInputToMs("2026-11-13T18:00");
assert.equal(six, new Date(2026, 10, 13, 18, 0, 1).getTime());
// Midnight picks must not land on the exact instants the server treats as "date only".
for (const t of ["00:00", "05:30"]) assert.equal(new Date(deadlineInputToMs(`2026-11-13T${t}`)).getSeconds(), 1);
assert.equal(deadlineToInput(six), "2026-11-13T18:00");

// Untouched field == loaded value, even when the stored time has odd seconds,
// so saving other fields never rewrites the deadline.
const odd = new Date(2026, 10, 13, 10, 30, 45).getTime();
assert.equal(deadlineToInput(odd), "2026-11-13T10:30");
assert.equal(deadlineToInput(null), "");

assert.equal(formatDeadline(eod), "Nov 13");
assert.match(formatDeadline(six), /^Nov 13, 6:00\sPM$/);
assert.equal(formatDeadline(eod, true), "Nov 13, 2026");

console.log("deadlineInput: ok");
