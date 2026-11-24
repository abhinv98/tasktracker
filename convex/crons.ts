import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check deadlines every hour
crons.interval(
  "check deadlines",
  { hours: 1 },
  internal.reminders.checkDeadlines
);

// Fire due "revisit later" note reminders every hour
crons.interval(
  "check note reminders",
  { hours: 1 },
  internal.personalNotes.checkNoteReminders
);

// Rolled-up daily oversight digest for Vivek & Mayur (08:00 UTC)
crons.daily(
  "oversight digest",
  { hourUTC: 8, minuteUTC: 0 },
  internal.oversight.sendOversightDigest
);

// Roll forward worklog auto-tasks whose deadline has passed without
// being checked off. Runs once per day shortly after midnight UTC so
// the "Carried over by N day(s)" count increments daily.
crons.daily(
  "roll worklog deadlines",
  { hourUTC: 0, minuteUTC: 15 },
  internal.managerWorklog.rollWorklogDeadlines
);

// Remind HR about requests left open for more than 3 days (04:00 UTC, 9:30 am IST).
crons.daily(
  "hr stale requests",
  { hourUTC: 4, minuteUTC: 0 },
  internal.hr.remindStaleRequests
);

// Positions past their last day to apply come off the website form (18:45 UTC, 12:15 am IST).
crons.daily(
  "close positions",
  { hourUTC: 18, minuteUTC: 45 },
  internal.recruitSetup.closePositions
);

export default crons;
