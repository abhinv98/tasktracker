import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Send, Link2, Paperclip, FileText, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { Cursor } from "../components/Cursor";
import { StatusBadge } from "../components/TaskCard";
import { fadeIn, fadeOut, slideUp, reveal, typed } from "../lib/anim";

export function SceneSubmit({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  // 600f
  const T = {
    sceneIn: 0,
    cursorToSubmit: 30,
    submitClicked: 80,
    formIn: 90,
    typingDesc: 110,
    typingLink: 240,
    cursorToAttach: 320,
    attachClicked: 348,
    fileChip1: 354,
    fileChip2: 372,
    cursorToSend: 412,
    sendClicked: 458,
    spinnerStart: 458,
    spinnerEnd: 498,
    deliverableShown: 498,
  };

  const showForm = frame >= T.formIn;
  const formOpacity = fadeIn(frame, T.formIn, 12);
  const formTy = slideUp(frame, T.formIn, 16, 14);

  const desc = "First cut — locked frame, slug pending. Open to feedback on the CTA copy.";
  const link = "https://figma.com/file/autumn-capsule-reel-v1";

  const descTyped = typed(desc, frame, T.typingDesc, 0.7);
  const linkTyped = typed(link, frame, T.typingLink, 0.9);

  const file1 = frame >= T.fileChip1;
  const file2 = frame >= T.fileChip2;
  const showSpinner = frame >= T.spinnerStart && frame < T.spinnerEnd;
  const showDeliverable = frame >= T.deliverableShown;

  const cursorPaths = [
    { start: T.cursorToSubmit, duration: 38, from: { x: 1500, y: 700 }, to: { x: 1750, y: 580 }, click: true },
    { start: T.cursorToAttach, duration: 22, from: { x: 1750, y: 580 }, to: { x: 1500, y: 700 }, click: true },
    { start: T.cursorToSend, duration: 36, from: { x: 1500, y: 700 }, to: { x: 1450, y: 800 }, click: true },
  ];

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/dashboard" pageTitle="Your tasks" user={{ name: "Anya Kapoor", role: "employee" }}>
        <div className="absolute inset-0 flex justify-end" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div
            className="bg-white border-l flex flex-col h-full"
            style={{ borderColor: "var(--border)", width: 520, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-[16px] text-[var(--text-primary)] leading-snug">
                  Instagram reel — autumn capsule launch
                </h2>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">Autumn capsule launch</p>
              </div>
              <button className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status row */}
            <div className="px-5 pt-5 flex items-center justify-between">
              <StatusBadge status="in-progress" />
              <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
                Submit a deliverable when ready
              </span>
            </div>

            {/* Deliverables block */}
            <div className="px-5 pt-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-[12px] uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                    Deliverables
                  </h4>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {showDeliverable ? "1 deliverable submitted" : "0 deliverables submitted"}
                  </p>
                </div>
                {!showForm && (
                  <button className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--accent-admin)" }}>
                    <Send className="h-3 w-3" />
                    Submit deliverable
                  </button>
                )}
              </div>

              {/* Form */}
              {showForm && (
                <div
                  className="rounded-lg border p-3 space-y-2.5"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: "var(--border)",
                    opacity: formOpacity,
                    transform: `translateY(${formTy}px)`,
                  }}
                >
                  <div>
                    <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
                      Description <span style={{ color: "var(--danger)" }}>*</span>
                    </label>
                    <div
                      className="w-full px-3 py-2 rounded-lg border bg-white text-[13px] min-h-[68px] leading-relaxed"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {descTyped}
                      {frame >= T.typingDesc && frame < T.typingLink && (
                        <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle" style={{ background: "var(--accent-admin)" }} />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                    <div
                      className="flex-1 px-3 py-1.5 rounded-lg border bg-white text-[12px]"
                      style={{
                        borderColor: "var(--border)",
                        color: linkTyped ? "var(--text-primary)" : "var(--text-disabled)",
                      }}
                    >
                      {linkTyped || "Link (optional) — Figma, Drive, etc."}
                    </div>
                  </div>

                  <div>
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed text-[12px]"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      <Paperclip className="h-3 w-3" />
                      Attach files
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {file1 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px]"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                            opacity: fadeIn(frame, T.fileChip1, 8),
                            transform: `translateY(${slideUp(frame, T.fileChip1, 8, 8)}px)`,
                          }}
                        >
                          <ImageIcon className="h-3 w-3" />
                          reel-v1.mp4
                        </span>
                      )}
                      {file2 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px]"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                            opacity: fadeIn(frame, T.fileChip2, 8),
                            transform: `translateY(${slideUp(frame, T.fileChip2, 8, 8)}px)`,
                          }}
                        >
                          <FileText className="h-3 w-3" />
                          shotlist.pdf
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white shadow-sm"
                      style={{ background: "var(--accent-admin)" }}
                    >
                      {showSpinner ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      {showSpinner ? "Submitting…" : "Submit"}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium border bg-white"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Submitted deliverable card appears */}
              {showDeliverable && (
                <div
                  className="rounded-lg border p-3 mt-3"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: "var(--border-subtle)",
                    opacity: fadeIn(frame, T.deliverableShown, 14),
                    transform: `translateY(${slideUp(frame, T.deliverableShown, 12, 14)}px)`,
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Deliverable 1
                  </p>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      Anya Kapoor · just now
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                      style={{
                        background: "var(--accent-admin-dim)",
                        color: "var(--accent-admin)",
                      }}
                    >
                      Pending Review
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
                    {desc}
                  </p>
                  <a className="inline-flex items-center gap-1 mt-1.5 text-[11px]" style={{ color: "var(--accent-admin)" }}>
                    <Link2 className="h-3 w-3" />
                    {link}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <Cursor paths={cursorPaths} />
      </AppShell>

      <Caption text="When the work is ready, click Submit deliverable" start={T.cursorToSubmit - 6} duration={70} />
      <Caption text="Describe what you're delivering, drop a link, attach files" start={T.typingDesc - 4} duration={220} />
      <Caption text="Send it — it goes straight into the review queue" start={T.cursorToSend - 6} duration={120} />
    </AbsoluteFill>
  );
}
