// Reads a content calendar CSV for one brand's month: date, post title,
// platform, every column optional. A row with "break" in it marks that date
// as a break day. Check: node scripts/calendarCsv.check.ts

export type CalendarCsvRow = {
  /** Line in the file, for pointing at a problem. */
  line: number;
  /** "YYYY-MM-DD", inside the open month. Missing only when `error` is set. */
  date?: string;
  title: string;
  platform: string;
  isBreak: boolean;
  /** Why this row will be skipped. */
  error?: string;
};

/** CSV text to rows of cells: commas, quoted cells, "" inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") (quoted = true), (cell = "");
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/** One cell to a date. Day first, the way dates are written here: 14/11/2026,
 *  14-11-26, 2026-11-14, 14 Nov, Nov 14, or just 14 (a day of the open month).
 *  Returns null when it is not a date at all. */
export function parseCsvDate(cell: string, month: string): string | null {
  const [openY, openM] = month.split("-").map(Number);
  const s = cell.trim().toLowerCase();
  let y = openY, m = openM, d: number;
  let hit: RegExpMatchArray | null;
  if ((hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/))) {
    [d, m] = [+hit[1], +hit[2]];
    if (hit[3]) y = hit[3].length === 2 ? 2000 + +hit[3] : +hit[3];
  } else if ((hit = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[ -]([a-z]{3})[a-z]*(?:[ ,-]+(\d{4}))?$/))) {
    [d, m] = [+hit[1], MONTHS.indexOf(hit[2]) + 1];
    if (hit[3]) y = +hit[3];
  } else if ((hit = s.match(/^([a-z]{3})[a-z]* (\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(\d{4}))?$/))) {
    [d, m] = [+hit[2], MONTHS.indexOf(hit[1]) + 1];
    if (hit[3]) y = +hit[3];
  } else if ((hit = s.match(/^(\d{1,2})$/))) d = +hit[1];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return ymd(y, m, d);
}

const isBreakCell = (c: string) => /^break( day)?$/i.test(c);

/**
 * The rows of a CSV as calendar entries for `month` ("YYYY-MM").
 * - A header row (Date / Post title / Platform, any order) is used when
 *   present; without one the columns are date, title, platform, or title,
 *   platform when no row starts with a date.
 * - A row without a date takes the day after the row above it (the first one
 *   takes the 1st), so a plain list of titles fills the month day by day.
 * - "break" in any cell marks the row's date as a break day.
 */
export function readCalendarCsv(text: string, month: string, platforms: string[]): CalendarCsvRow[] {
  const [openY, openM] = month.split("-").map(Number);
  const all = parseCsv(text)
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter((r) => r.cells.some((c) => c !== ""));
  if (all.length === 0) return [];

  // A header row names at least one of our columns and holds no date. Other
  // columns (Status, Notes) are ignored. "First post" is a title, not a header.
  const DATE = /^(\w+ )?(date|day)s?$/;
  const TITLE = /^(post )?(title|post|caption|topic|content|idea)s?$/;
  const PLATFORM = /^(platform|channel)s?$/;
  const first = all[0].cells.map((c) => c.toLowerCase());
  const hasHeader =
    first.some((c) => DATE.test(c) || TITLE.test(c) || PLATFORM.test(c)) &&
    first.every((c) => parseCsvDate(c, month) === null && !isBreakCell(c));
  let dateCol = 0, titleCol = 1, platformCol = 2;
  const body = hasHeader ? all.slice(1) : all;
  if (hasHeader) {
    dateCol = first.findIndex((c) => DATE.test(c));
    platformCol = first.findIndex((c) => PLATFORM.test(c));
    titleCol = first.findIndex((c) => TITLE.test(c));
  } else if (!body.some((r) => r.cells[0] && parseCsvDate(r.cells[0], month) !== null)) {
    [dateCol, titleCol, platformCol] = [-1, 0, 1];
  }

  const platformOf = (raw: string) => {
    const p = raw.toLowerCase();
    if (!p) return platforms[0];
    if (p === "x" || p === "twitter") return platforms.find((x) => /twitter/i.test(x)) ?? "Other";
    return platforms.find((x) => x.toLowerCase() === p) ?? "Other";
  };

  let previousDay = 0; // day of the month of the row above
  return body.map(({ cells, line }): CalendarCsvRow => {
    const at = (col: number) => (col >= 0 ? (cells[col] ?? "") : "");
    const isBreak = cells.some(isBreakCell);
    const title = isBreakCell(at(titleCol)) ? "" : at(titleCol);
    const row = { line, title: title || "Untitled post", platform: platformOf(isBreakCell(at(platformCol)) ? "" : at(platformCol)), isBreak };

    const rawDate = at(dateCol);
    let date: string | null;
    if (rawDate) {
      date = parseCsvDate(rawDate, month);
      if (!date) return { ...row, error: `"${rawDate}" is not a date` };
      if (!date.startsWith(month)) return { ...row, date, error: "Not in this month" };
    } else if (isBreak) {
      return { ...row, error: "A break day needs its date" };
    } else {
      if (previousDay >= daysIn(openY, openM)) return { ...row, error: "Past the end of the month" };
      date = ymd(openY, openM, previousDay + 1);
    }
    previousDay = Number(date.slice(8));
    return { ...row, date };
  });
}
