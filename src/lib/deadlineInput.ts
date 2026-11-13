// A deadline field's value is "YYYY-MM-DD" (end of that day) or
// "YYYY-MM-DDTHH:MM" when a time was picked. All in the viewer's local time.
// Check: node scripts/deadlineInput.check.ts

export function deadlineInputToMs(value: string): number {
  // A picked time is saved one second past the minute. The server reads an
  // exact midnight (IST or UTC) as "date only" and moves it to end of day
  // (normalizeDeadlineToEndOfDay in convex/tasks.ts), which would turn a
  // 12:00 AM or 5:30 AM pick into a different deadline.
  return new Date(value.includes("T") ? value + ":01" : value + "T23:59:59").getTime();
}

/** A stored 23:59 reads back as date-only, so an untouched field compares
 *  equal to what was loaded and is not rewritten on save. */
export function deadlineToInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const ymd = d.toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return hm === "23:59" ? ymd : `${ymd}T${hm}`;
}

/** "Nov 13", or "Nov 13, 6:00 PM" when the deadline carries a time. */
export function formatDeadline(ms: number, withYear = false): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
  if (d.getHours() === 23 && d.getMinutes() === 59) return date;
  return `${date}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
