"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Textarea, useToast } from "@/components/ui";
import { iconButtonClass } from "@/components/ui/classes";
import { positionStatus, stageMeta, type PositionStatus, type Stage } from "@/lib/recruitStages";
import { DECISIONS, Decide, UNDATED, useLast, useMoveApplicants } from "./ApplicantsTable";
import { MoveApplicants } from "./MoveApplicants";
import {
  formatLpa, formatYears, formatNotice,
  parseCtcLpa, parseYears, parseNoticeDays,
} from "@/lib/recruitParse";
import {
  X, FileText, ExternalLink, Mail, StickyNote, ArrowLeftRight, ArrowRight, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";

function when(ts: number) {
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const KEYS: Record<string, PositionStatus> = { s: "shortlisted", h: "on_hold", r: "rejected" };

/**
 * Everything about one applicant, in a slide-over: who they are, their CV, and
 * the decision. Given the list it was opened from, it steps through it: S, H or
 * R decides and moves on to the next person, the arrow keys look without deciding.
 */
export function CandidatePanel({
  candidateId,
  order = [],
  onGo,
  onClose,
  onOpenOther,
}: {
  candidateId: Id<"recruitCandidates">;
  /** The list it was opened from, as it stood then. */
  order?: Id<"recruitCandidates">[];
  onGo?: (id: Id<"recruitCandidates">) => void;
  onClose: () => void;
  onOpenOther?: (id: Id<"recruitCandidates">, jobSourceId: number) => void;
}) {
  // The last person stays on screen while the next one loads, so stepping does not flicker.
  const c = useLast(useQuery(api.recruitment.getCandidate, { candidateId }));
  const ready = c?._id === candidateId;
  const moveApplicants = useMoveApplicants();
  const addNote = useMutation(api.recruitment.addNote);
  const deleteActivity = useMutation(api.recruitment.deleteActivity);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);

  // What is typed belongs to the person it was typed on, also while stepping through the list.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const note = notes[candidateId] ?? "";
  const setNote = (text: string) => setNotes((n) => ({ ...n, [candidateId]: text }));

  const at = order.indexOf(candidateId);
  const before = at > 0 ? order[at - 1] : undefined;
  const after = at >= 0 ? order[at + 1] : undefined;
  const go = (id?: Id<"recruitCandidates">) => id && onGo?.(id);

  function decide(to: PositionStatus) {
    if (!c || !ready) return;
    // A fresh application is dealt with: on to the next one straight away. If the
    // save fails, its message names the person.
    if (positionStatus(c.stage as Stage) === "new") go(after);
    void moveApplicants([candidateId], to, c.name);
  }

  // The page behind shouldn't scroll under the panel.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Escape closes, arrows step, S H R decide. Never while typing a note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog on top has the keyboard to itself.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") return onClose();
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
      if (e.key === "ArrowRight") go(after);
      else if (e.key === "ArrowLeft") go(before);
      else {
        // A key only decides. Taking a decision back is a click, so a second press cannot undo one.
        const to = KEYS[e.key.toLowerCase()];
        if (to && c && to !== positionStatus(c.stage as Stage)) decide(to);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const isPdf = !!c?.resume && /\.pdf($|\?)/i.test(c.resume);

  async function saveNote() {
    if (!note.trim() || !ready) return;
    setSaving(true);
    try {
      await addNote({ candidateId, body: note });
      setNote("");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Candidate details"
        className="animate-slidePanelIn fixed right-0 top-0 z-50 flex h-full w-full max-w-[860px] flex-col bg-white shadow-2xl"
      >
        {c === undefined ? (
          <div className="p-6 text-[13px] text-[var(--text-secondary)]">Loading…</div>
        ) : c === null ? (
          <div className="p-6 text-[13px] text-[var(--text-secondary)]">Candidate not found.</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                  {c.name}
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  {c.position || c.jobName}
                  {c.createdAt ? ` · applied ${when(c.createdAt).split(",")[0]}` : ` · applied b${UNDATED.slice(1)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {order.length > 1 && (
                  <>
                    <span className="mr-1 text-[12px] tabular-nums text-[var(--text-muted)]">
                      {at + 1} of {order.length.toLocaleString()}
                    </span>
                    <button type="button" aria-label="Previous applicant" disabled={!before} onClick={() => go(before)} className={`${iconButtonClass} disabled:opacity-30`}>
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" aria-label="Next applicant" disabled={!after} onClick={() => go(after)} className={`${iconButtonClass} disabled:opacity-30`}>
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
                <button type="button" onClick={onClose} aria-label="Close panel" className={iconButtonClass}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] px-6 py-3">
              <div className="flex flex-wrap gap-1">
                <Decide stage={c.stage as Stage} name={c.name} onMove={decide} large />
                <Button type="button" variant="secondary" disabled={!ready} onClick={() => setMoving(true)}>
                  <ArrowLeftRight size={14} />
                  Move
                </Button>
              </div>
              {c.onCandidates.length > 0 ? (
                <span className="flex flex-wrap gap-x-3 text-[13px]">
                  {c.onCandidates.map((row) => (
                    <Link
                      key={row._id}
                      href={`/recruitment/t/pipeline?open=${row._id}`}
                      className="font-medium text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
                    >
                      On Candidates: {row.stage}
                      {row.round ? ` (${row.round})` : ""}
                    </Link>
                  ))}
                </span>
              ) : (
                <span className="text-[12px] text-[var(--text-muted)]">
                  {DECISIONS.includes(positionStatus(c.stage as Stage) as (typeof DECISIONS)[number])
                    ? ""
                    : "Shortlisting puts them on Candidates, where interviews, tasks and the offer are."}
                </span>
              )}
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Left: facts, notes, timeline */}
              <div className="flex w-[46%] min-w-[320px] flex-col overflow-y-auto border-r border-[var(--border-subtle)]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-6 py-4">
                  {[
                    ["Email", c.email, `mailto:${c.email}`],
                    ["Phone", c.number, c.number ? `tel:${c.number}` : null],
                    ["Experience", formatYears(parseYears(c.experience)), null],
                    ["Notice", formatNotice(parseNoticeDays(c.noticePeriod)), null],
                    ...(c.pay
                      ? [
                          ["Current", formatLpa(parseCtcLpa(c.currentCtc)), null],
                          ["Expected", formatLpa(parseCtcLpa(c.expectedCtc)), null],
                        ]
                      : []),
                  ].map(([label, value, href]) => (
                    <div key={label as string} className="min-w-0">
                      <p className="text-[12px] font-medium text-[var(--text-muted)]">
                        {label}
                      </p>
                      {value ? (
                        href ? (
                          <a href={href as string} className="block truncate text-[13px] text-[var(--text-primary)] hover:underline">
                            {value}
                          </a>
                        ) : (
                          <p className="truncate text-[13px] text-[var(--text-primary)]">{value}</p>
                        )
                      ) : (
                        <p className="text-[13px] text-[var(--text-muted)]">Not provided</p>
                      )}
                    </div>
                  ))}
                </div>

                {c.alsoApplied.length > 0 && (
                  <div className="mx-6 mb-4 rounded-md bg-[var(--bg-primary)] px-3 py-2">
                    <p className="text-[12px] font-medium text-[var(--text-primary)]">
                      Also applied for {c.alsoApplied.length} other{" "}
                      {c.alsoApplied.length === 1 ? "role" : "roles"}
                    </p>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {c.alsoApplied.map((o) => (
                        <button
                          key={o._id}
                          onClick={() => onOpenOther?.(o._id, o.jobSourceId)}
                          className="text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline underline-offset-2"
                        >
                          {o.jobName} — {stageMeta(o.stage as Stage).label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Note composer */}
                <div className="px-6 pb-3">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note — what was said, what's next…"
                    className="min-h-[70px] text-[13px]"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button loading={saving} disabled={!note.trim() || !ready} onClick={saveNote}>
                      <StickyNote size={14} />
                      Add note
                    </Button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex flex-col gap-2 px-6 pb-6">
                  <p className="text-[12px] font-medium text-[var(--text-muted)]">
                    History
                  </p>
                  {c.timeline.length === 0 ? (
                    <p className="text-[12px] text-[var(--text-muted)]">
                      Nothing recorded yet.
                    </p>
                  ) : (
                    c.timeline.map((t) => (
                      <div key={t.id} className="group flex gap-2.5 border-b border-[var(--border-subtle)] pb-2 last:border-0">
                        <div className="mt-0.5 shrink-0 text-[var(--text-muted)]">
                          {t.kind === "note" ? (
                            <StickyNote size={14} />
                          ) : t.kind === "email" ? (
                            <Mail size={14} className={t.ok ? "" : "text-[var(--danger)]"} />
                          ) : t.kind === "move" ? (
                            <ArrowLeftRight size={14} />
                          ) : (
                            <ArrowRight size={14} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {t.kind === "stage" ? (
                            <p className="text-[13px] text-[var(--text-primary)]">
                              {stageMeta((t.fromStage ?? "applied") as Stage).label} →{" "}
                              <strong>{stageMeta((t.toStage ?? "applied") as Stage).label}</strong>
                              {t.body ? ` — ${t.body}` : ""}
                            </p>
                          ) : t.kind === "email" ? (
                            <p className="text-[13px] text-[var(--text-primary)]">
                              {t.ok ? "Emailed" : "Email failed"} — {t.body}
                            </p>
                          ) : (
                            <p className="whitespace-pre-wrap text-[13px] text-[var(--text-primary)]">
                              {t.kind === "move" ? `Moved: ${t.body[0].toLowerCase()}${t.body.slice(1)}` : t.body}
                            </p>
                          )}
                          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                            {[t.who, when(t.at)].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {t.kind === "note" && (
                          <button
                            onClick={() =>
                              deleteActivity({ activityId: t.id as Id<"recruitActivity"> })
                            }
                            aria-label="Delete note"
                            className="shrink-0 self-start inline-flex items-center justify-center h-6 w-6 rounded-md text-[var(--text-muted)] opacity-0 transition-[opacity,color,background-color] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right: the CV itself, rendered rather than linked away to */}
              <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2">
                  <span className="text-[12px] font-medium text-[var(--text-muted)]">
                    Résumé
                  </span>
                  <div className="flex items-center gap-1">
                    {c.portfolioLink && (
                      <a
                        href={c.portfolioLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <ExternalLink size={14} />
                        Portfolio
                      </a>
                    )}
                    {c.resume && (
                      <a
                        href={c.resume}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <FileText size={14} />
                        Open
                      </a>
                    )}
                  </div>
                </div>
                {isPdf ? (
                  <iframe
                    src={c.resume}
                    title={`Résumé — ${c.name}`}
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                    <FileText size={26} className="text-[var(--text-muted)]" />
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      {c.resume
                        ? "This CV is a link rather than a PDF, so it can't be shown here."
                        : "No résumé on file."}
                    </p>
                    {c.resume && (
                      <a
                        href={c.resume}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
                      >
                        Open it in a new tab
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
      {moving && c && (
        <MoveApplicants ids={[candidateId]} who={c.name} from={c.jobSourceId} onClose={() => setMoving(false)} />
      )}
    </>
  );
}
