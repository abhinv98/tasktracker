"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Textarea, useToast } from "@/components/ui";
import {
  STAGES, stageMeta, type Stage,
} from "@/lib/recruitStages";
import {
  formatLpa, formatYears, formatNotice,
  parseCtcLpa, parseYears, parseNoticeDays,
} from "@/lib/recruitParse";
import {
  X, FileText, ExternalLink, Mail, StickyNote, ArrowRight, Trash2, Phone,
} from "lucide-react";

function when(ts: number) {
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/**
 * Everything about one candidate, in a slide-over. Built because a candidate
 * was previously just a table row — to read a CV you left the app entirely,
 * and there was nowhere to record that you'd spoken to someone.
 */
export function CandidatePanel({
  candidateId,
  onClose,
  onOpenOther,
}: {
  candidateId: Id<"recruitCandidates">;
  onClose: () => void;
  onOpenOther?: (id: Id<"recruitCandidates">, jobSourceId: number) => void;
}) {
  const c = useQuery(api.recruitment.getCandidate, { candidateId });
  const setStage = useMutation(api.recruitment.setStage);
  const addNote = useMutation(api.recruitment.addNote);
  const deleteActivity = useMutation(api.recruitment.deleteActivity);
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Escape closes, and the page behind shouldn't scroll under the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const isPdf = !!c?.resume && /\.pdf($|\?)/i.test(c.resume);

  async function move(stage: Stage) {
    try {
      await setStage({ candidateIds: [candidateId], stage });
      toast("success", `Moved to ${stageMeta(stage).label}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
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
      <div className="fixed inset-0 z-40 bg-[#141413]/40" onClick={onClose} />
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
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)] truncate">
                  {c.name}
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                  {c.position || c.jobName}
                  {c.createdAt ? ` · applied ${when(c.createdAt).split(",")[0]}` : ""}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Stage rail — the whole funnel, current one filled. Clicking moves. */}
            <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] px-6 py-3">
              {STAGES.map((s) => {
                const active = c.stage === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => move(s.value)}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      active
                        ? "text-white"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    }`}
                    style={active ? { backgroundColor: s.color } : undefined}
                  >
                    {s.label}
                  </button>
                );
              })}
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
                    ["Current", formatLpa(parseCtcLpa(c.currentCtc)), null],
                    ["Expected", formatLpa(parseCtcLpa(c.expectedCtc)), null],
                  ].map(([label, value, href]) => (
                    <div key={label as string} className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
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
                        <p className="text-[13px] text-[var(--text-disabled)]">Not provided</p>
                      )}
                    </div>
                  ))}
                </div>

                {c.alsoApplied.length > 0 && (
                  <div className="mx-6 mb-4 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-dim)] px-3 py-2">
                    <p className="text-[12px] font-medium text-[var(--text-primary)]">
                      Also applied for {c.alsoApplied.length} other{" "}
                      {c.alsoApplied.length === 1 ? "role" : "roles"}
                    </p>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {c.alsoApplied.map((o) => (
                        <button
                          key={o._id}
                          onClick={() => onOpenOther?.(o._id, o.jobSourceId)}
                          className="text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent-admin-text)] hover:underline"
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
                    <Button loading={saving} disabled={!note.trim()} onClick={saveNote}>
                      <StickyNote size={14} />
                      Add note
                    </Button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex flex-col gap-2 px-6 pb-6">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
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
                            <StickyNote size={13} />
                          ) : t.kind === "email" ? (
                            <Mail size={13} className={t.ok ? "" : "text-[var(--danger)]"} />
                          ) : (
                            <ArrowRight size={13} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {t.kind === "stage" ? (
                            <p className="text-[12px] text-[var(--text-primary)]">
                              {stageMeta((t.fromStage ?? "applied") as Stage).label} →{" "}
                              <strong>{stageMeta((t.toStage ?? "applied") as Stage).label}</strong>
                              {t.body ? ` — ${t.body}` : ""}
                            </p>
                          ) : t.kind === "email" ? (
                            <p className="text-[12px] text-[var(--text-primary)]">
                              {t.ok ? "Emailed" : "Email failed"} — {t.body}
                            </p>
                          ) : (
                            <p className="whitespace-pre-wrap text-[12px] text-[var(--text-primary)]">
                              {t.body}
                            </p>
                          )}
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {t.who} · {when(t.at)}
                          </p>
                        </div>
                        {t.kind === "note" && (
                          <button
                            onClick={() =>
                              deleteActivity({ activityId: t.id as Id<"recruitActivity"> })
                            }
                            aria-label="Delete note"
                            className="shrink-0 self-start p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
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
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Résumé
                  </span>
                  <div className="flex items-center gap-1">
                    {c.portfolioLink && (
                      <a
                        href={c.portfolioLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-admin-text)]"
                      >
                        <ExternalLink size={12} />
                        Portfolio
                      </a>
                    )}
                    {c.resume && (
                      <a
                        href={c.resume}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-admin-text)]"
                      >
                        <FileText size={12} />
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
                    <FileText size={26} className="text-[var(--text-disabled)]" />
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
    </>
  );
}
