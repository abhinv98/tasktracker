"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Panel, PanelEmpty } from "@/components/ui";

type Meeting = { id: string; title: string; start: number; end: number; joinUrl: string | null; people: number };

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * Today's meetings from the person's own Google Calendar (connected on the
 * profile page), each with a Join button. Joining a Google Meet call from here
 * is all Echo needs: it starts recording by itself once you are in the call.
 * Hidden altogether when Google Calendar is not set up on the server.
 */
export function TodayMeetings() {
  const calendar = useQuery(api.echo.calendarStatus, {});
  const load = useAction(api.echo.meetingsBetween);
  const [result, setResult] = useState<{ connected: boolean; reconnect?: boolean; events: Meeting[] } | "failed" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const connectedAs = calendar?.email ?? null;

  useEffect(() => {
    if (!connectedAs) return;
    let alive = true;
    const run = () => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      load({ from: day.getTime(), to: day.getTime() + 86_400_000 }).then(
        (r) => alive && setResult(r),
        () => alive && setResult((old) => old ?? "failed") // keep what is on screen if a refresh fails
      );
    };
    run();
    // The calendar is not live data: look again every five minutes.
    const timer = setInterval(run, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load, connectedAs]);

  // "On now" and "starting soon" follow the clock, not the five-minute calendar refresh.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  if (!calendar?.available) return null;

  const events = result && result !== "failed" ? result.events : [];
  const connected = !!connectedAs && !(result && result !== "failed" && !result.connected);

  return (
    <Panel title="Today's meetings" count={connected ? events.length : undefined}>
      {result && result !== "failed" && result.reconnect ? (
        <PanelEmpty>
          Echo does not have access to your calendar.{" "}
          <Link href="/profile" className="font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2">
            Disconnect and connect Google Calendar again on your profile
          </Link>
          , and tick the calendar box on Google&apos;s screen.
        </PanelEmpty>
      ) : !connected ? (
        <PanelEmpty>
          <Link href="/profile" className="font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2">
            Connect Google Calendar
          </Link>{" "}
          on your profile to see today&apos;s meetings here and join them in one click.
        </PanelEmpty>
      ) : result === null ? (
        <PanelEmpty>Checking your calendar…</PanelEmpty>
      ) : result === "failed" ? (
        <PanelEmpty>Your calendar could not be read just now. It will be tried again in a few minutes.</PanelEmpty>
      ) : events.length === 0 ? (
        <PanelEmpty>No meetings on your calendar today.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {events.map((e) => {
            const over = e.end <= now;
            const live = e.start <= now && !over;
            const soon = !live && !over && e.start - now <= 10 * 60_000;
            return (
              <li key={e.id} className={`flex items-center gap-3 px-4 py-2.5 ${over ? "opacity-55" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{e.title}</p>
                  <p className="text-[12px] text-[var(--text-muted)] tabular-nums">
                    {clock(e.start)} to {clock(e.end)}
                    {live ? " · on now" : soon ? " · starting soon" : ""}
                    {e.people > 1 ? ` · ${e.people} people` : ""}
                  </p>
                </div>
                {e.joinUrl && !over && (
                  <a
                    href={e.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`shrink-0 inline-flex items-center h-control px-3 rounded-control text-[13px] font-medium transition-colors ${
                      live || soon
                        ? "bg-[var(--text-primary)] text-white hover:bg-[#2a2a2a]"
                        : "bg-white text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    Join
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
