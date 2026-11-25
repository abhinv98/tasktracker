"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight, ArrowRight, Check, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, StatusBadge, useConfirm, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { Tray, TrayItem } from "@/components/ui/Tray";
import { STANDARD, type Step } from "@/convex/lib/hirePipeline";
import { webLink } from "@/convex/lib/links";
import { TRACKERS, type TrackerKey } from "@/convex/lib/hrTrackers";
import { health, type Row } from "@/lib/hrHealth";
import { formatLpa, formatYears, parseCtcLpa, parseYears } from "@/lib/recruitParse";
import { VERDICTS, type Verdict } from "@/lib/recruitStages";
import { taskStatusMeta } from "@/lib/status";
import { AssignTask } from "./AssignTask";
import { FieldGrid, InlineAdd, toValues, useQuickSave } from "./hrFields";
import { JoinTeam } from "./JoinTeam";
import { MoveApplicants } from "./MoveApplicants";
import { HealthBadge, addDays, boardValue, fieldsOf, fmtDate, moveFields, show, type HrData } from "./hrShared";

const text = (row: Row, key: string) => {
  const value = row.fields[key];
  return value === null || value === undefined ? "" : String(value);
};

const CLOSED: readonly string[] = TRACKERS.pipeline.boardClosed;
/** What this panel edits itself; "All details" holds the rest. */
const OWN_FIELDS = ["stage", "nextAction", "actionOwner", "nextDue", "notes", "team"];
const NEXT_KEYS = ["nextAction", "nextDue", "actionOwner", "notes"] as const;
type NextKey = (typeof NEXT_KEYS)[number];

/** What a step asks for, said once, where its pipeline says nothing itself. */
const HINT: Partial<Record<Step["kind"], string>> = {
  sourcing: "Reach out to them. Once they answer, move them on.",
  screening: "Call them and check the basics: notice period, pay and fit. Then move them on, or close them.",
  interview: "Schedule it. When it is over, open it to write the feedback, then move them on.",
  assignment: "Send the assignment. When it comes back, paste the link, then move them on.",
  review: "Look at everything so far and decide.",
  offer: "Agree the offer and send it. Once they accept, move them to joining.",
  joining: "Get them onto their team in the task tracker.",
};
type Adding = TrackerKey | "tasks" | null;
/** An interview that did not happen does not count as the step's interview. */
const OFF = ["Cancelled", "No Show", "Rescheduled"];

/**
 * Everything about one candidate in one place, in the order it is needed: who
 * they are, what to do now, what happens next, and what has happened so far.
 * Replaces the plain form for the Candidates tracker, because a candidate is
 * worked on, not filled in.
 */
