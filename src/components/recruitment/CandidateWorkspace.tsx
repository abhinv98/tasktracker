"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, useConfirm, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { Tray, TrayItem } from "@/components/ui/Tray";
import { TRACKERS, type TrackerKey } from "@/convex/lib/hrTrackers";
import { health, type Row } from "@/lib/hrHealth";
import { FieldGrid, InlineAdd, toValues, useQuickSave } from "./hrFields";
import { HealthBadge, addDays, boardValue, fieldsOf, fmtDate, moveFields, show, type HrData } from "./hrShared";

const text = (row: Row, key: string) => {
  const value = row.fields[key];
  return value === null || value === undefined ? "" : String(value);
};

const CLOSED: readonly string[] = TRACKERS.pipeline.boardClosed;
const STAGES = (fieldsOf("pipeline").find((f) => f.key === "stage")?.options ?? []).filter((s) => !CLOSED.includes(s));
/** What this panel edits itself; "All details" holds the rest. */
const OWN_FIELDS = ["stage", "nextAction", "actionOwner", "nextDue", "notes"];
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

  const detailFields = fieldsOf("pipeline").filter((f) => !f.stamp && !OWN_FIELDS.includes(f.key));
  const live = Object.fromEntries(detailFields.map((f) => [f.key, text(row, f.key)]));
  const [detailEdits, setDetailEdits] = useState<Record<string, string>>({});
  const details = { ...live, ...detailEdits };
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Keyboard and screen-reader users start inside the panel, not behind it.
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Escape closes an open menu first, not the whole panel with what was typed.
      if (e.key !== "Escape" || document.querySelector('aside[role="dialog"] [aria-expanded="true"]')) return;
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
  const stage = boardValue(row) ?? text(row, "status");
  const closed = stage !== "" && !STAGES.includes(stage);
  const at = STAGES.indexOf(text(row, "stage"));
  const round = data.byId.get(text(row, "reqId"));
  const mine = (tracker: TrackerKey) => data.book[tracker].filter((r) => r.fields.candidateId === row._id);
  const interviews = mine("interviews");
  const assignments = mine("assignments");
  const offer = mine("offers")[0];
  const resume = text(row, "resume");
  const today = data.today;

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
                round ? `${round.code} · ${text(round, "role")}` : text(row, "roleOriginal") || "No hiring round yet",
                text(row, "contact"),
                text(row, "source"),
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
            <button
              type="button"
              aria-label={`Delete ${row.code}`}
              className={iconButtonDangerClass}
              onClick={() =>
                askConfirm({
                  title: `Delete ${text(row, "name")}?`,
                  message: "The candidate is removed from this hiring round for everyone. It cannot be undone.",
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
              {closed && <span className="text-[12px] text-[var(--text-muted)]">Closed as {stage}. Pick a stage to reopen.</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STAGES.map((s, i) => {
                const current = !closed && s === stage;
                const done = !closed && at > i;
                return (
                  <button
                    key={s}
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
              preset={{ candidateId: row._id }}
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
            addLabel="Send an assignment"
            adding={adding === "assignments"}
            onAdd={() => setAdding("assignments")}
          >
            <InlineAdd
              tracker="assignments"
              keys={["task", "submissionDue", "reviewer", "reviewDue"]}
              preset={{ candidateId: row._id }}
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
            detail={() => "Open it to approve, edit or download the appointment letter."}
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
    </>
  );
}

/** One kind of thing that hangs off the candidate: its rows, and a way to add one in place. */
function Related({
  title,
  rows,
  data,
  line,
  detail,
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
  onOpen: (row: Row) => void;
  addLabel: string;
  adding: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
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
                  {detail(r) && <span className="mt-0.5 line-clamp-2 block text-[12px] text-[var(--text-muted)]">{detail(r)}</span>}
                </span>
                <HealthBadge label={health(r, data.book, data.today)} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && !adding && <p className="text-[13px] text-[var(--text-muted)]">None yet.</p>}
      {adding && children}
    </section>
  );
}
