import type { Fields, TrackerKey } from "../../convex/lib/hrTrackers";

// The grey "automatic" columns of the founders' tracker workbook: health
// alerts, counts and the dashboard numbers. Each rule below is the workbook's
// own formula, kept in the same order, so the app and the sheet agree.
//
// ponytail: every lookup scans the rows it needs. Fine for hundreds of rows;
// build maps once per render if a tracker reaches thousands.

export type Row = {
  _id: string;
  tracker: TrackerKey;
  code: string;
  fields: Fields;
  /** Candidates and open positions: the pipeline they are on. */
  pipeline?: string;
  /** Candidates: whose they are. "" is not decided. */
  team?: string;
};
export type Book = Record<TrackerKey, Row[]>;

/** Today's date in India, as the trackers store dates (YYYY-MM-DD). */
export const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const text = (row: Row, key: string) => {
  const value = row.fields[key];
  return value === null || value === undefined ? "" : String(value);
};
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const past = (date: string, today: string) => date !== "" && date < today;
const olderThan = (date: string, today: string, limit: number) => date !== "" && days(date, today) > limit;

export function toBook(rows: Row[]): Book {
  const book = {
    rounds: [], pipeline: [], interviews: [], assignments: [], offers: [], onboarding: [],
    interns: [], campus: [], projects: [], log: [],
  } as Book;
  for (const row of rows) book[row.tracker]?.push(row);
  return book;
}

const DOCS = ["offerLetter", "idProof", "pan", "bankDetails", "addressProof", "educationDocs", "pastEmployment", "bgv", "nda"];
const SETUP = ["itAccess", "emailSetup", "induction", "buddy"];

/** Share of the nine onboarding documents that are verified or not needed. */
export const docsVerified = (row: Row) =>
  DOCS.filter((key) => ["Verified", "N/A"].includes(text(row, key))).length / DOCS.length;

/** The alert for one row. "" for the daily log, which has none. */
export function health(row: Row, book: Book, today: string): string {
  const t = (key: string) => text(row, key);
  switch (row.tracker) {
    case "rounds":
      if (["Closed - Filled", "Closed - Cancelled"].includes(t("hiringStatus"))) return "Closed";
      if (t("hiringStatus") === "To Confirm") return "Verify status";
      if (t("approvalStatus") !== "Approved") return "Approval pending";
      if (t("blocker")) return "Blocked";
      if (past(t("nextDue"), today)) return "Overdue";
      if (olderThan(t("lastUpdate"), today, 5)) return "Stale";
      return t("nextDue") ? "On Track" : "Needs next date";
    case "pipeline":
      if (t("verification") !== "Verified") return "Verify first";
      if (["Joined", "Rejected", "Withdrawn", "Archived"].includes(t("status"))) return "Closed";
      if (past(t("nextDue"), today)) return "Overdue";
      if (olderThan(t("lastUpdate"), today, 5)) return "Stale";
      return t("nextDue") ? "On Track" : "Needs next date";
    case "interviews":
      if (t("status") === "Completed") {
        if (t("feedbackReceived")) return "Received";
        if (!t("feedbackDue")) return "Set feedback due";
        return past(t("feedbackDue"), today) ? "Feedback overdue" : "Feedback pending";
      }
      if (t("status") === "Planned") return past(t("date"), today) ? "Interview overdue" : "Upcoming";
      return t("status") || "Set status";
    case "assignments":
      if (t("reviewedDate")) return "Reviewed";
      if (!t("sentDate")) return "Not sent";
      if (!t("receivedDate")) return past(t("submissionDue"), today) ? "Candidate overdue" : "Awaiting submission";
      return past(t("reviewDue"), today) ? "Review overdue" : "Under review";
    case "offers":
      if (["Declined", "Withdrawn"].includes(t("stage"))) return "Closed";
      if (t("actualJoin")) return "Joined";
      if (t("stage") === "Accepted" && past(t("plannedJoin"), today)) return "Join delayed";
      if (t("approvalStatus") === "Pending" && olderThan(t("approvalRequested"), today, 3)) return "Approval overdue";
      if (past(t("nextDue"), today)) return "Follow-up overdue";
      return t("stage") ? "On Track" : "Set offer stage";
    case "onboarding":
      if (!t("actualJoining")) return past(t("plannedJoining"), today) ? "Joining delayed" : "Joining pending";
      if (docsVerified(row) < 1) return "Docs pending";
      return SETUP.every((key) => ["Done", "N/A"].includes(t(key))) ? "Complete" : "Setup pending";
    case "interns":
      if (["Completed", "Terminated"].includes(t("status"))) return "Closed";
      if (past(t("nextReview"), today)) return "Review overdue";
      if (t("endDate") && t("endDate") >= today && days(today, t("endDate")) <= 14) return "End date near";
      return t("status") ? "On Track" : "Set status";
    case "campus":
      if (t("stage") === "Closed") return "Closed";
      if (past(t("nextFollowUp"), today)) return "Follow-up overdue";
      if (olderThan(t("lastContact"), today, 30)) return "No recent contact";
      return t("nextFollowUp") ? "On Track" : "Needs next date";
    case "projects":
      if (t("stage") === "Implemented") return "Complete";
      if (t("stage") === "On Hold") return "On Hold";
      if (t("stage") === "Feedback Pending" && past(t("feedbackDue"), today) && !t("feedbackReceived")) {
        return "Feedback overdue";
      }
      if (past(t("nextDue"), today)) return "Overdue";
      if (!t("nextDue")) return "Needs next date";
      return t("blocker") ? "Blocked" : "On Track";
    default:
      return "";
  }
}

