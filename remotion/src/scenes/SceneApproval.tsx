import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Check, X, MessageSquare, ArrowRight, Send } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { Cursor } from "../components/Cursor";
import { fadeIn, fadeOut, slideUp, reveal, easeInOut } from "../lib/anim";

/**
 * Two-step approval: Team Lead reviews → Brand Manager approves → Task is Done.
 * Visualized as the /approved-work page swapping rows + a status flip on the
 * deliverable card.
 */
export function SceneApproval({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  // 660f
  const T = {
    sceneIn: 0,
    leadView: 0,
    cursorLeadApprove: 50,
    leadApproveClicked: 110,
    leadApprovedShown: 130,
    swapToManager: 220,
    managerView: 240,
    cursorManagerApprove: 290,
    managerApproveClicked: 350,
    finalStatus: 380,
    settled: 440,
  };

  const inLeadPhase = frame < T.swapToManager;
  const inManagerPhase = frame >= T.managerView;

  const phaseSwapT = interpolate(frame, [T.swapToManager, T.managerView], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInOut,
  });

  const leadApproved = frame >= T.leadApprovedShown;
  const managerApproved = frame >= T.finalStatus;

  const cursorPaths = inLeadPhase
    ? [{ start: T.cursorLeadApprove, duration: 50, from: { x: 1500, y: 700 }, to: { x: 1700, y: 480 }, click: true }]
    : [{ start: T.cursorManagerApprove, duration: 50, from: { x: 1500, y: 700 }, to: { x: 1700, y: 480 }, click: true }];

  const user = inLeadPhase
    ? { name: "Devi Iyer", role: "manager" as const }
    : { name: "Riya Mehta", role: "manager" as const };

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/approved-work" pageTitle={inLeadPhase ? "Review queue — Design Team" : "Brand approval queue"} user={user}>
        <div className="p-8 h-full overflow-hidden relative">
          {/* Phase indicator strip */}
          <div className="flex items-center gap-3 mb-6" style={{ opacity: fadeIn(frame, 4, 12) }}>
            <PhaseChip
              n={1}
              label="Team Lead"
              active={inLeadPhase}
              done={!inLeadPhase}
            />
            <ArrowRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <PhaseChip
              n={2}
              label="Brand Manager"
              active={inManagerPhase}
              done={managerApproved}
            />
            <ArrowRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <PhaseChip n={3} label="Done" active={managerApproved} done={managerApproved} />
          </div>

          {/* Phase header */}
          <div
            className="mb-5"
            style={{
              opacity: inLeadPhase ? fadeIn(frame, 6, 14) : fadeIn(frame, T.managerView, 14),
              transform: `translateY(${slideUp(frame, inLeadPhase ? 6 : T.managerView, 12, 14)}px)`,
            }}
          >
            <h2 className="text-[20px] font-bold text-[var(--text-primary)]">
              {inLeadPhase ? "Reviewing as Devi — Design lead" : "Reviewing as Riya — Brand Manager"}
            </h2>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
              {inLeadPhase
                ? "1 deliverable awaiting your review"
                : "1 deliverable cleared by Design — your sign-off needed"}
            </p>
          </div>

          {/* Deliverable row */}
          <div
            className="bg-white rounded-xl border overflow-hidden"
            style={{
              borderColor: managerApproved
                ? "var(--accent-employee)"
                : leadApproved && inManagerPhase
                ? "var(--accent-manager)"
                : "var(--border)",
              boxShadow: leadApproved
                ? "0 8px 24px rgba(106, 155, 204, 0.18)"
                : "0 1px 2px rgba(0,0,0,0.04)",
              opacity: 1 - Math.abs(phaseSwapT - 0.5) * 0.4,
            }}
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold"
                      style={{
                        background: managerApproved
                          ? "rgba(16,185,129,0.1)"
                          : leadApproved
                          ? "var(--accent-manager-dim)"
                          : "var(--accent-admin-dim)",
                        color: managerApproved
                          ? "#10b981"
                          : leadApproved
                          ? "var(--accent-manager)"
                          : "var(--accent-admin)",
                      }}
                    >
                      {managerApproved ? "Approved · Done" : leadApproved ? "Cleared by lead" : "Pending review"}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Anya Kapoor · 2 min ago
                    </span>
                  </div>
                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                    Instagram reel — autumn capsule launch
                  </p>
                  <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    First cut — locked frame, slug pending. Open to feedback on the CTA copy.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                    >
                      <FileChip /> reel-v1.mp4
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                    >
                      <FileChip /> shotlist.pdf
                    </span>
                  </div>
                </div>

                {/* Approve / Request changes */}
                {!managerApproved && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border bg-white"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Request changes
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white shadow-sm"
                      style={{
                        background: inLeadPhase
                          ? "var(--accent-manager)"
                          : "var(--accent-employee)",
                      }}
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </button>
                  </div>
                )}
                {managerApproved && (
                  <div
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white shrink-0"
                    style={{
                      background: "var(--accent-employee)",
                      opacity: fadeIn(frame, T.finalStatus, 12),
                    }}
                  >
                    <Check className="h-3 w-3" />
                    Approved
                  </div>
                )}
              </div>

              {/* Lead's comment after they approve */}
              {leadApproved && (
                <div
                  className="mt-3 flex items-start gap-2 p-3 rounded-lg border bg-white"
                  style={{
                    borderColor: "var(--border-subtle)",
                    opacity: fadeIn(frame, T.leadApprovedShown, 12),
                    transform: `translateY(${slideUp(frame, T.leadApprovedShown, 10, 12)}px)`,
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-[11px] shrink-0"
                    style={{ background: "var(--accent-manager)" }}
                  >
                    D
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--text-primary)]">Devi · Design Lead</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      Looks tight. Cleared for brand sign-off.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Done banner */}
            {managerApproved && (
              <div
                className="px-5 py-3 border-t flex items-center gap-2"
                style={{
                  background: "rgba(16,185,129,0.08)",
                  borderColor: "rgba(16,185,129,0.25)",
                  opacity: fadeIn(frame, T.finalStatus + 4, 12),
                }}
              >
                <Check className="h-4 w-4" style={{ color: "#10b981" }} />
                <p className="text-[12px] font-medium" style={{ color: "#047857" }}>
                  Task moved to <strong>Done</strong> — Anya, the brief, and analytics all updated automatically
                </p>
              </div>
            )}
          </div>

          <Cursor paths={cursorPaths} />
        </div>
      </AppShell>

      <Caption text="The team lead reviews first" start={4} duration={90} />
      <Caption text="Approve cleanly — or send back with a note" start={T.cursorLeadApprove - 6} duration={120} />
      <Caption text="Then the brand manager signs off" start={T.swapToManager - 6} duration={140} />
      <Caption text="Task is Done — everything updates everywhere" start={T.finalStatus - 4} duration={120} />
    </AbsoluteFill>
  );
}

function PhaseChip({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  const bg = done
    ? "var(--accent-employee-dim)"
    : active
    ? "var(--accent-admin-dim)"
    : "var(--bg-hover)";
  const color = done
    ? "var(--accent-employee)"
    : active
    ? "var(--accent-admin)"
    : "var(--text-muted)";
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: bg }}>
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ background: color, color: "#FFFFFF" }}
      >
        {done ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className="text-[12px] font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function FileChip() {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm"
      style={{ background: "var(--text-muted)" }}
    />
  );
}
