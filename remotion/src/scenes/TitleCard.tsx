import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fadeIn, fadeOut, slideUp } from "../lib/anim";

export function TitleCard({
  durationInFrames,
  eyebrow = "Welcome to",
  title = "The Orchestrator",
  subtitle = "How tasks are created, assigned, and delivered",
}: {
  durationInFrames: number;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}) {
  const frame = useCurrentFrame();
  const inOpacity = fadeIn(frame, 4, 16);
  const outOpacity = fadeOut(frame, durationInFrames - 18, 16);
  const opacity = Math.min(inOpacity, outOpacity);
  const tyTitle = slideUp(frame, 8, 28, 22);
  const tySub = slideUp(frame, 22, 28, 22);

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)" }}>
      <div className="w-full h-full flex flex-col items-center justify-center" style={{ opacity }}>
        <div
          className="text-[18px] font-semibold tracking-wide uppercase mb-4"
          style={{ color: "var(--accent-admin)", opacity: fadeIn(frame, 0, 14) }}
        >
          {eyebrow}
        </div>
        <h1
          className="font-bold text-center"
          style={{
            color: "var(--text-primary)",
            fontSize: 88,
            letterSpacing: "-0.02em",
            transform: `translateY(${tyTitle}px)`,
            opacity: fadeIn(frame, 8, 16),
          }}
        >
          {title}
        </h1>
        <p
          className="mt-6 text-center max-w-[820px]"
          style={{
            color: "var(--text-secondary)",
            fontSize: 28,
            transform: `translateY(${tySub}px)`,
            opacity: fadeIn(frame, 22, 16),
          }}
        >
          {subtitle}
        </p>

        <div
          className="mt-12 h-1 rounded-full"
          style={{
            width: 120,
            background: "var(--accent-admin)",
            opacity: fadeIn(frame, 32, 14),
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