/** The alerts the dashboard counts as "needs attention", per tracker. */
export const ATTENTION: Record<TrackerKey, readonly string[]> = {
  rounds: ["Verify status", "Approval pending", "Blocked", "Overdue", "Stale"],
  pipeline: ["Overdue", "Stale", "Needs next date"],
  interviews: ["Feedback overdue", "Interview overdue", "Set feedback due"],
  assignments: ["Candidate overdue", "Review overdue"],
  offers: ["Approval overdue", "Join delayed", "Follow-up overdue"],
  onboarding: ["Joining delayed", "Docs pending", "Setup pending"],
  interns: ["Review overdue", "End date near"],
  campus: ["Follow-up overdue", "No recent contact", "Needs next date"],
  projects: ["Overdue", "Feedback overdue", "Needs next date"],
  log: [],
};

const DONE = ["Closed", "Complete", "Reviewed", "Received", "Joined", "Cancelled", "No Show", "Rescheduled"];
const GOOD = ["On Track", "Upcoming"];
const BAD = [
  "Overdue", "Feedback overdue", "Interview overdue", "Candidate overdue", "Review overdue",
  "Approval overdue", "Join delayed", "Joining delayed", "Follow-up overdue", "Blocked",
];

/** How loud an alert is: late or blocked, waiting on something, fine, or finished. */
export function tone(label: string): "bad" | "warn" | "ok" | "done" {
  if (BAD.includes(label)) return "bad";
  if (GOOD.includes(label)) return "ok";
  return DONE.includes(label) ? "done" : "warn";
}

/** Still live: not closed, complete or otherwise finished. */
export const isLive = (label: string) => !DONE.includes(label);

/** The round a row belongs to, through its candidate where needed. */
function roundOf(row: Row, book: Book): string {
  if (row.tracker === "pipeline") return text(row, "reqId");
  const candidate = book.pipeline.find((c) => c._id === text(row, "candidateId"));
  return candidate ? text(candidate, "reqId") : "";
}

/** The workbook's calculated columns for one row, as label and value. */
export function derived(row: Row, book: Book, today: string): { label: string; value: string | number }[] {
  if (row.tracker === "rounds") {
    const mine = (rows: Row[]) => rows.filter((r) => roundOf(r, book) === row._id);
    const joined = mine(book.onboarding).filter((r) => text(r, "actualJoining")).length;
    const closed = ["Closed - Filled", "Closed - Cancelled"].includes(text(row, "hiringStatus"));
    const openings = row.fields.openings;
    return [
      { label: "Verified candidates", value: mine(book.pipeline).filter((r) => text(r, "verification") === "Verified").length },
      { label: "Interviews completed", value: mine(book.interviews).filter((r) => text(r, "status") === "Completed").length },
      { label: "Offers accepted", value: mine(book.offers).filter((r) => text(r, "stage") === "Accepted").length },
      { label: "Joined", value: joined },
      {
        label: "Vacancies left",
        value:
          typeof openings !== "number" ? "–" : text(row, "hiringStatus") === "Closed - Filled" ? 0 : Math.max(0, openings - joined),
      },
      { label: "Days open", value: closed || !text(row, "requestDate") ? "–" : days(text(row, "requestDate"), today) },
    ];
  }
  if (row.tracker === "pipeline") {
    const assignments = book.assignments.filter((a) => text(a, "candidateId") === row._id).map((a) => health(a, book, today));
    const offer = book.offers.find((o) => text(o, "candidateId") === row._id);
    return [
      { label: "Days since update", value: text(row, "lastUpdate") ? days(text(row, "lastUpdate"), today) : "–" },
      { label: "Interviews logged", value: book.interviews.filter((i) => text(i, "candidateId") === row._id).length },
      {
        label: "Assignments",
        value:
          assignments.length === 0
            ? "Not assigned"
            : assignments.includes("Review overdue")
              ? "Review overdue"
              : assignments.includes("Candidate overdue")
                ? "Candidate overdue"
                : "In progress / reviewed",
      },
      { label: "Offer", value: offer ? text(offer, "stage") || "Started" : "Not initiated" },
    ];
  }
  if (row.tracker === "onboarding") {
    return [{ label: "Docs verified", value: `${Math.round(docsVerified(row) * 100)}%` }];
  }
  return [];
}

