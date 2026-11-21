// The HR operating system, as data. One entry per tab of the founders' tracker
// workbook (eCultify_Founder_HR_Recruitment_Tracker.xlsx): its columns, its
// dropdown lists and its ID prefix. Both sides read this file: convex/hrOps.ts
// checks every save against it, and the screens build their table and form
// from it, so a column is defined once.
//
// The grey "automatic" columns of the workbook (health, counts, days open) are
// not stored: src/lib/hrHealth.ts works them out from the rows.

/** `job` is a position from the website's roles (recruitJobs.sourceId, kept as
 *  text): it is what ties a hiring round to the people allowed to work on it. */
export type FieldType = "text" | "long" | "number" | "date" | "time" | "select" | "user" | "ref" | "job";

export type TrackerKey =
  | "rounds" | "pipeline" | "interviews" | "assignments" | "offers" | "onboarding"
  | "interns" | "campus" | "projects" | "tasks" | "log";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  /** For `ref`: the tracker whose row this points at. */
  ref?: TrackerKey;
  required?: boolean;
  /** Shown as a column in the list. The rest only appear in the form. */
  column?: boolean;
  /** Set to today on every save, so "no update in 5 days" needs no discipline. */
  stamp?: boolean;
  /** A value for new rows. "@me" is whoever is adding it, "@today" today's date. */
  initial?: string;
  /** Rarely touched: the form tucks it under "More details". */
  more?: boolean;
};

const PRIORITY = ["Critical", "High", "Medium", "Low"] as const;
const YES_NO = ["Yes", "No"] as const;
const DOC = ["Pending", "Received", "Verified", "Issue", "N/A"] as const;
const SETUP = ["Pending", "Done", "Issue", "N/A"] as const;

const f = (key: string, label: string, type: FieldType, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type,
  ...extra,
});
const col = { column: true } as const;

