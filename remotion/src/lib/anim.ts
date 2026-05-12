import { interpolate, spring } from "remotion";

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function fadeIn(frame: number, start: number, duration = 12) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function fadeOut(frame: number, start: number, duration = 12) {
  return interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function slideUp(frame: number, start: number, distance = 20, duration = 18) {
  return interpolate(frame, [start, start + duration], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
}

export function pop(frame: number, start: number, fps: number) {
  return spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 180, mass: 0.6 } });
}

export function typed(text: string, frame: number, start: number, charsPerFrame = 0.6) {
  const elapsed = Math.max(0, frame - start);
  const count = Math.min(text.length, Math.floor(elapsed * charsPerFrame));
  return text.slice(0, count);
}

export function reveal(frame: number, start: number, duration = 14) {
  const t = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  return t;
}
