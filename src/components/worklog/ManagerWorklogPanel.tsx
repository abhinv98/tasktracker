"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui";
import { TaskNavigator } from "@/components/TaskNavigator";
import { ChevronLeft, ChevronRight, FileText, ClipboardList } from "lucide-react";

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMonthAgoStr(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ManagerWorklogPanel() {
  const managers = useQuery(api.managerWorklog.listSupervisableManagers) ?? [];
  const [managerId, setManagerId] = useState<string>("");
  const [mode, setMode] = useState<"day" | "report">("day");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayStr());
  const [from, setFrom] = useState(getMonthAgoStr());
  const [to, setTo] = useState(getTodayStr());

  const day = useQuery(
    api.managerWorklog.getManagerWorklogDay,
    managerId && mode === "day"
      ? { managerId: managerId as Id<"users">, date }
      : "skip"
  );
  const report = useQuery(
    api.managerWorklog.getManagerWorklogReport,
    managerId && mode === "report"
      ? { managerId: managerId as Id<"users">, from, to }
      : "skip"
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] min-w-[220px]"
        >
          <option value="">Select a brand manager…</option>
          {managers.map((m: any) => (
            <option key={m._id} value={m._id}>
              {m.name}
              {m.isSuperAdmin ? " (Super Admin)" : ""}
            </option>
          ))}
        </select>

        {managerId && (
          <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-[var(--bg-hover)]">
            {(["day", "report"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  mode === m
                    ? "bg-white shadow-sm text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {m === "day" ? "Day view" : "Report"}
              </button>
            ))}
          </div>
        )}
      </div>

      {!managerId && (
        <div className="text-center py-12 rounded-xl border border-[var(--border)] bg-white">
          <ClipboardList className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            Pick a brand manager to view their brand-wise worklog.
          </p>
        </div>
      )}

      {/* DAY VIEW */}
      {managerId && mode === "day" && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)]"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
            />
            <button
              onClick={() => setDate(shiftDate(date, 1))}
              className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)]"
            >
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => setDate(getTodayStr())}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              Today
            </button>
            <span className="text-[12px] text-[var(--text-muted)] ml-1">
              {fmtDay(date)}
            </span>
          </div>

          {day === undefined ? (
            <p className="text-[13px] text-[var(--text-muted)] py-8">Loading...</p>
          ) : day === null ? (
            <p className="text-[13px] text-[var(--text-secondary)] py-8">
              You don't have access to this manager's worklog.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Supervising (open)
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {day.summary.supervisingOpen ?? 0}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Brands logged
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {day.summary.brandsLogged}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Hours
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {day.summary.totalHours}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Tasks handled
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {day.summary.tasksHandled}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    MoMs
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {day.summary.momCount}
                  </p>
                </Card>
              </div>

              <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-2">
                Brand-wise worklog
              </h3>
              {day.entries.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)] mb-6">
                  No worklog entries saved for this day.
                </p>
              ) : (
                <div className="space-y-3 mb-6">
                  {day.entries.map((e: any) => (
                    <div
                      key={e._id}
                      className="rounded-xl border border-[var(--border)] bg-white p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                            style={{ background: e.brandColor }}
                          >
                            {e.brandName}
                          </span>
                          {e.done && (
                            <span className="text-[10px] font-medium text-[var(--accent-employee)] uppercase tracking-wider">
                              Done
                            </span>
                          )}
                          {!e.done && (e.carryOverDays ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 whitespace-nowrap"
                              title="Not completed by its original deadline, rolled forward each day"
                            >
                              Carried over · {e.carryOverDays}d
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {e.taskDeadline != null && (
                            <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                              Due {new Date(e.taskDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {e.hoursSpent != null && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {e.hoursSpent}h
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
                        {e.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-1">
                  Supervising: open delegated tasks
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mb-2">
                  Pending, in-progress and review tasks this manager
                  delegated and is responsible for tracking.
                </p>
                {(day.supervising ?? []).length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">None.</p>
                ) : (
                  <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                          <th className="px-4 py-2.5 font-medium">Task</th>
                          <th className="px-4 py-2.5 font-medium">Assigned to</th>
                          <th className="px-4 py-2.5 font-medium">Brand</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium">Deadline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.supervising.map((t: any) => {
                          const sc =
                            t.status === "review"
                              ? { c: "#8b5cf6", b: "rgba(139,92,246,0.12)" }
                              : t.status === "in-progress"
                                ? { c: "#f59e0b", b: "rgba(245,158,11,0.14)" }
                                : { c: "#6b7280", b: "var(--bg-hover)" };
                          return (
                            <tr
                              key={t._id}
                              onClick={() => setOpenTaskId(t._id)}
                              className="border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-hover)]"
                              title="Open task"
                            >
                              <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium max-w-[240px]">
                                <span className="line-clamp-2">{t.title}</span>
                              </td>
                              <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                                {t.assigneeName}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                                  style={{ background: t.brandColor }}
                                >
                                  {t.brandName}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                                  style={{ background: sc.b, color: sc.c }}
                                >
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                                {t.deadline
                                  ? new Date(t.deadline).toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" }
                                    )
                                  : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-2">
                    Tasks handled
                  </h3>
                  {day.tasks.length === 0 ? (
                    <p className="text-[13px] text-[var(--text-muted)]">None.</p>
                  ) : (
                    <div className="space-y-2">
                      {day.tasks.map((t: any) => (
                        <div
                          key={t._id}
                          onClick={() => setOpenTaskId(t._id)}
                          title="Open task"
                          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[12px] cursor-pointer hover:bg-[var(--bg-hover)]"
                        >
                          <p className="font-medium text-[var(--text-primary)]">
                            {t.title}
                          </p>
                          <p className="text-[var(--text-muted)]">
                            {t.brandName} · {t.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-2">
                    MoMs that day
                  </h3>
                  {day.moms.length === 0 ? (
                    <p className="text-[13px] text-[var(--text-muted)]">None.</p>
                  ) : (
                    <div className="space-y-2">
                      {day.moms.map((m: any) => (
                        <div
                          key={m._id}
                          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[12px] flex items-center gap-2"
                        >
                          <FileText className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
                          <span className="font-medium text-[var(--text-primary)]">
                            {m.title}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            · {m.brandName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* REPORT VIEW */}
      {managerId && mode === "report" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
              />
            </div>
          </div>

          {report === undefined ? (
            <p className="text-[13px] text-[var(--text-muted)] py-8">Loading...</p>
          ) : report === null ? (
            <p className="text-[13px] text-[var(--text-secondary)] py-8">
              You don't have access to this manager's worklog.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Brands
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {report.totals.brands}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Days logged
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {report.totals.daysLogged}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Total hours
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {report.totals.totalHours}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    MoMs
                  </p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
                    {report.totals.momCount}
                  </p>
                </Card>
              </div>

              {report.brands.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  No activity in this range.
                </p>
              ) : (
                <div className="space-y-4">
                  {report.brands.map((b: any) => (
                    <div
                      key={b.brandId}
                      className="rounded-xl border border-[var(--border)] bg-white p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold text-white"
                          style={{ background: b.brandColor }}
                        >
                          {b.brandName}
                        </span>
                        <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                          <span>{b.daysLogged} days</span>
                          <span>{b.totalHours}h</span>
                          <span>{b.momCount} MoMs</span>
                          <span>{b.tasks.length} tasks</span>
                        </div>
                      </div>

                      {b.entries.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Worklog by day
                          </p>
                          <div className="space-y-1.5">
                            {b.entries.map((e: any, i: number) => (
                              <div key={i} className="text-[12px]">
                                <span className="text-[var(--text-muted)] mr-2">
                                  {e.date}
                                </span>
                                <span className="text-[var(--text-primary)]">
                                  {e.content}
                                </span>
                                {e.hoursSpent != null && (
                                  <span className="text-[var(--text-muted)]">
                                    {" "}
                                    ({e.hoursSpent}h)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {b.tasks.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Tasks
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {b.tasks.map((t: any) => (
                              <span
                                key={t._id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                              >
                                {t.title}
                                <span className="text-[var(--text-muted)]">
                                  · {t.date ?? "-"}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <TaskNavigator
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