export const TRACKERS = {
  rounds: {
    label: "Hiring Rounds",
    one: "hiring round",
    prefix: "REQ",
    blurb: "One row is one hiring cycle. When a role reopens, add a new round. Never reuse an old one.",
    title: "role",
    hrOnly: false,
    fields: [
      f("role", "Position / role", "text", { required: true, ...col }),
      f("job", "Website position", "job", col),
      f("cycle", "Hiring cycle", "text", { more: true }),
      f("department", "Department", "text", { more: true }),
      f("employmentType", "Employment type", "select", {
        options: ["Full-time", "Intern", "Part-time", "Contract", "Freelance"],
        ...col,
      }),
      f("openings", "Openings", "number"),
      f("priority", "Priority", "select", { options: PRIORITY, ...col }),
      f("requestedBy", "Requested by", "user", { more: true }),
      f("hrOwner", "HR owner", "user", { initial: "@me", ...col }),
      f("hiringManager", "Hiring manager", "user"),
      f("requestDate", "Request date", "date", { initial: "@today" }),
      f("targetJoinDate", "Target join date", "date"),
      f("approvalStatus", "Approval status", "select", {
        options: ["Pending", "Approved", "Rejected", "To Confirm"],
        initial: "Pending",
        ...col,
      }),
      f("hiringStatus", "Hiring status", "select", {
        options: ["Open", "On Hold", "Closed - Filled", "Closed - Cancelled", "To Confirm"],
        initial: "Open",
        ...col,
      }),
      f("budgetLpa", "Budget approved (₹ LPA)", "number"),
      f("budgetNote", "Original budget / note", "text", { more: true }),
      f("nextAction", "Next action", "text", col),
      f("actionOwner", "Action owner", "user"),
      f("nextDue", "Next action due", "date", col),
      f("blocker", "Blocker / founder decision", "text"),
      f("notes", "Hiring notes", "long"),
      f("lastUpdate", "Last HR update", "date", { stamp: true }),
    ],
  },
  pipeline: {
    label: "Candidates",
    one: "candidate",
    prefix: "C",
    blurb: "One row is one candidate in one hiring round. Every live candidate needs an owner and a dated next step.",
    title: "name",
    hrOnly: false,
    board: "stage",
    boardClosed: ["Joined", "Rejected", "Withdrawn", "On Hold"],
    fields: [
      f("name", "Candidate name", "text", { required: true, ...col }),
      f("reqId", "Hiring round", "ref", { ref: "rounds", ...col }),
      f("roleOriginal", "Role (original)", "text"),
      f("contact", "Contact / email", "text"),
      f("source", "Source", "select", {
        options: ["LinkedIn", "Naukri", "Internshala", "Referral", "Campus", "Website", "Agency", "Other"],
      }),
      f("firstContact", "First contact date", "date", { initial: "@today" }),
      f("stage", "Pipeline stage", "select", {
        options: [
          "Sourced", "Contacted", "Screening", "Interview 1", "Interview 2", "Assignment",
          "Final Review", "Offer", "Joining", "Joined", "Rejected", "Withdrawn", "On Hold",
        ],
        initial: "Sourced",
        ...col,
      }),
      f("status", "Candidate status", "select", {
        options: ["Active", "On Hold", "Rejected", "Withdrawn", "Joined", "Archived"],
        initial: "Active",
        ...col,
      }),
      f("hrOwner", "HR owner", "user", { initial: "@me", ...col }),
      f("nextAction", "Next action", "text", col),
      f("actionOwner", "Action owner", "user"),
      f("nextDue", "Next action due", "date", col),
      f("verification", "Data verification", "select", {
        options: ["To Verify", "Verified", "Needs Correction"],
        initial: "Verified",
      }),
      f("origin", "Origin", "select", { options: ["New", "Imported"], initial: "New", more: true }),
      f("latestOutcome", "Latest outcome", "text", { more: true }),
      f("notes", "HR notes", "long"),
      f("lastUpdate", "Last update", "date", { stamp: true }),
    ],
  },
  interviews: {
    label: "Interviews",
    one: "interview",
    prefix: "I",
    blurb: "One row is one interview round. The interviewer owns timely written feedback; HR updates the outcome.",
    title: "candidateId",
    hrOnly: false,
    fields: [
      f("candidateId", "Candidate", "ref", { ref: "pipeline", required: true, ...col }),
      f("round", "Round", "select", {
        options: ["HR Screening", "Round 1", "Round 2", "Founder Round", "Technical Round", "Culture Round", "Final Round"],
        ...col,
      }),
      f("interviewer", "Interviewer", "user", col),
      f("mode", "Mode", "select", { options: ["In Person", "Google Meet", "Phone", "Other"] }),
      f("date", "Interview date", "date", col),
      f("time", "Time", "time", col),
      f("status", "Interview status", "select", {
        options: ["Planned", "Completed", "Rescheduled", "No Show", "Cancelled"],
        initial: "Planned",
        ...col,
      }),
      f("recommendation", "Recommendation", "select", {
        options: ["Pending", "Proceed", "Reject", "Hold"],
        initial: "Pending",
        ...col,
      }),
      f("feedbackDue", "Feedback due", "date", { more: true }),
      f("feedbackReceived", "Feedback received", "date", { more: true }),
      f("feedback", "Feedback", "long"),
      f("nextStep", "Next step", "text", { more: true }),
      f("nextStepOwner", "Next step owner", "user", { more: true }),
      f("notes", "Notes", "long"),
      f("lastUpdate", "Last updated", "date", { stamp: true }),
    ],
  },
  assignments: {
    label: "Assignments",
    one: "assignment",
    prefix: "AS",
    blurb: "One row is one test or assignment. Both the candidate's submission and the reviewer's turnaround are tracked.",
    title: "task",
    hrOnly: false,
    fields: [
      f("candidateId", "Candidate", "ref", { ref: "pipeline", required: true, ...col }),
      f("task", "Assignment / task", "text", { required: true, ...col }),
      f("assignedBy", "Assigned by", "user", { initial: "@me" }),
      f("sentDate", "Sent date", "date", { initial: "@today", ...col }),
      f("submissionDue", "Submission due", "date", col),
      f("receivedDate", "Received date", "date"),
      f("reviewer", "Reviewer", "user", col),
      f("reviewDue", "Review due", "date"),
      f("reviewedDate", "Reviewed date", "date"),
      f("decision", "Reviewer decision", "select", {
        options: ["Pending", "Shortlisted", "Rework", "Rejected", "Reviewed"],
        initial: "Pending",
        ...col,
      }),
      f("nextStep", "Next step", "text"),
      f("nextStepOwner", "Next step owner", "user"),
      f("nextDue", "Next due", "date"),
      f("notes", "Notes", "long"),
    ],
  },
  offers: {
    label: "Offers",
    one: "offer",
    prefix: "OF",
    blurb: "One row is one finalist offer: approvals, negotiation, acceptance and the joining date.",
    title: "candidateId",
    hrOnly: false,
    board: "stage",
    boardClosed: ["Declined", "Withdrawn"],
    fields: [
      f("candidateId", "Candidate", "ref", { ref: "pipeline", required: true, ...col }),
      f("stage", "Offer stage", "select", {
        options: ["Approval Required", "Approved", "Offer Sent", "Negotiating", "Accepted", "Declined", "Withdrawn"],
        initial: "Approval Required",
        ...col,
      }),
      f("approvalOwner", "Approval owner", "user"),
      f("approvalRequested", "Approval requested", "date"),
      f("approvalStatus", "Approval status", "select", {
        options: ["Pending", "Approved", "Rejected", "Not Required"],
        initial: "Pending",
        ...col,
      }),
      f("approvalDate", "Approval date", "date"),
      f("proposedCtc", "Proposed CTC (₹ LPA)", "number"),
      f("approvedCtc", "Approved CTC (₹ LPA)", "number", col),
      // For the appointment letter (see src/lib/appointmentLetter.ts).
      f("designation", "Designation on the letter", "text"),
      f("reportsTo", "Reports to (title and name)", "text"),
      f("probationCtc", "CTC during probation (₹ LPA), if lower", "number"),
      f("probationMonths", "Probation (months)", "number"),
      f("offerSent", "Offer sent date", "date"),
      f("offerAccepted", "Offer accepted date", "date"),
      f("plannedJoin", "Planned join date", "date", col),
      f("actualJoin", "Actual join date", "date"),
      f("noticeDays", "Notice period (days)", "number", { more: true }),
      f("hrOwner", "HR owner", "user", { initial: "@me" }),
      f("nextAction", "Next action", "text", col),
      f("nextDue", "Next action due", "date", col),
      f("blocker", "Blocker", "text"),
      f("notes", "Notes", "long"),
    ],
  },
  onboarding: {
    label: "Onboarding",
    one: "new joiner",
    prefix: "OB",
    blurb: "One row is one new joiner. Track that documents were checked, never the document numbers themselves.",
    title: "candidateId",
    hrOnly: true,
    fields: [
      f("candidateId", "Employee / candidate", "ref", { ref: "pipeline", required: true, ...col }),
      f("plannedJoining", "Planned joining", "date", col),
      f("actualJoining", "Actual joining", "date", col),
      f("hrOwner", "HR owner", "user", col),
      f("offerLetter", "Offer letter", "select", { options: DOC, initial: "Pending" }),
      f("idProof", "ID proof", "select", { options: DOC, initial: "Pending" }),
      f("pan", "PAN", "select", { options: DOC, initial: "Pending" }),
      f("bankDetails", "Bank details", "select", { options: DOC, initial: "Pending" }),
      f("addressProof", "Address proof", "select", { options: DOC, initial: "Pending" }),
      f("educationDocs", "Education docs", "select", { options: DOC, initial: "Pending" }),
      f("pastEmployment", "Past employment", "select", { options: DOC, initial: "Pending" }),
      f("bgv", "BGV", "select", { options: DOC, initial: "Pending" }),
      f("nda", "NDA / contract", "select", { options: DOC, initial: "Pending" }),
      f("itAccess", "IT access", "select", { options: SETUP, initial: "Pending" }),
      f("emailSetup", "Email setup", "select", { options: SETUP, initial: "Pending" }),
      f("induction", "Induction", "select", { options: SETUP, initial: "Pending" }),
      f("buddy", "Buddy assigned", "select", { options: SETUP, initial: "Pending" }),
      f("probationStart", "Probation start", "date"),
      f("nextAction", "Next action", "text", col),
      f("nextDue", "Next due date", "date", col),
      f("notes", "Notes", "long"),
    ],
  },
  interns: {
    label: "Interns",
    one: "internship",
    prefix: "IN",
    blurb: "One row is one internship: reviews, term dates, stipend approval and the conversion decision.",
    title: "name",
    hrOnly: true,
    fields: [
      f("name", "Intern name", "text", { required: true, ...col }),
      f("candidateId", "Candidate (if any)", "ref", { ref: "pipeline" }),
      f("institute", "Institute", "text"),
      f("role", "Role / department", "text", col),
      f("mentor", "Manager / mentor", "user", col),
      f("startDate", "Start date", "date"),
      f("endDate", "End date", "date", col),
      f("stipend", "Stipend (₹ / month)", "number"),
      f("stipendApproved", "Stipend approved", "select", { options: ["Pending", "Approved", "Rejected", "N/A"] }),
      f("status", "Internship status", "select", {
        options: ["Planned", "Active", "Extended", "Completed", "Terminated", "On Hold"],
        initial: "Planned",
        ...col,
      }),
      f("project", "Current project", "text"),
      f("lastReview", "Last review date", "date"),
      f("nextReview", "Next review due", "date", col),
      f("feedback", "Performance / feedback", "long"),
      f("conversion", "Conversion status", "select", {
        options: ["Not Started", "Under Review", "Recommended", "Offered", "Converted", "Not Converting"],
        ...col,
      }),
      f("conversionDue", "Conversion decision due", "date"),
      f("nextAction", "Next action", "text"),
      f("nextDue", "Next due date", "date"),
      f("notes", "Notes", "long"),
    ],
  },
  campus: {
    label: "Campus Connect",
    one: "institute",
    prefix: "COL",
    blurb: "One row is one institute relationship: the partner pipeline, campus drives and follow-ups.",
    title: "institute",
    hrOnly: true,
    fields: [
      f("institute", "Institute / college", "text", { required: true, ...col }),
      f("city", "City", "text", col),
      f("spoc", "Institute SPOC", "text"),
      f("contact", "Contact / email", "text"),
      f("owner", "Relationship owner", "user", col),
      f("roles", "Relevant roles", "text"),
      f("contactStarted", "Contact started", "date"),
      f("lastContact", "Last contact", "date", col),
      f("stage", "Relationship stage", "select", {
        options: ["Target", "Contacted", "Meeting Scheduled", "Discussion", "MoU / Approval", "Active Partner", "On Hold", "Closed"],
        initial: "Target",
        ...col,
      }),
      f("driveDate", "Campus drive date", "date"),
      f("profiles", "Profiles received", "number"),
      f("internOffers", "Intern offers", "number"),
      f("fullTimeOffers", "Full-time offers", "number"),
      f("nextAction", "Next action", "text", col),
      f("nextFollowUp", "Next follow-up", "date", col),
      f("blocker", "Blocker / approval", "text"),
      f("notes", "Notes", "long"),
    ],
  },
  projects: {
    label: "HR Projects",
    one: "HR project",
    prefix: "P",
    blurb: "One row is one long-running HR process: submit a draft, get feedback, get approval, implement.",
    title: "name",
    hrOnly: true,
    board: "stage",
    boardClosed: ["Implemented", "On Hold"],
    fields: [
      f("name", "Process / initiative", "text", { required: true, ...col }),
      f("deliverable", "Deliverable / success criteria", "long"),
      f("owner", "Owner", "user", col),
      f("requestedBy", "Requested by", "user"),
      f("priority", "Priority", "select", { options: PRIORITY }),
      f("kickoff", "Kickoff date", "date"),
      f("draftDue", "Draft due", "date"),
      f("stage", "Project stage", "select", {
        options: [
          "Not Started", "Research", "Drafting", "Submitted for Approval", "Feedback Pending",
          "Revision", "Approved", "Implemented", "On Hold",
        ],
        initial: "Not Started",
        ...col,
      }),
      f("approver", "Approver", "user"),
      f("draftSubmitted", "Draft submitted", "date"),
      f("feedbackDue", "Feedback due", "date"),
      f("feedbackReceived", "Feedback received", "date"),
      f("approvalDate", "Approval date", "date"),
      f("implementationDue", "Implementation due", "date"),
      f("implementedDate", "Implemented date", "date"),
      f("nextAction", "Next action", "text", col),
      f("nextDue", "Next due", "date", col),
      f("blocker", "Blocker / decision", "text"),
      f("notes", "Notes", "long"),
      f("lastUpdate", "Last update", "date", { stamp: true }),
    ],
  },
  tasks: {
    label: "Founder Tasks",
    one: "founder task",
    prefix: "TASK",
    blurb: "Founders add a row to hand HR a piece of work. HR keeps the status, next action and dates current.",
    title: "task",
    hrOnly: true,
    board: "status",
    boardClosed: ["Done", "Cancelled"],
    fields: [
      f("task", "Task / deliverable", "text", { required: true, ...col }),
      f("dateAssigned", "Date assigned", "date", { initial: "@today" }),
      f("assignedBy", "Assigned by", "user", { initial: "@me" }),
      f("workstream", "Workstream", "select", {
        options: ["Hiring", "Interview", "Assignment", "Offer", "Onboarding", "Interns", "Campus", "HR Project", "Policy", "Admin", "Other"],
        ...col,
      }),
      f("linkedId", "Linked record ID", "text"),
      f("assignedTo", "Assigned to", "user", col),
      f("priority", "Priority", "select", { options: PRIORITY, ...col }),
      f("dueDate", "Due date", "date", col),
      f("status", "Status", "select", {
        options: ["Not Started", "In Progress", "Waiting Approval", "Blocked", "Done", "Cancelled"],
        initial: "Not Started",
        ...col,
      }),
      f("approvalNeeded", "Approval needed", "select", { options: YES_NO }),
      f("approvalStatus", "Approval status", "select", {
        options: ["Not Required", "Pending", "Approved", "Changes Needed"],
      }),
      f("nextAction", "Next action", "text"),
      f("nextDue", "Next due", "date"),
      f("blockedBy", "Blocked by / decision", "text"),
      f("completedDate", "Completed date", "date"),
      f("notes", "Notes", "long"),
      f("lastUpdate", "Last update", "date", { stamp: true }),
    ],
  },
  log: {
    label: "Daily HR Log",
    one: "log entry",
    prefix: "LOG",
    blurb: "The daily progress journal: real movement, blockers and founder decisions. HR adds to it at end of day.",
    title: "action",
    hrOnly: true,
    fields: [
      f("date", "Date", "date", { required: true, initial: "@today", ...col }),
      f("member", "HR team member", "user", { initial: "@me", ...col }),
      f("workstream", "Workstream", "select", {
        options: ["Hiring", "Candidate", "Interview", "Assignment", "Offer", "Onboarding", "Interns", "Campus", "HR Project", "Founder Task", "Admin"],
        ...col,
      }),
      f("linkedId", "Linked req / project / task ID", "text"),
      f("action", "Action completed today", "text", { required: true, ...col }),
      f("outcome", "Outcome / metric", "text", col),
      f("pendingFrom", "Pending from", "text"),
      f("nextAction", "Next action", "text"),
      f("nextDue", "Next due", "date", col),
      f("blocker", "Blocker / help needed", "text"),
      f("founderAttention", "Founder attention?", "select", { options: YES_NO, initial: "No", ...col }),
      f("notes", "Notes", "long"),
    ],
  },
} as const satisfies Record<
  TrackerKey,
  {
    label: string;
    one: string;
    prefix: string;
    blurb: string;
    title: string;
    hrOnly: boolean;
    /** The dropdown the board view lays its columns out by. */
    board?: string;
    /** Board values that mean "finished": shown as slim drop targets at the end. */
    boardClosed?: readonly string[];
    fields: readonly Field[];
  }
