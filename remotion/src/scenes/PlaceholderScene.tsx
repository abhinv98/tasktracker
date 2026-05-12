import { AbsoluteFill, useCurrentFrame } from "remotion";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { fadeIn, fadeOut } from "../lib/anim";

/**
 * Temporary scaffold — keeps the timeline correct while individual scenes
 * are filled in. Each placeholder still uses the real AppShell so the
 * composition feels coherent during preview.
 */
export function PlaceholderScene({
  durationInFrames,
  active,
  pageTitle,
  caption,
  user,
}: {
  durationInFrames: number;
  active: string;
  pageTitle: string;
  caption: string;
  user: { name: string; role: "admin" | "manager" | "employee" };
}) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active={active} pageTitle={pageTitle} user={user}>
        <div className="w-full h-full flex items-center justify-center">
          <div
            className="px-6 py-4 rounded-lg border text-[13px]"
            style={{
              borderColor: "var(--border)",
              background: "#FFFFFF",
              color: "var(--text-secondary)",
            }}
          >
            Scene placeholder · {pageTitle}
          </div>
        </div>
      </AppShell>
      <Caption text={caption} start={4} duration={durationInFrames - 24} />
    </AbsoluteFill>
  );
}
