import { AbsoluteFill, useCurrentFrame } from "remotion";
import { User, UserPlus, Check, AlertTriangle, X, Calendar } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { Cursor } from "../components/Cursor";
import { Badge } from "../primitives/Badge";
import { StatusBadge } from "../components/TaskCard";
import { fadeIn, fadeOut, slideUp, reveal } from "../lib/anim";

/**
 * The manager opens an existing task on the brief and reassigns it.
 * Mirrors the Reassign banner inside the real TaskDetailModal.
 */
export function SceneAssign({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  // 480f scene
  const T = {
    sceneIn: 0,
    cursorToTask: 14,
    taskClicked: 60,
    modalIn: 70,
    cursorToReassign: 130,
    reassignOpen: 170,
    cursorToDropdown: 200,
    dropdownOpen: 232,
    dropdownPicked: 282,
    cursorToConfirm: 304,
    confirmClicked: 336,
    confirmShown: 348,
    settled: 380,
  };

  const showModal = frame >= T.modalIn;
  const modalSlide = (1 - reveal(frame, T.modalIn, 16)) * 60;
  const modalOpacity = fadeIn(frame, T.modalIn, 14);

  const reassignOpen = frame >= T.reassignOpen;
  const dropdownOpen = frame >= T.dropdownOpen && frame < T.dropdownPicked + 4;
  const dropdownPicked = frame >= T.dropdownPicked;
  const confirmShown = frame >= T.confirmShown;
  const settled = frame >= T.settled;

  const cursorPaths = [
    { start: T.cursorToTask, duration: 36, from: { x: 1500, y: 600 }, to: { x: 1100, y: 360 }, click: true },
    { start: T.cursorToReassign, duration: 28, from: { x: 1100, y: 360 }, to: { x: 1660, y: 470 }, click: true },
    { start: T.cursorToDropdown, duration: 24, from: { x: 1660, y: 470 }, to: { x: 1500, y: 540 }, click: true },
    { start: T.cursorToConfirm, duration: 24, from: { x: 1500, y: 540 }, to: { x: 1820, y: 540 }, click: true },
  ];

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/briefs" pageTitle="Brief — Autumn capsule launch" user={{ name: "Riya Mehta", role: "manager" }}>
        <div className="p-8 h-full overflow-hidden relative">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-1">Tasks</h2>
          <p className="text-[12px] text-[var(--text-muted)] mb-5">4 tasks · Sable & Co.</p>

          <div className="grid grid-cols-3 gap-4">
            {[
              { t: "Instagram reel — autumn capsule", a: "Anya · Design", s: "in-progress" as const, hl: true },
              { t: "Static — hero on cream", a: "Anya · Design", s: "review" as const },
              { t: "Email — drop announcement", a: "Mateo · Copy", s: "review" as const },
            ].map((tk, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border p-4"
                style={{
                  borderColor: tk.hl ? "var(--accent-admin)" : "var(--border)",
                  boxShadow: tk.hl ? "0 8px 24px rgba(217,119,87,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
                  opacity: fadeIn(frame, 6 + i * 4, 14),
                  transform: `translateY(${slideUp(frame, 6 + i * 4, 14, 14)}px)`,
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">{tk.t}</p>
                  <StatusBadge status={tk.s} />
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">{tk.a}</p>
              </div>
            ))}
          </div>

          {/* Modal */}
          {showModal && (
            <>
              <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)", opacity: modalOpacity }} />
              <div
                className="absolute top-0 right-0 bottom-0 bg-white border-l flex flex-col"
                style={{
                  borderColor: "var(--border)",
                  width: 520,
                  transform: `translateX(${modalSlide}px)`,
                  opacity: modalOpacity,
                  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                }}
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

                {/* Reassign banner — matches the real one in TaskDetailModal */}
                {reassignOpen && (
                  <div
                    className="px-5 py-3 border-b"
                    style={{
                      background: "rgb(240, 249, 255)",
                      borderColor: "rgb(186, 230, 253)",
                      opacity: fadeIn(frame, T.reassignOpen, 8),
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <UserPlus className="h-4 w-4" style={{ color: "rgb(2, 132, 199)" }} />
                      <p className="text-[13px] font-medium" style={{ color: "rgb(7, 89, 133)" }}>
                        Select a new assignee
                      </p>
                    </div>
                    <div className="flex gap-2 relative">
                      <div
                        className="flex-1 px-3 py-1.5 rounded-lg border bg-white text-[12px] flex items-center justify-between"
                        style={{
                          borderColor: dropdownOpen ? "var(--accent-admin)" : "rgb(186, 230, 253)",
                          color: dropdownPicked ? "var(--text-primary)" : "var(--text-disabled)",
                        }}
                      >
                        <span>{dropdownPicked ? "Lia Park — Design" : "Select employee"}</span>
                      </div>
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white"
                        style={{
                          background: confirmShown ? "var(--accent-employee)" : "rgb(2, 132, 199)",
                        }}
                      >
                        {confirmShown ? <Check className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        {confirmShown ? "Saved" : "Confirm"}
                      </button>

                      {/* Dropdown */}
                      {dropdownOpen && (
                        <div
                          className="absolute left-0 top-9 bg-white rounded-lg border shadow-lg z-10 overflow-hidden"
                          style={{
                            width: "calc(100% - 88px)",
                            borderColor: "var(--border-strong)",
                            opacity: fadeIn(frame, T.dropdownOpen, 6),
                            transform: `translateY(${slideUp(frame, T.dropdownOpen, 8, 8)}px)`,
                          }}
                        >
                          {[
                            { name: "Anya Kapoor", team: "Design", current: true },
                            { name: "Lia Park", team: "Design", highlighted: true },
                            { name: "Mateo Reyes", team: "Copy" },
                            { name: "Sam Idris", team: "Video" },
                          ].map((p, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-3 py-2 text-[12px]"
                              style={{
                                background: p.highlighted ? "var(--accent-admin-dim)" : "transparent",
                                color: "var(--text-primary)",
                                opacity: p.current ? 0.5 : 1,
                              }}
                            >
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-white font-semibold text-[10px]"
                                style={{ background: "var(--accent-employee)" }}
                              >
                                {p.name.slice(0, 1)}
                              </div>
                              <span>{p.name}</span>
                              <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                                {p.team}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Status + meta */}
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <StatusBadge status="in-progress" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      <User className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      <span style={{ color: settled ? "var(--accent-employee)" : "var(--text-secondary)", fontWeight: settled ? 600 : 400 }}>
                        {settled ? "Lia Park" : "Anya Kapoor"}
                      </span>
                      {!reassignOpen && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                          style={{ color: "rgb(2, 132, 199)", background: "rgb(240, 249, 255)", borderWidth: 1, borderStyle: "solid", borderColor: "rgb(186, 230, 253)" }}
                        >
                          <UserPlus className="h-3 w-3" />
                          Reassign
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      <Calendar className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      <span>Fri, Oct 24 · 18:00</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-[11px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Description
                    </h4>
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Hook → b-roll of the new range → CTA. Vertical 9:16, ~20s.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          <Cursor paths={cursorPaths} />
        </div>
      </AppShell>

      <Caption text="Need to hand off? Click the assignee" start={T.cursorToReassign - 6} duration={70} />
      <Caption text="Pick a new person — done in seconds" start={T.dropdownOpen - 6} duration={100} />
      <Caption text="Everyone gets notified automatically" start={T.confirmShown - 4} duration={80} />
    </AbsoluteFill>
  );
}
