"use client";

import { useMutation, useQuery } from "convex/react";
import { Play, Square, CalendarCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SectionHeader, useToast } from "@/components/ui";
import { taskStatusMeta, isTaskOverdue } from "@/lib/status";

type TodayTask = {
  _id: string;
  title: string;
  status: string;
  deadline?: number;
  briefName?: string;
  briefStatus?: string;
};

function dueLabel(deadline: number, now: number) {
  const d = new Date(deadline);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (deadline < now) return `Overdue · ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** Your open tasks that are overdue or due in the next 7 days, soonest first,
 *  with a one-click timer. */
export function TodayList({
  tasks,
  onOpen,
}: {
  tasks: TodayTask[] | undefined;
  onOpen: (taskId: string) => void;
}) {
  const active = useQuery(api.timeTracking.getActiveTimer);
  const startTimer = useMutation(api.timeTracking.startTimer);
  const stopTimer = useMutation(api.timeTracking.stopTimer);
  const { toast } = useToast();
  const now = Date.now();
  const weekAhead = now + 7 * 86_400_000;

  const due = (tasks ?? [])
    .filter(
      (t) =>
        t.status !== "done" &&
        t.briefStatus !== "archived" &&
        !!t.deadline &&
        t.deadline <= weekAhead
    )
    .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  const visible = due.slice(0, 6);

  async function toggleTimer(taskId: string) {
    try {
      if (active && active.taskId === taskId) await stopTimer({ entryId: active._id });
      else await startTimer({ taskId: taskId as Id<"tasks"> });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't update the timer");
    }
  }

  return (
    <section className="mb-8">
      <SectionHeader
        title="Your week"
        count={due.length}
        action={due.length > visible.length ? { label: "All my tasks", href: "/my-tasks" } : undefined}
      />
      {tasks === undefined ? null : visible.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-3 text-[13px] text-[var(--text-secondary)]">
          <CalendarCheck className="h-4 w-4 text-[var(--accent-employee-text)]" />
          Nothing of yours is due in the next 7 days.
        </p>
      ) : (
        <ul className="rounded-xl border border-[var(--border)] bg-white divide-y divide-[var(--border-subtle)] overflow-hidden">
          {visible.map((t) => {
            const meta = taskStatusMeta(t.status);
            const overdue = isTaskOverdue(t, now);
            const running = active?.taskId === t._id;
            return (
              <li key={t._id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors">
                <button
                  type="button"
                  onClick={() => onOpen(t._id)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.dot }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[var(--text-primary)] truncate">{t.title}</span>
                    <span className="block text-[12px] text-[var(--text-muted)] truncate">
                      {meta.label}
                      {t.briefName ? ` · ${t.briefName}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[12px] tabular-nums ${
                      overdue ? "font-semibold text-[var(--danger)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {dueLabel(t.deadline!, now)}
                  </span>
                </button>
                {t.status !== "review" && (
                  <button
                    type="button"
                    onClick={() => void toggleTimer(t._id)}
                    aria-label={running ? `Stop timer on ${t.title}` : `Start timer on ${t.title}`}
                    title={running ? "Stop timer" : "Start timer"}
                    className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                      running
                        ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