export function CandidateWorkspace({ row, data, onClose }: { row: Row; data: HrData; onClose: () => void }) {
  const quickSave = useQuickSave();
  const remove = useMutation(api.hrOps.remove);
  const askConfirm = useConfirm();
  const { toast } = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState<Adding>(null);
  const [moving, setMoving] = useState(false);
  // Only what this person has typed is kept here. Everything else is read from
  // the live row, so a change made elsewhere (or by a button above) is never
  // sent back as if it were an edit.
  const [nextEdits, setNextEdits] = useState<Partial<Record<NextKey, string>>>({});
  const next = Object.fromEntries(NEXT_KEYS.map((k) => [k, nextEdits[k] ?? text(row, k)])) as Record<NextKey, string>;
  const setNext = (key: NextKey, value: string) => setNextEdits((e) => ({ ...e, [key]: value }));
  const nextChanges = Object.fromEntries(
    NEXT_KEYS.filter((k) => nextEdits[k] !== undefined && nextEdits[k]!.trim() !== text(row, k).trim()).map((k) => [
      k,
      nextEdits[k]!.trim() || null,
    ])
  );
  const nextChanged = Object.keys(nextChanges).length > 0;
  // A next step with nobody named is whoever wrote it down.
  const nextSaved = {
    ...nextChanges,
    ...(!next.actionOwner && ("nextAction" in nextChanges || "nextDue" in nextChanges) && (next.nextAction.trim() || next.nextDue) ? { actionOwner: data.me } : {}),
  };

  // Someone who applied on the website changes position together with their application (the Move button).
  const applicantId = text(row, "applicantId");
  const detailFields = fieldsOf("pipeline").filter((f) => !f.stamp && !f.auto && !OWN_FIELDS.includes(f.key) && !(applicantId && f.key === "job"));
  const live = Object.fromEntries(detailFields.map((f) => [f.key, text(row, f.key)]));
  const [detailEdits, setDetailEdits] = useState<Record<string, string>>({});
  const details = { ...live, ...detailEdits };
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Keyboard and screen-reader users start inside the panel, not behind it.
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Escape closes an open menu first, not the whole panel with what was typed.
      if (e.key !== "Escape" || document.querySelector('dialog[open], aside[role="dialog"] [aria-expanded="true"]')) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Closed by stage or by status: either way they are out of the running.
  const steps = data.stepsOf(row);
  const stage = boardValue(row) ?? text(row, "status");
  const closed = stage === "Archived" || CLOSED.includes(stage);
  const at = steps.findIndex((s) => s.name === text(row, "stage"));
  const step = closed ? undefined : steps[at];
  /** What to fill in for an interview or assignment: this step's, or the next one of its kind. */
  const planned = (kind: Step["kind"]) => (step?.kind === kind ? step : steps.slice(Math.max(at, 0)).find((s) => s.kind === kind)) ?? steps.find((s) => s.kind === kind);
  const interviewStep = step?.kind === "screening" ? step : planned("interview");
  const assignmentStep = planned("assignment");
  const round = data.byId.get(text(row, "reqId"));
  /** Where everyone in their hiring round hands the assignment in, if it has one place. */
  const form = round ? webLink(text(round, "submitLink")) : "";
  const mine = (tracker: TrackerKey) => data.book[tracker].filter((r) => r.fields.candidateId === row._id);
  const interviews = mine("interviews");
  const assignments = mine("assignments");
  const offer = mine("offers")[0];
  const resume = text(row, "resume");
  const today = data.today;
  // Given to them, their round's, or their position's only one (hrOps.all).
  const team = row.team ?? "";
  const teams = data.teamsOf(row);
  /** Far enough for their team to matter. */
  const hiring = step?.kind === "offer" || step?.kind === "joining" || stage === "Joined" || text(row, "status") === "Joined";

  /** One click moves the candidate. A closing stage sets the matching status too. */
  const moveTo = (to: string) =>
    quickSave(row, moveFields("pipeline", to), `${text(row, "name")} moved to ${to}`);

  const openRow = (other: Row) => router.push(`/recruitment/t/${other.tracker}?open=${other._id}`);

  // What this step comes down to, what is already there for it, and where they go after it.
  const action = step ? ACTION[step.kind] : undefined;
  const forStep = !step
    ? []
    : step.kind === "screening" || step.kind === "interview"
      ? interviews.filter((r) => text(r, "status") === "Planned" || (text(r, "round") === step.name && !OFF.includes(text(r, "status"))))
      : step.kind === "assignment"
        ? assignments
        : step.kind === "offer" && offer
          ? [offer]
          : [];
  const actFirst = !!action && forStep.length === 0;
  /** Something with a date was just planned: unless a later next step is already down, that is the next step. */
  const plan = (what: string, due: string, who: string) => {
    if (!due || due < today || (text(row, "nextDue") >= today && text(row, "nextDue") <= due)) return;
    void quickSave(row, { nextAction: what, nextDue: due, ...(who ? { actionOwner: who } : {}) });
  };
  const after = !closed && at >= 0 ? steps[at + 1] : undefined;
  const facts = [
    ["Experience", formatYears(parseYears(text(row, "experience")))],
    ...(data.pay ? [["Current CTC", formatLpa(parseCtcLpa(text(row, "currentCtc")))], ["Expected CTC", formatLpa(parseCtcLpa(text(row, "expectedCtc")))]] : []),
    ["Notice", text(row, "noticePeriod")],
    ["Applied", text(row, "appliedOn") && fmtDate(text(row, "appliedOn"), today)],
    ["Shortlisted", text(row, "firstContact") && fmtDate(text(row, "firstContact"), today)],
  ].filter(([, value]) => value);
  const lineOf = (r: Row): (string | false | undefined)[] =>
    r.tracker === "interviews"
      ? [text(r, "round") || "Interview", fmtDate(text(r, "date"), today), text(r, "time"), data.personName(text(r, "interviewer"))]
      : r.tracker === "assignments"
        ? [text(r, "task"), text(r, "submissionDue") && `due ${fmtDate(text(r, "submissionDue"), today)}`, data.personName(text(r, "reviewer"))]
        : [
            text(r, "stage") || "Offer",
            text(r, "approvedCtc") ? `₹${text(r, "approvedCtc")} LPA approved` : text(r, "proposedCtc") && `₹${text(r, "proposedCtc")} LPA proposed`,
            text(r, "plannedJoin") && `joining ${fmtDate(text(r, "plannedJoin"), today)}`,
          ];
  const ADD: [Exclude<Adding, null>, string][] = [
    ["interviews", "Interview"],
    ["assignments", "Assignment"],
    ["tasks", "Task"],
    ...(offer ? [] : ([["offers", "Offer"]] as [Exclude<Adding, null>, string][])),
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Candidate ${text(row, "name")}`}
        className="animate-slidePanelIn fixed right-0 top-0 z-50 flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-[var(--text-primary)]">{text(row, "name")}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              {[
                row.code,
                round ? `${round.code} · ${text(round, "role")}` : text(row, "roleOriginal") || "Not in a hiring round yet",
                text(row, "contact"),
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {resume && (
              <a
                href={resume}
                target="_blank"
                rel="noreferrer"
                className="mr-1 inline-flex h-control items-center gap-1 rounded-control border border-[var(--border)] px-2.5 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Resume <ExternalLink size={12} aria-hidden />
              </a>
            )}
            {applicantId && (
              <button type="button" aria-label="Move to another position" title="Move to another position" className={iconButtonClass} onClick={() => setMoving(true)}>
                <ArrowLeftRight size={15} />
              </button>
            )}
            <button
              type="button"
              aria-label={`Delete ${row.code}`}
              className={iconButtonDangerClass}
              onClick={() =>
                askConfirm({
                  title: `Delete ${text(row, "name")}?`,
                  message: "They are taken off Candidates for everyone. It cannot be undone.",
                  onConfirm: async () => {
                    await remove({ id: row._id as Id<"hrRecords"> });
                    onClose();
                  },
                })
              }
            >
              <Trash2 size={15} />
            </button>
            <button ref={closeButton} type="button" aria-label="Close panel" className={iconButtonClass} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {text(row, "verification") !== "Verified" && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--warning-dim)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
              <span>Brought over from the old log and not checked yet, so it is not counted as live.</span>
              <Button size="sm" variant="secondary" onClick={() => quickSave(row, { verification: "Verified" }, "Marked as verified")}>
                Mark verified
              </Button>
            </div>
          )}

          {/* Who they are, at a glance. */}
          {facts.length > 0 && (
            <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[12px] text-[var(--text-muted)]">{label}</dt>
                  <dd className="text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Where they are, and the one thing to do about it. */}
          <section aria-label="Stage" className="rounded-lg border border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2">
              {steps.map(({ id, name: s }, i) => {
                const current = !closed && s === stage;
                const done = !closed && at > i;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={current}
                    title={current ? "They are here" : `Move to ${s}`}
                    onClick={() => !current && moveTo(s)}
                    className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                      current
                        ? "bg-[var(--text-primary)] font-semibold text-white"
                        : done
                          ? "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {done && <Check size={11} aria-hidden />}
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{closed ? `Closed: ${stage}` : step ? step.name : stage || "No stage yet"}</h3>
                <HealthBadge label={health(row, data.book, today)} />
                {row.pipeline && row.pipeline !== STANDARD && <span className="text-[12px] text-[var(--text-muted)]">{data.pipelineName(row.pipeline)} pipeline</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--text-secondary)]">
                {closed
                  ? "They are out of the running. Pick a stage above to bring them back."
                  : !step
                    ? "Their pipeline has no such stage. Pick one above."
                    : step.note || HINT[step.kind] || "When this is done, move them on."}
              </p>
              {step && (step.owner || step.days) && (
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  {[step.owner && `Usually ${data.personName(step.owner)}`, step.days && `takes about ${step.days} ${step.days === 1 ? "day" : "days"}`].filter(Boolean).join(", ")}
                </p>
              )}
              {step?.link && <LinkOut href={step.link} label={step.kind === "assignment" ? "Open the assignment" : "Open the link"} />}

              {/* What is already there for this step: open it to finish it. */}
              {forStep.length > 0 && (
                <ul className="mt-3 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)]">
                  {forStep.map((r) => (
                    <li key={r._id}>
                      <button
                        type="button"
                        onClick={() => openRow(r)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">{lineOf(r).filter(Boolean).join("  ·  ")}</span>
                        <HealthBadge label={health(r, data.book, today)} />
                        <span className="shrink-0 text-[12px] font-medium text-[var(--accent-admin-text)]">{r.tracker === "interviews" ? "Add feedback" : "Open"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!closed && action && !(action.tracker === "offers" && offer) && (
                    <Button type="button" variant={actFirst ? "primary" : "secondary"} onClick={() => setAdding(action.tracker)}>
                      {actFirst ? action.label : action.again}
                    </Button>
                  )}
                  {!closed && after && (
                    <Button type="button" variant={actFirst ? "secondary" : "primary"} onClick={() => moveTo(after.name)}>
                      Move to {after.name}
                      <ArrowRight size={14} aria-hidden />
                    </Button>
                  )}
                  {!closed && !after && step?.kind === "joining" && (
                    <Button type="button" onClick={() => moveTo("Joined")}>
                      <Check size={14} aria-hidden />
                      They have joined
                    </Button>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {/* Also for someone closed: held can still be rejected, without bringing them back first. */}
                    {stage !== "On Hold" && (
                      <Button type="button" variant="ghost" onClick={() => moveTo("On Hold")}>
                        Hold
                      </Button>
                    )}
                    {stage !== "Rejected" && (
                      <Button type="button" variant="ghost" className="!text-[var(--danger)]" onClick={() => moveTo("Rejected")}>
                        Reject
                      </Button>
                    )}
                    <Tray label="More" width="w-44" align="end">
                      {CLOSED.filter((c) => c !== "Rejected" && c !== "On Hold" && c !== stage).map((c) => (
                        <TrayItem key={c} label={c} onSelect={() => moveTo(c)} />
                      ))}
                    </Tray>
                  </span>
                </div>
              )}

              {/* Anything else that needs adding, whatever the stage. */}
              {!adding && (
                <p className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-[var(--border-subtle)] pt-2.5 text-[12px] text-[var(--text-muted)]">
                  Add
                  {ADD.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAdding(key)}
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)]"
                    >
                      <Plus size={11} aria-hidden />
                      {label}
                    </button>
                  ))}
                </p>
              )}

              {adding && (
                <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                  <h4 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">{ADDING[adding]}</h4>
                  {adding === "interviews" && (
                    <InlineAdd
                      tracker="interviews"
                      keys={["round", "interviewer", "date", "time", "mode"]}
                      required={["interviewer", "date"]}
                      preset={{ candidateId: row._id, ...(interviewStep ? { round: interviewStep.name, ...(interviewStep.owner ? { interviewer: interviewStep.owner } : {}) } : {}) }}
                      data={data}
                      submitLabel="Schedule and tell the interviewer"
                      onSaved={(v) => plan(v.round || "Interview", v.date ?? "", v.interviewer ?? "")}
                      onDone={() => setAdding(null)}
                    />
                  )}
                  {adding === "assignments" && (
                    <InlineAdd
                      tracker="assignments"
                      keys={["task", "link", "submissionDue", "reviewer", "reviewDue"]}
                      preset={{
                        candidateId: row._id,
                        ...(assignmentStep?.note ? { task: assignmentStep.note.split("\n")[0].slice(0, 300) } : {}),
                        ...(assignmentStep?.link ? { link: assignmentStep.link } : {}),
                        ...(assignmentStep?.owner ? { reviewer: assignmentStep.owner } : {}),
                        ...(assignmentStep?.days ? { submissionDue: addDays(today, assignmentStep.days) } : {}),
                      }}
                      data={data}
                      submitLabel="Add assignment"
                      onSaved={(v) => plan("Assignment due back", v.submissionDue ?? "", v.reviewer ?? "")}
                      onDone={() => setAdding(null)}
                    />
                  )}
                  {adding === "offers" && (
                    <InlineAdd
                      tracker="offers"
                      keys={["proposedCtc", "approvalOwner", "designation", "plannedJoin"]}
                      preset={{ candidateId: row._id, approvalRequested: today }}
                      data={data}
                      submitLabel="Start offer"
                      onDone={() => setAdding(null)}
                    />
                  )}
                  {adding === "tasks" && <AssignTask data={data} candidateId={row._id} onDone={() => setAdding(null)} />}
                </div>
              )}
            </div>
          </section>

          {/* What happens next, and when. Most visits change only this. */}
          <form
            className="mt-4 rounded-lg border border-[var(--border)] p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await quickSave(row, nextSaved, "Saved")) setNextEdits({});
            }}
          >
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Next step</h3>
            <p className="mb-2 text-[12px] text-[var(--text-muted)]">
              {closed ? "Nothing is expected while they are closed." : text(row, "nextDue") ? "What you will do next, and by when." : "Say what you will do next and by when, so nobody is forgotten."}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px]">
              <input
                value={next.nextAction}
                maxLength={300}
                aria-label="What happens next"
                onChange={(e) => setNext("nextAction", e.target.value)}
                placeholder="What happens next, e.g. call to check notice period"
                className={`${fieldClass} w-full`}
              />
              <select value={next.actionOwner} aria-label="Who does it" onChange={(e) => setNext("actionOwner", e.target.value)} className={`${fieldClass} w-full`}>
                <option value="">Me</option>
                {data.people.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-[var(--text-muted)]">By</span>
              {(
                [
                  ["Today", 0],
                  ["Tomorrow", 1],
                  ["In 3 days", 3],
                  ["Next week", 7],
                ] as const
              ).map(([label, days]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={next.nextDue === addDays(today, days)}
                  onClick={() => setNext("nextDue", addDays(today, days))}
                  className={`h-7 rounded-full border px-2.5 text-[12px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                    next.nextDue === addDays(today, days)
                      ? "border-[var(--text-primary)] bg-[var(--text-primary)] font-medium text-white"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {label}
                </button>
              ))}
              <input type="date" value={next.nextDue} aria-label="By when" onChange={(e) => setNext("nextDue", e.target.value)} className={`${fieldClass} !h-7 w-[140px] text-[12px]`} />
            </div>
            <textarea
              value={next.notes}
              rows={2}
              maxLength={5000}
              aria-label="Notes"
              placeholder="Notes: what was said, what to remember"
              onChange={(e) => setNext("notes", e.target.value)}
              className={`${fieldBaseClass} mt-2 w-full py-2`}
            />
            <div className="mt-2 flex justify-end">
              <Button type="submit" size="sm" disabled={!nextChanged}>
                Save
              </Button>
            </div>
          </form>

          {/* What has happened so far. Empty kinds take no room. */}
          <CandidateTasks row={row} data={data} />
          {interviews.length > 0 && (
            <Related
              title="Interviews"
              rows={interviews}
              data={data}
              onOpen={openRow}
              line={lineOf}
              detail={(r) => [VERDICTS[text(r, "recommendation") as Verdict]?.label, text(r, "feedback")].filter(Boolean).join(": ")}
            />
          )}
          {(assignments.length > 0 || form) && (
            <Related
              title="Assignments"
              rows={assignments}
              data={data}
              onOpen={openRow}
              line={lineOf}
              detail={(r) => (text(r, "decision") !== "Pending" ? text(r, "decision") : "")}
              top={form && <LinkOut href={form} label={`Submission form for ${round!.code}`} />}
              under={(r) => <AssignmentLinks row={r} />}
            />
          )}
          {offer && (
            <Related
              title="Offer"
              rows={[offer]}
              data={data}
              onOpen={openRow}
              line={lineOf}
              detail={() => (data.pay ? "Open it to approve, edit or download the appointment letter." : "Open it to follow it along.")}
            />
          )}

          {/* Which team they join, and getting them onto it once they are hired. */}
          {data.teams.length > 0 && (hiring || team || teams.length > 1) && (
            <section className="mt-6">
              <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Team</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={team}
                  aria-label="Team they join"
                  onChange={(e) => void quickSave(row, { team: e.target.value || null }, e.target.value ? `Joining ${data.teamName(e.target.value)}` : "Team cleared")}
                  className={`${fieldClass} w-[220px]`}
                >
                  {(teams.length !== 1 && !(team && data.positionOf(row.fields)?.divide)) && <option value="">Not decided</option>}
                  {data.teams
                    .filter((t) => !teams.length || teams.includes(t._id) || t._id === team)
                    .map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                {!team && (
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {hiring
                      ? `${teams.length > 1 ? `${teams.map(data.teamName).join(" or ")}. ` : ""}Pick the team they join.`
                      : `${teams.map(data.teamName).join(" or ")}. Pick one before the offer.`}
                  </span>
                )}
              </div>
              {data.full && hiring && team && (
                <JoinTeam key={team} row={row} data={data} designation={(offer && text(offer, "designation")) || (round ? text(round, "role") : text(row, "roleOriginal"))} />
              )}
            </section>
          )}

          <details className="mt-6 rounded-lg border border-[var(--border)]">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-[13px] font-semibold text-[var(--text-primary)]">
              All details
              <span className="ml-2 font-normal text-[var(--text-muted)]">
                {[show(fieldsOf("pipeline").find((f) => f.key === "hrOwner")!, row, data) && `HR owner ${data.personName(text(row, "hrOwner"))}`, text(row, "lastUpdate") && `updated ${fmtDate(text(row, "lastUpdate"), today)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </summary>
            <form
              className="border-t border-[var(--border-subtle)] p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const values = toValues(detailFields, details, live);
                if (Object.keys(values).length === 0) return toast("success", "Nothing changed");
                if (await quickSave(row, values, "Saved")) setDetailEdits({});
              }}
            >
              <FieldGrid fields={detailFields} draft={details} onChange={(key, value) => setDetailEdits((d) => ({ ...d, [key]: value }))} data={data} />
              <div className="mt-3 flex justify-end">
                <Button type="submit" size="sm" variant="secondary">
                  Save details
                </Button>
              </div>
            </form>
          </details>
        </div>
      </aside>
      {moving && (
        <MoveApplicants
          ids={[applicantId as Id<"recruitCandidates">]}
          who={text(row, "name")}
          from={Number(text(row, "job"))}
          onClose={() => setMoving(false)}
        />
      )}
    </>
  );
}

function LinkOut({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
    >
      {label} <ExternalLink size={12} aria-hidden />
    </a>
  );
}

/** An assignment's links, and a place to paste what came back. */
function AssignmentLinks({ row }: { row: Row }) {
  const quickSave = useQuickSave();
  const [draft, setDraft] = useState<string | null>(null);
  const assignment = webLink(text(row, "link"));
  const work = webLink(text(row, "submission"));
  if (draft !== null) {
    return (
      <form
        className="flex gap-2 px-3 pb-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await quickSave(row, { submission: draft.trim() || null }, "Saved")) setDraft(null);
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Submitted link for ${text(row, "task")}`}
          inputMode="url"
          placeholder="Link to what they submitted"
          maxLength={500}
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <Button type="button" size="sm" variant="secondary" onClick={() => setDraft(null)}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 px-3 pb-2">
      {assignment && <LinkOut href={assignment} label="Assignment" />}
      {work && <LinkOut href={work} label="Submitted" />}
      <button
        type="button"
        onClick={() => setDraft(text(row, "submission"))}
        className="mt-1 text-[12px] font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
      >
        {work ? "Change submitted link" : "Add submitted link"}
      </button>
    </div>
  );
}

