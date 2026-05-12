import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fadeIn, fadeOut, slideUp } from "../lib/anim";

export function Outro({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 16), fadeOut(frame, durationInFrames - 20, 18));

  const lines = [
    "Create.",
    "Assign.",
    "Deliver.",
    "Approve.",
  ];

  return (
    <AbsoluteFill
      style={{
        background: "var(--bg-primary)",
        opacity,
      }}
    >
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div
          className="text-[14px] font-semibold uppercase tracking-[0.2em] mb-6"
          style={{
            color: "var(--accent-admin)",
            opacity: fadeIn(frame, 0, 14),
          }}
        >
          The Orchestrator
        </div>

        <div className="flex flex-col items-center gap-2">
          {lines.map((line, i) => {
            const start = 8 + i * 14;
            return (
              <div
                key={i}
                className="font-bold"
                style={{
                  color: "var(--text-primary)",
                  fontSize: 72,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                  transform: `translateY(${slideUp(frame, start, 24, 18)}px)`,
                  opacity: fadeIn(frame, start, 16),
                }}
              >
                {line}
              </div>
            );
          })}
        </div>

        <p
          className="mt-10 text-[20px] text-center max-w-[680px]"
          style={{
            color: "var(--text-secondary)",
            transform: `translateY(${slideUp(frame, 78, 24, 18)}px)`,
            opacity: fadeIn(frame, 78, 16),
          }}
        >
          That's the loop. Welcome aboard.
        </p>
      </div>
    </AbsoluteFill>
  );
}
