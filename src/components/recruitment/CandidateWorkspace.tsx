"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, StatusBadge, useConfirm, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { Tray, TrayItem } from "@/components/ui/Tray";
import { STANDARD, STEP_KINDS, type Step } from "@/convex/lib/hirePipeline";
import { webLink } from "@/convex/lib/links";
import { TRACKERS, type TrackerKey } from "@/convex/lib/hrTrackers";
import { health, type Row } from "@/lib/hrHealth";
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

/**
 * Everything about one candidate in one place: where they are in the round,
 * the next step, and their interviews, assignments and offer, each of which can
 * be added right here. Replaces the plain form for the Candidates tracker,
 * because a candidate is worked on, not filled in.
 */
export function CandidateWorkspace({ row, data, onClose }: { row: Row; data: HrData; onClose: () => void }) {
  const quickSave = useQuickSave();
  const remove = useMutation(api.hrOps.remove);
  const askConfirm = useConfirm();
  const { toast } = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState<TrackerKey | null>(null);
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
  // A team that was deleted since is none.
  const team = data.teamName(text(row, "team")) ? text(row, "team") : "";
  const teams = data.teamsOf(row);
  const position = data.positionOf(row.fields);
  /** Far enough for their team to matter. */
  const hiring = step?.kind === "offer" || step?.kind === "joining" || stage === "Joined" || text(row, "status") === "Joined";

  /** One click moves the candidate. A closing stage sets the matching status too. */
  const moveTo = (to: string) =>
    quickSave(row, moveFields("pipeline", to), `${text(row, "name")} moved to ${to}`);

  const openRow = (other: Row) => router.push(`/recruitment/t/${other.tracker}?open=${other._id}`);

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
                round ? `${round.code} · ${text(round, "role")}` : text(row, "roleOriginal") || "No open position yet",
                text(row, "contact"),
                text(row, "source"),
                text(row, "appliedOn") && `applied ${fmtDate(text(row, "appliedOn"), today)}`,
                text(row, "firstContact") && `shortlisted ${fmtDate(text(row, "firstContact"), today)}`,
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

          {/* Where they are. One click moves them. */}
          <section aria-label="Pipeline stage">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Stage</h3>
              <HealthBadge label={health(row, data.book, today)} />
              {row.pipeline && row.pipeline !== STANDARD && <span className="text-[12px] text-[var(--text-muted)]">{data.pipelineName(row.pipeline)} pipeline</span>}
              {closed && <span className="text-[12px] text-[var(--text-muted)]">Closed as {stage}. Pick a stage to reopen.</span>}
              {!closed && stage && at < 0 && <span className="text-[12px] text-[var(--text-muted)]">At {stage}, which their pipeline does not have. Pick a stage.</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {steps.map(({ id, name: s }, i) => {
                const current = !closed && s === stage;
                const done = !closed && at > i;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={current}
                    onClick={() => !current && moveTo(s)}
                    className={`h-7 rounded-control border px-2.5 text-[12px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                      current
                        ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)] font-semibold text-[var(--accent-admin-text)]"
                        : done
                          ? "border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                          : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
              <Tray label={closed && stage ? stage : "Close as"} active={closed && !!stage} width="w-44" align="end">
                {CLOSED.map((s) => (
                  <TrayItem key={s} label={s} active={s === stage} destructive={s === "Rejected"} onSelect={() => moveTo(s)} />
                ))}
              </Tray>
            </div>
          </section>

          {/* What this step is for, as set up in their pipeline, and the one thing to do in it. */}
          {step && (step.note || step.link || step.owner || step.days || ACTION[step.kind]) && (
            <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg bg-[var(--bg-primary)] px-3 py-2.5">
              <div className="min-w-0 flex-1 text-[12px] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-primary)]">{step.name}</span>
                {[STEP_KINDS[step.kind] !== step.name && STEP_KINDS[step.kind], step.owner && data.personName(step.owner), step.days && `${step.days} ${step.days === 1 ? "day" : "days"}`]
                  .filter(Boolean)
                  .map((x) => `  ·  ${x}`)
                  .join("")}
                {step.note && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-[var(--text-secondary)]">{step.note}</p>}
                {step.link && <LinkOut href={step.link} label={step.kind === "assignment" ? "Open the assignment" : "Open the link"} />}
              </div>
              {ACTION[step.kind] && !(step.kind === "offer" && offer) && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(ACTION[step.kind]!.tracker)}>
                  {ACTION[step.kind]!.label}
                </Button>
              )}
            </div>
          )}

          {/* What happens next, and when. Most visits change only this. */}
          <form
            className="mt-5 rounded-lg border border-[var(--border)] p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await quickSave(row, nextChanges, "Saved")) setNextEdits({});
            }}
          >
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Next step</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_170px]">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">What happens next</span>
                <input
                  value={next.nextAction}
                  maxLength={300}
                  onChange={(e) => setNext("nextAction", e.target.value)}
                  placeholder="Call to check notice period"
                  className={`${fieldClass} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">Who</span>
                <select
                  value={next.actionOwner}
                  onChange={(e) => setNext("actionOwner", e.target.value)}
                  className={`${fieldClass} w-full`}
                >
                  <option value="">–</option>
                  {data.people.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">By when</span>
                <input
                  type="date"
                  value={next.nextDue}
                  onChange={(e) => setNext("nextDue", e.target.value)}
                  className={`${fieldClass} w-[150px]`}
                />
              </label>
              {(
                [
                  ["Tomorrow", 1],
                  ["In 3 days", 3],
                  ["Next week", 7],
                ] as const
              ).map(([label, days]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setNext("nextDue", addDays(today, days))}
                  className="h-control rounded-control border border-[var(--border)] px-2.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">Notes</span>
              <textarea
                value={next.notes}
                rows={2}
                maxLength={5000}
                onChange={(e) => setNext("notes", e.target.value)}
                className={`${fieldBaseClass} w-full py-2`}
              />
            </label>
            <div className="mt-3 flex justify-end">
              <Button type="submit" size="sm" disabled={!nextChanged}>
                Save next step
              </Button>
            </div>
          </form>

          <CandidateTasks row={row} data={data} />

          <Related
            title="Interviews"
            rows={interviews}
            data={data}
            onOpen={openRow}
            line={(r) => [text(r, "round") || "Interview", fmtDate(text(r, "date"), today), text(r, "time"), data.personName(text(r, "interviewer"))]}
            detail={(r) => [text(r, "recommendation") !== "Pending" && text(r, "recommendation"), text(r, "feedback")].filter(Boolean).join(": ")}
            addLabel="Schedule interview"
            adding={adding === "interviews"}
            onAdd={() => setAdding("interviews")}
          >
            <InlineAdd
              tracker="interviews"
              keys={["round", "interviewer", "date", "time", "mode"]}
              required={["interviewer", "date"]}
              preset={{ candidateId: row._id, ...(interviewStep ? { round: interviewStep.name, ...(interviewStep.owner ? { interviewer: interviewStep.owner } : {}) } : {}) }}
              data={data}
              submitLabel="Schedule and tell the interviewer"
              onDone={() => setAdding(null)}
            />
          </Related>

          <Related
            title="Assignments"
            rows={assignments}
            data={data}
            onOpen={openRow}
            line={(r) => [text(r, "task"), text(r, "submissionDue") && `due ${fmtDate(text(r, "submissionDue"), today)}`, data.personName(text(r, "reviewer"))]}
            detail={(r) => (text(r, "decision") !== "Pending" ? text(r, "decision") : "")}
            top={form && <LinkOut href={form} label={`Submission form for ${round!.code}`} />}
            under={(r) => <AssignmentLinks row={r} />}
            addLabel="Send an assignment"
            adding={adding === "assignments"}
            onAdd={() => setAdding("assignments")}
          >
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
              onDone={() => setAdding(null)}
            />
          </Related>

          <Related
            title="Offer"
            rows={offer ? [offer] : []}
            data={data}
            onOpen={openRow}
            line={(r) => [
              text(r, "stage") || "Offer",
              text(r, "approvedCtc") ? `₹${text(r, "approvedCtc")} LPA approved` : text(r, "proposedCtc") && `₹${text(r, "proposedCtc")} LPA proposed`,
              text(r, "plannedJoin") && `joining ${fmtDate(text(r, "plannedJoin"), today)}`,
            ]}
            detail={() => (data.pay ? "Open it to approve, edit or download the appointment letter." : "Open it to follow it along.")}
            addLabel={offer ? "" : "Start an offer"}
            adding={adding === "offers"}
            onAdd={() => setAdding("offers")}
          >
            <InlineAdd
              tracker="offers"
              keys={["proposedCtc", "approvalOwner", "designation", "plannedJoin"]}
              preset={{ candidateId: row._id, approvalRequested: today }}
              data={data}
              submitLabel="Start offer"
              onDone={() => setAdding(null)}
            />
          </Related>

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
                  <option value="">Not decided</option>
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
                      : position?.divide
                        ? `Divided between ${teams.map(data.teamName).join(" and ")}. Picked for them at the offer, or pick now.`
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

/** The one thing most steps come down to, and the part of this panel that does it. */
const ACTION: Partial<Record<Step["kind"], { label: string; tracker: TrackerKey }>> = {
  screening: { label: "Schedule the call", tracker: "interviews" },
  interview: { label: "Schedule interview", tracker: "interviews" },
  assignment: { label: "Send the assignment", tracker: "assignments" },
  offer: { label: "Start an offer", tracker: "offers" },
};

/** What people on the team have to do about this candidate. Each is an ordinary task in its owner's list. */
function CandidateTasks({ row, data }: { row: Row; data: HrData }) {
  const tasks = useQuery(api.recruitTasks.forCandidate, { candidateId: row._id as Id<"hrRecords"> });
  const [adding, setAdding] = useState(false);
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          Tasks
          {!!tasks?.length && <span className="ml-1.5 font-normal tabular-nums text-[var(--text-muted)]">{tasks.length}</span>}
        </h3>
        {!adding && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={13} />
            Assign a task
          </Button>
        )}
      </div>
      {!!tasks?.length && (
        <ul className="mb-2 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)]">
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
      )}
      {tasks?.length === 0 && !adding && <p className="text-[13px] text-[var(--text-muted)]">None yet.</p>}
      {adding && <AssignTask data={data} candidateId={row._id} onDone={() => setAdding(false)} />}
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

/** One kind of thing that hangs off the candidate: its rows, and a way to add one in place. */
function Related({
  title,
  rows,
  data,
  line,
  detail,
  top,
  under,
  onOpen,
  addLabel,
  adding,
  onAdd,
  children,
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
  addLabel: string;
  adding: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  // Opened by the step's own button, further up: bring it into view.
  const form = useRef<HTMLElement>(null);
  useEffect(() => {
    if (adding) form.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [adding]);
  return (
    <section ref={form} className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          {title}
          {rows.length > 0 && <span className="ml-1.5 font-normal tabular-nums text-[var(--text-muted)]">{rows.length}</span>}
        </h3>
        {addLabel && !adding && (
          <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
            <Plus size={13} />
            {addLabel}
          </Button>
        )}
      </div>
      {top && <div className="mb-2">{top}</div>}
      {rows.length > 0 && (
        <ul className="mb-2 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)]">
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
      {rows.length === 0 && !adding && <p className="text-[13px] text-[var(--text-muted)]">None yet.</p>}
      {adding && children}
    </section>
  );
}