/** The one thing most steps come down to, and what it is called when there is one already. */
const ACTION: Partial<Record<Step["kind"], { label: string; again: string; tracker: TrackerKey }>> = {
  screening: { label: "Schedule the call", again: "Another call", tracker: "interviews" },
  interview: { label: "Schedule interview", again: "Another interview", tracker: "interviews" },
  assignment: { label: "Send the assignment", again: "Another assignment", tracker: "assignments" },
  offer: { label: "Start an offer", again: "Start an offer", tracker: "offers" },
};
const ADDING: Record<string, string> = { interviews: "Schedule an interview", assignments: "Send an assignment", offers: "Start an offer", tasks: "Assign a task" };

/** What people on the team have to do about this candidate. Each is an ordinary task in its owner's list. */
function CandidateTasks({ row, data }: { row: Row; data: HrData }) {
  const tasks = useQuery(api.recruitTasks.forCandidate, { candidateId: row._id as Id<"hrRecords"> });
  if (!tasks?.length) return null;
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
        Tasks <span className="ml-1 font-normal tabular-nums text-[var(--text-muted)]">{tasks.length}</span>
      </h3>
      <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)]">
        {tasks.map((t) => (
          <li key={t._id}>
            <TaskLine href={t.canOpenTask ? `/brief/${t.briefId}?task=${t._id}` : null}>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
                {[t.title, t.assignee, t.deadline && `due ${fmtDate(new Date(t.deadline + 5.5 * 3_600_000).toISOString().slice(0, 10), data.today)}`]
                  .filter(Boolean)
                  .join("  ·  ")}
              </span>
              <StatusBadge color={taskStatusMeta(t.status).dot} label={taskStatusMeta(t.status).label} />
            </TaskLine>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A link when the task's brief opens for this person, a plain line when it does not. */
function TaskLine({ href, children }: { href: string | null; children: React.ReactNode }) {
  const line = "flex items-center gap-3 px-3 py-2";
  return href ? (
    <Link
      href={href}
      className={`${line} hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]`}
    >
      {children}
    </Link>
  ) : (
    <div className={line}>{children}</div>
  );
}

/** One kind of thing that hangs off the candidate: what there is of it. Adding is done from the stage, above. */
function Related({
  title,
  rows,
  data,
  line,
  detail,
  top,
  under,
  onOpen,
}: {
  title: string;
  rows: Row[];
  data: HrData;
  line: (row: Row) => (string | false | undefined)[];
  detail: (row: Row) => string;
  /** Said once, above the rows. */
  top?: React.ReactNode;
  /** More about one row, outside the button that opens it. */
  under?: (row: Row) => React.ReactNode;
  onOpen: (row: Row) => void;
}) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
        {title}
        {rows.length > 0 && <span className="ml-1.5 font-normal tabular-nums text-[var(--text-muted)]">{rows.length}</span>}
      </h3>
      {top && <div className="mb-2">{top}</div>}
      {rows.length > 0 && (
        <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)]">
          {rows.map((r) => (
            <li key={r._id}>
              <button
                type="button"
                onClick={() => onOpen(r)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--text-primary)]">{line(r).filter(Boolean).join("  ·  ")}</span>
                  {detail(r) && <span className="mt-0.5 line-clamp-2 text-[12px] text-[var(--text-muted)]">{detail(r)}</span>}
                </span>
                <HealthBadge label={health(r, data.book, data.today)} />
              </button>
              {under?.(r)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