/** Vacancies left on a round, as a number (0 when it cannot be worked out). */
export function vacancies(round: Row, book: Book, today: string): number {
  const value = derived(round, book, today).find((d) => d.label === "Vacancies left")?.value;
  return typeof value === "number" ? value : 0;
}

/** The founders' dashboard: one line per workstream, open against needs attention. */
export function radar(book: Book, today: string) {
  const labels = (key: TrackerKey) => book[key].map((row) => health(row, book, today));
  const attention = (key: TrackerKey) => labels(key).filter((l) => ATTENTION[key].includes(l)).length;
  const weekAgo = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);
  const thisWeek = book.log.filter((r) => text(r, "date") >= weekAgo);
  const count = (key: TrackerKey, keep: (row: Row, label: string) => boolean) =>
    book[key].filter((row) => keep(row, health(row, book, today))).length;
  return [
    {
      key: "rounds" as TrackerKey,
      label: "Hiring rounds",
      open: count("rounds", (r) => ["Open", "On Hold"].includes(text(r, "hiringStatus"))),
      attention: attention("rounds"),
      check: "Confirm every cycle, approve scope, note owner, due date and blockers",
    },
    {
      key: "pipeline" as TrackerKey,
      label: "Candidates",
      open: count("pipeline", (r) => text(r, "verification") === "Verified" && text(r, "status") === "Active"),
      attention: attention("pipeline"),
      check: "Every live candidate needs an owner, last update and dated next step",
    },
    {
      key: "interviews" as TrackerKey,
      label: "Interviews",
      open: count("interviews", (r, l) => text(r, "status") === "Planned" || l === "Feedback pending"),
      attention: attention("interviews"),
      check: "Interviewer, round, decision and feedback turnaround",
    },
    {
      key: "assignments" as TrackerKey,
      label: "Assignments",
      open: count("assignments", (_r, l) => ["Awaiting submission", "Under review", "Candidate overdue", "Review overdue"].includes(l)),
      attention: attention("assignments"),
      check: "Submission dates and who must review the submitted work",
    },
    {
      key: "offers" as TrackerKey,
      label: "Offers",
      open: count("offers", (_r, l) => !["Closed", "Joined"].includes(l)),
      attention: attention("offers"),
      check: "Approvals, offer status, joining commitment and salary sign-off",
    },
    {
      key: "onboarding" as TrackerKey,
      label: "Onboarding",
      open: count("onboarding", (_r, l) => l !== "Complete"),
      attention: attention("onboarding"),
      check: "Documents verified, BGV, IT and email, induction",
    },
    {
      key: "interns" as TrackerKey,
      label: "Interns",
      open: count("interns", (r) => ["Active", "Extended"].includes(text(r, "status"))),
      attention: attention("interns"),
      check: "Reviews, extensions, stipend approval and the conversion pipeline",
    },
    {
      key: "campus" as TrackerKey,
      label: "Campus connect",
      open: count("campus", (r) => text(r, "stage") !== "Closed"),
      attention: attention("campus"),
      check: "Relationships, campus drive plan and next outreach date",
    },
    {
      key: "projects" as TrackerKey,
      label: "HR tasks",
      open: count("projects", (r) => text(r, "stage") !== "Implemented"),
      attention: attention("projects"),
      check: "Draft, feedback, founder approval, implementation",
    },
    {
      key: "log" as TrackerKey,
      label: "Daily log (7 days)",
      open: thisWeek.length,
      attention: thisWeek.filter((r) => text(r, "founderAttention") === "Yes").length,
      check: "Daily completed actions, escalations and next working-day priorities",
    },
  ];
}

/** The five headline numbers and the import check line. */
export function headline(book: Book, today: string) {
  const live = book.rounds.filter((r) => ["Open", "On Hold"].includes(text(r, "hiringStatus")));
  const open = book.rounds.filter((r) => text(r, "hiringStatus") === "Open");
  const logDates = book.log.map((r) => text(r, "date")).filter(Boolean).sort();
  return {
    activeCycles: live.length,
    vacantSeats: live.reduce((sum, r) => sum + vacancies(r, book, today), 0),
    activeCandidates: book.pipeline.filter((r) => text(r, "verification") === "Verified" && text(r, "status") === "Active").length,
    approvals:
      open.filter((r) => ["To Confirm", "Pending"].includes(text(r, "approvalStatus"))).length +
      book.offers.filter((r) => text(r, "approvalStatus") === "Pending").length +
      book.projects.filter((r) => text(r, "stage") === "Submitted for Approval").length,
    lastLog: logDates.at(-1) ?? "",
    roundsToConfirm: book.rounds.filter((r) => text(r, "hiringStatus") === "To Confirm").length,
    candidatesToVerify: book.pipeline.filter((r) => text(r, "verification") === "To Verify").length,
  };
}
