"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Play, Square, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "./Button";
import { useToast } from "./Toast";

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Time tracking for one task: running timer, manual entry, totals. */
export function TaskTimeSection({
  taskId,
  canLog,
  taskDone,
}: {
  taskId: Id<"tasks">;
  canLog: boolean;
  taskDone: boolean;
}) {
  const entries = useQuery(api.timeTracking.getTimeEntries, { taskId });
  const active = useQuery(api.timeTracking.getActiveTimer);
  const startTimer = useMutation(api.timeTracking.startTimer);
  const stopTimer = useMutation(api.timeTracking.stopTimer);
  const addManual = useMutation(api.timeTracking.addManualEntry);
  const { toast } = useToast();
  const [manual, setManual] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const runningHere = active && active.taskId === taskId ? active : null;
  // Re-render every 30s so a running timer's total moves.
  useEffect(() => {
    if (!runningHere) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [runningHere]);

  const closed = (entries ?? []).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const live = runningHere ? Math.max(0, Math.round((now - runningHere.startedAt) / 60000)) : 0;

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast("success", ok);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="p-5 space-y-3 border-t border-[var(--border)]">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-[12px] text-[var(--text-secondary)]">
          Time
        </h4>
        <span className="text-[13px] font-semibold tabular-nums text-[var(--text-primary)]">
          {formatMinutes(closed + live)}
        </span>
      </div>

      {canLog && !taskDone && (
        <div className="flex flex-wrap items-center gap-2">
          {runningHere ? (
            <Button
              variant="secondary"
              onClick={() => run(() => stopTimer({ entryId: runningHere._id }), "Timer stopped")}
            >
              <Square className="h-3.5 w-3.5" /> Stop · {formatMinutes(live)}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() =>
                run(
                  () => startTimer({ taskId }),
                  active ? `Timer moved here from "${active.taskTitle ?? "another task"}"` : "Timer started"
                )
              }
            >
              <Play className="h-3.5 w-3.5" /> Start timer
            </Button>
          )}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const mins = Math.round(Number(manual) * 60);
              if (!mins) return;
              void run(() => addManual({ taskId, durationMinutes: mins }), "Time added").then(() => setManual(""));
            }}
          >
            <label htmlFor={`manual-${taskId}`} className="sr-only">Hours to add</label>
            <input
              id={`manual-${taskId}`}
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Hours"
              className="w-20 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
            />
            <Button type="submit" variant="ghost" disabled={!manual}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </form>
        </div>
      )}

      {(entries ?? []).length > 0 && (
        <ul className="space-y-1">
          {[...(entries ?? [])]
            .sort((a, b) => b.startedAt - a.startedAt)
            .slice(0, 5)
            .map((e) => (
              <li key={e._id} className="flex justify-between text-[11px] text-[var(--text-muted)]">
                <span>
                  {e.userName} · {new Date(e.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {e.manual ? " · manual" : ""}
                </span>
                <span className="tabular-nums">
                  {e.stoppedAt ? formatMinutes(e.durationMinutes ?? 0) : "running"}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
