import { useCurrentFrame } from "remotion";
import { fadeIn, fadeOut, slideUp } from "../lib/anim";

export function Caption({
  text,
  start = 0,
  duration,
  position = "bottom",
  variant = "primary",
}: {
  text: string;
  start?: number;
  duration: number;
  position?: "top" | "bottom" | "center";
  variant?: "primary" | "subtle";
}) {
  const frame = useCurrentFrame();
  const local = frame - start;
  if (local < -1 || local > duration) return null;

  const opacity = Math.min(fadeIn(local, 0, 8), fadeOut(local, duration - 14, 12));
  const ty = slideUp(local, 0, 16, 12);

  const containerPos =
    position === "top"
      ? "top-12"
      : position === "center"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-16";

  const isSubtle = variant === "subtle";
  return (
    <div
      className={`absolute left-0 right-0 flex justify-center ${containerPos} pointer-events-none px-12`}
      style={{ opacity, transform: `translateY(${ty}px)${position === "center" ? " translateY(-50%)" : ""}` }}
    >
      <div
        className="rounded-2xl backdrop-blur-md"
        style={{
          background: isSubtle ? "rgba(255,255,255,0.92)" : "rgba(20,20,19,0.92)",
          color: isSubtle ? "var(--text-primary)" : "#FFFFFF",
          padding: "14px 22px",
          fontSize: isSubtle ? 22 : 26,
          fontWeight: 600,
          letterSpacing: "0.005em",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          maxWidth: "70%",
          textAlign: "center",
          lineHeight: 1.35,
        }}
      >
        {text}
      </div>
    </div>
  );
}
