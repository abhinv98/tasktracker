import { useCurrentFrame, interpolate } from "remotion";
import { easeInOut, easeOut } from "../lib/anim";

export interface CursorPath {
  start: number;
  duration: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  click?: boolean;
}

export function Cursor({ paths }: { paths: CursorPath[] }) {
  const frame = useCurrentFrame();

  const active = paths.find(
    (p) => frame >= p.start - 6 && frame <= p.start + p.duration + 30
  );
  if (!active) return null;

  const local = frame - active.start;
  const t = interpolate(local, [0, active.duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const x = active.from.x + (active.to.x - active.from.x) * t;
  const y = active.from.y + (active.to.y - active.from.y) * t;

  // Click ripple
  let ripple = 0;
  let rippleOpacity = 0;
  if (active.click) {
    const clickFrame = active.start + active.duration;
    const since = frame - clickFrame;
    if (since >= 0 && since < 18) {
      const r = interpolate(since, [0, 18], [0, 1], { easing: easeOut });
      ripple = 14 + r * 36;
      rippleOpacity = 0.5 * (1 - r);
    }
  }

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, transform: "translate(-2px, -2px)" }}
    >
      {ripple > 0 && (
        <div
          className="absolute rounded-full"
          style={{
            width: ripple,
            height: ripple,
            left: -ripple / 2 + 6,
            top: -ripple / 2 + 6,
            background: "rgba(217, 119, 87, 0.35)",
            opacity: rippleOpacity,
          }}
        />
      )}
      <svg width="22" height="26" viewBox="0 0 22 26" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>
        <path
          d="M2 2 L2 18 L7 14 L10 22 L13 21 L10 13 L17 13 Z"
          fill="#141413"
          stroke="#FFFFFF"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
