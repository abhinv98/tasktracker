import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Play, X, User, Calendar, Loader2 } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { Cursor } from "../components/Cursor";
import { fadeIn, fadeOut, slideUp, reveal, easeInOut } from "../lib/anim";

/**
 * The assignee opens the task and clicks "Start Task".
 * Status badge transitions from "To Do" to "In Progress" with a colour interpolation.
 */
export function SceneStartTask({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  // 600f
  const T = {
    cursorToCard: 14,
    cardClicked: 60,
    modalIn: 70,
    cursorToStart: 170,
    startClicked: 220,
    spinnerStart: 220,
    spinnerEnd: 260,
    statusFlip: 260,
    statusFlipEnd: 300,
    settled: 320,
  };

  const showModal = frame >= T.modalIn;
  const modalSlide = (1 - reveal(frame, T.modalIn, 16)) * 60;
  const modalOpacity = fadeIn(frame, T.modalIn, 14);

  const showSpinner = frame >= T.spinnerStart && frame < T.spinnerEnd;

  const statusT = interpolate(frame, [T.statusFlip, T.statusFlipEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const statusColor = lerpColor("#6b7280", "#3B82F6", statusT);
  const statusBg = lerpColor("rgba(107,114,128,0.1)", "#EFF6FF", statusT);
  const statusLabel = statusT < 0.5 ? "To Do" : "In Progress";

  const cursorPaths = [
    { start: T.cursorToCard, duration: 38, from: { x: 1500, y: 700 }, to: { x: 380, y: 350 }, click: true },
    { start: T.cursorToStart, duration: 36, from: { x: 380, y: 350 }, to: { x: 1820, y: 290 }, click: true },
  ];

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/dashboard" pageTitle="Your tasks" user={{ name: "Anya Kapoor", role: "employee" }}>
        <div className="p-8 h-full overflow-hidden relative">
          {/* Simplified board behind the modal */}
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">Your tasks</h2>
          <p className="text-[12px] text-[var(--text-muted)] mb-5">5 tasks · 1 due today</p>

          <div className="grid grid-cols-4 gap-4">
            {["To Do", "In Progress", "In Review", "Done"].map((col, i) => (
              <div
                key={col}
                className="bg-white rounded-xl border p-4 min-h-[180px]"
                style={{ borderColor: "var(--border)", opacity: 0.85 }}
              >
                <p className="text-[12px] font-bold uppercase tracking-wide mb-3" style={{ color: "var(--text-secondary)" }}>
                  {col}
                </p>
                {i === 0 && (
                  <div
                    className="bg-white rounded-xl border p-3"
                    style={{ borderColor: "var(--accent-admin)", boxShadow: "0 4px 12px rgba(217,119,87,0.12)" }}
                  >
                    <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug">
                      Instagram reel — autumn capsule
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Autumn capsule launch</p>
                  </div>
                )}
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

                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all"
                      style={{ color: statusColor, background: statusBg }}
                    >
                      {statusLabel}
                    </span>
                    {!showSpinner && statusT < 0.5 && (
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white"
                        style={{ background: "rgb(5, 150, 105)" }}
                      >
                        <Play className="h-3 w-3" />
                        Start Task
                      </button>
                    )}
                    {showSpinner && (
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white opacity-60"
                        style={{ background: "rgb(5, 150, 105)" }}
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Starting…
                      </button>
                    )}
                    {!showSpinner && statusT >= 0.5 && (
                      <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
                        Submit a deliverable when ready
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      <User className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      <span>Anya Kapoor</span>
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

                  <div>
                    <h4 className="font-semibold text-[11px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Assigned by
                    </h4>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white font-semibold text-[10px]"
                        style={{ background: "var(--accent-manager)" }}
                      >
                        R
                      </div>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        Riya Mehta · Brand Manager
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <Cursor paths={cursorPaths} />
        </div>
      </AppShell>

      <Caption text="Click the task card to open it" start={T.cursorToCard - 6} duration={70} />
      <Caption text="See deadline, brief, who assigned it, and the description" start={T.modalIn + 6} duration={120} />
      <Caption text="Hit Start Task — your status flips to In Progress" start={T.cursorToStart - 6} duration={120} />
    </AbsoluteFill>
  );
}

function lerpColor(a: string, b: string, t: number): string {
  // Supports #RRGGBB and rgba(r,g,b,a)
  const pa = parseColor(a);
  const pb = parseColor(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  const al = pa.a + (pb.a - pa.a) * t;
  return `rgba(${r},${g},${bl},${al})`;
}

function parseColor(s: string): { r: number; g: number; b: number; a: number } {
  if (s.startsWith("#")) {
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    return { r, g, b, a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}
