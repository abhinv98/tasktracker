// Self-check for the content calendar CSV reader (src/lib/calendarCsv.ts):
//   node scripts/calendarCsv.check.ts
import assert from "node:assert/strict";
import { parseCsv, parseCsvDate, readCalendarCsv } from "../src/lib/calendarCsv.ts";

const PLATFORMS = ["Instagram", "Facebook", "Twitter/X", "LinkedIn", "Other"];
const NOV = "2026-11";

// Quoted cells, commas inside quotes, CRLF, a BOM.
assert.deepEqual(parseCsv('﻿a,"b, c","d ""e"""\r\n1,2,3'), [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);

// Dates are day first.
for (const d of ["2026-11-14", "14/11/2026", "14-11-26", "14.11.2026", "14 Nov", "14th November 2026", "Nov 14", "14"]) {
  assert.equal(parseCsvDate(d, NOV), "2026-11-14", d);
}
assert.equal(parseCsvDate("31/11/2026", NOV), null); // November has 30 days
assert.equal(parseCsvDate("Diwali post", NOV), null);

// With a header, in any order; platform matched loosely; break in any cell.
const rows = readCalendarCsv(
  ["Platform,Date,Post title", "linkedin,14/11/2026,Launch teaser", ",15/11/2026,break", "x,16 Nov,", "Insta,2/12/2026,Late one"].join("\n"),
  NOV,
  PLATFORMS
);
assert.deepEqual(rows.map((r) => [r.date, r.title, r.platform, r.isBreak, r.error ?? null]), [
  ["2026-11-14", "Launch teaser", "LinkedIn", false, null],
  ["2026-11-15", "Untitled post", "Instagram", true, null],
  ["2026-11-16", "Untitled post", "Twitter/X", false, null],
  ["2026-12-02", "Late one", "Other", false, "Not in this month"],
]);

// No header: date, title, platform. "date,break" marks a break day.
const plain = readCalendarCsv("3/11/2026,Diwali wishes,Facebook\n4/11/2026,break\nnonsense,Something", NOV, PLATFORMS);
assert.deepEqual(plain.map((r) => [r.date, r.isBreak, !!r.error]), [
  ["2026-11-03", false, false],
  ["2026-11-04", true, false],
  [undefined, false, true],
]);

// No dates at all: titles fill the month from the 1st, one a day.
const titles = readCalendarCsv("First post,Instagram\nSecond post\nThird post,LinkedIn", NOV, PLATFORMS);
assert.deepEqual(titles.map((r) => [r.date, r.title, r.platform]), [
  ["2026-11-01", "First post", "Instagram"],
  ["2026-11-02", "Second post", "Instagram"],
  ["2026-11-03", "Third post", "LinkedIn"],
]);

// A row with no date follows the row above; it cannot run past the month.
const mixed = readCalendarCsv("Date,Title\n29/11/2026,A\n,B\n,C\n,break", NOV, PLATFORMS);
assert.deepEqual(mixed.map((r) => [r.date ?? null, r.error ?? null]), [
  ["2026-11-29", null],
  ["2026-11-30", null],
  [null, "Past the end of the month"],
  [null, "A break day needs its date"],
]);

// A header with columns we do not use, in another order.
const extra = readCalendarCsv("Caption,Publish date,Status,Channel\nBig launch,14/11/2026,draft,facebook", NOV, PLATFORMS);
assert.deepEqual(extra.map((r) => [r.date, r.title, r.platform]), [["2026-11-14", "Big launch", "Facebook"]]);

// An inch mark in a title must not swallow the rows after it.
const inch = readCalendarCsv('14/11/2026,New 6" phone launch,Instagram\n15/11/2026,Next post', NOV, PLATFORMS);
assert.deepEqual(inch.map((r) => r.title), ['New 6" phone launch', "Next post"]);

assert.deepEqual(readCalendarCsv("\n\n", NOV, PLATFORMS), []);

console.log("calendarCsv: ok");