>;

export const TRACKER_KEYS = Object.keys(TRACKERS) as TrackerKey[];
// Own keys only: "constructor" is `in` every object.
export const isTracker = (key: string): key is TrackerKey =>
  Object.prototype.hasOwnProperty.call(TRACKERS, key);

export type FieldValue = string | number | null;
export type Fields = Record<string, FieldValue>;

/** How much text a field holds. The form enforces it too, so nothing is cut silently. */
export const maxLength = (field: Field) => (field.type === "long" ? 5000 : 300);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Check one row's values against its tracker and return them cleaned: only
 * known keys, each of the right kind, blanks dropped. Throws a readable message
 * on the first problem. `ref` and `user` ids are checked by the caller, which
 * has the database.
 */
export function cleanFields(tracker: TrackerKey, input: Record<string, unknown>): Fields {
  const out: Fields = {};
  for (const field of TRACKERS[tracker].fields as readonly Field[]) {
    const raw = input[field.key];
    const blank = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
    if (blank) {
      if (field.required) throw new Error(`${field.label} is required`);
      continue;
    }
    if (field.type === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${field.label} must be a number`);
      out[field.key] = n;
      continue;
    }
    if (typeof raw !== "string") throw new Error(`${field.label} is not valid`);
    const text = raw.trim();
    if (field.type === "date" && !DATE.test(text)) throw new Error(`${field.label} must be a date`);
    if (field.type === "time" && !TIME.test(text)) throw new Error(`${field.label} must be a time`);
    if (field.type === "job" && !/^\d+$/.test(text)) throw new Error(`${field.label}: pick one from the list`);
    if (field.type === "select" && !field.options?.includes(text)) {
      throw new Error(`${field.label}: "${text.slice(0, 40)}" is not one of the options`);
    }
    if (text.length > maxLength(field)) throw new Error(`${field.label} is too long (${maxLength(field)} characters at most)`);
    out[field.key] = text;
  }
  return out;
}
