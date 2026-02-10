import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check deadlines every hour
crons.interval(
  "check deadlines",
  { hours: 1 },
  internal.reminders.checkDeadlines
);

export default crons;
