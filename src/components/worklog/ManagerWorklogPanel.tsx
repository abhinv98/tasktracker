"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelEmpty,
  SegmentedTabs,
  StatStrip,
  StatTile,
  StatusBadge,
} from "@/components/ui";
import { TaskNavigator } from "@/components/TaskNavigator";
import { ChevronLeft, ChevronRight, FileText, ClipboardList } from "lucide-react";
import { taskStatusMeta } from "@/lib/status";
import { fieldClass, iconButtonClass } from "@/components/ui/classes";

const ICON_BTN = iconButtonClass;
const FIELD = fieldClass;
const TH = "px-4 py-2 text-left text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap";
// Badge variant="warning" as a class, for the one chip here that needs a title attribute.
const WARN_BADGE =
  "inline-flex items-center px-1.5 py-px font-medium text-[11px] leading-[16px] whitespace-nowrap rounded bg-[var(--warning-dim)] text-[var(--warning)]";

/** Brand identity: its colour as a dot beside the name. */
function BrandName({ color, name, className = "" }: { color: string; name: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

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
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          aria-label="Brand manager"
          className={`${FIELD} min-w-[220px]`}
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
          <SegmentedTabs
            value={mode}
            onChange={setMode}
            options={[
              { value: "day", label: "Day view" },
              { value: "report", label: "Report" },
            ]}
          />
        )}
      </div>

      {!managerId && (
        <EmptyState
          icon={ClipboardList}
          title="Pick a brand manager to view their brand-wise worklog."
        />
      )}

      {/* DAY VIEW */}
      {managerId && mode === "day" && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className={ICON_BTN}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              className={FIELD}
            />
            <button
              onClick={() => setDate(shiftDate(date, 1))}
              className={ICON_BTN}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Button variant="secondary" onClick={() => setDate(getTodayStr())}>
              Today
            </Button>
            <span className="text-[13px] font-medium text-[var(--text-secondary)] ml-1">
              {fmtDay(date)}
            </span>
          </div>

          {day === undefined ? (
            <p className="text-[13px] text-[var(--text-muted)] py-8">Loading...</p>
          ) : day === null ? (
            <p className="text-[13px] text-[var(--text-secondary)] py-8">
              You don&apos;t have access to this manager&apos;s worklog.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <StatStrip>
                <StatTile label="Supervising (open)" value={day.summary.supervisingOpen ?? 0} />
                <StatTile label="Brands logged" value={day.summary.brandsLogged} />
                <StatTile label="Hours" value={day.summary.totalHours} />
                <StatTile label="Tasks handled" value={day.summary.tasksHandled} />
                <StatTile label="MoMs" value={day.summary.momCount} />
              </StatStrip>

              <Panel title="Brand-wise worklog" count={day.entries.length}>
                {day.entries.length === 0 ? (
                  <PanelEmpty>No worklog entries saved for this day.</PanelEmpty>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {day.entries.map((e: any) => (
                      <div key={e._id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <BrandName
                              color={e.brandColor}
                              name={e.brandName}
                              className="text-[14px] font-medium text-[var(--text-primary)]"
                            />
                            {e.done && <Badge variant="employee">Done</Badge>}
                            {!e.done && (e.carryOverDays ?? 0) > 0 && (
                              <span
                                className={WARN_BADGE}
                                title="Not completed by its original deadline, rolled forward each day"
                              >
                                Carried over · {e.carryOverDays}d
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">
                            {e.taskDeadline != null && (
                              <span className="whitespace-nowrap">
                                Due {new Date(e.taskDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            )}
                            {e.hoursSpent != null && <span>{e.hoursSpent}h</span>}
                          </div>
                        </div>
                        <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
                          {e.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                title="Supervising: open delegated tasks"
                count={(day.supervising ?? []).length}
              >
                <p className="px-4 pt-3 text-[12px] text-[var(--text-muted)]">
                  Pending, in-progress and review tasks this manager
                  delegated and is responsible for tracking.
                </p>
                {(day.supervising ?? []).length === 0 ? (
                  <PanelEmpty>None.</PanelEmpty>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                          <th className={TH}>Task</th>
                          <th className={TH}>Assigned to</th>
                          <th className={TH}>Brand</th>
                          <th className={TH}>Status</th>
                          <th className={TH}>Deadline</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {day.supervising.map((t: any) => {
                          const meta = taskStatusMeta(t.status);
                          return (
                            <tr
                              key={t._id}
                              onClick={() => setOpenTaskId(t._id)}
                              className="cursor-pointer hover:bg-[var(--bg-primary)] transition-colors"
                              title="Open task"
                            >
                              <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium max-w-[240px]">
                                <span className="line-clamp-2">{t.title}</span>
                              </td>
                              <td className="px-4 py-2.5 text-[12px] text-[var(--text-secondary)]">
                                {t.assigneeName}
                              </td>
                              <td className="px-4 py-2.5">
                                <BrandName
                                  color={t.brandColor}
                                  name={t.brandName}
                                  className="text-[12px] text-[var(--text-secondary)]"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <StatusBadge color={meta.dot} label={meta.label} />
                              </td>
                              <td className="px-4 py-2.5 text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
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
              </Panel>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <Panel title="Tasks handled" count={day.tasks.length}>
                  {day.tasks.length === 0 ? (
                    <PanelEmpty>None.</PanelEmpty>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {day.tasks.map((t: any) => {
                        const meta = taskStatusMeta(t.status);
                        return (
                          <div
                            key={t._id}
                            onClick={() => setOpenTaskId(t._id)}
                            title="Open task"
                            className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-primary)] transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                                {t.title}
                              </p>
                              <p className="text-[12px] text-[var(--text-muted)] truncate">
                                {t.brandName}
                              </p>
                            </div>
                            <StatusBadge
                              className="w-[88px] shrink-0"
                              color={meta.dot}
                              label={meta.label}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
                <Panel title="MoMs that day" count={day.moms.length}>
                  {day.moms.length === 0 ? (
                    <PanelEmpty>None.</PanelEmpty>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {day.moms.map((m: any) => (
                        <div
                          key={m._id}
                          className="flex items-center gap-2 px-4 py-2.5 text-[13px]"
                        >
                          <FileText className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                          <span className="font-medium text-[var(--text-primary)] truncate">
                            {m.title}
                          </span>
                          <span className="text-[12px] text-[var(--text-muted)] shrink-0">
                            · {m.brandName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REPORT VIEW */}
      {managerId && mode === "report" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div>
              <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From"
                className={FIELD}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To"
                className={FIELD}
              />
            </div>
          </div>

          {report === undefined ? (
            <p className="text-[13px] text-[var(--text-muted)] py-8">Loading...</p>
          ) : report === null ? (
            <p className="text-[13px] text-[var(--text-secondary)] py-8">
              You don&apos;t have access to this manager&apos;s worklog.
            </p>
          ) : (
            <>
              <StatStrip className="mb-4">
                <StatTile label="Brands" value={report.totals.brands} />
                <StatTile label="Days logged" value={report.totals.daysLogged} />
                <StatTile label="Total hours" value={report.totals.totalHours} />
                <StatTile label="MoMs" value={report.totals.momCount} />
              </StatStrip>

              {report.brands.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  No activity in this range.
                </p>
              ) : (
                <div className="space-y-4">
                  {report.brands.map((b: any) => (
                    <div
                      key={b.brandId}
                      className="rounded-lg border border-[var(--border)] bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <BrandName
                          color={b.brandColor}
                          name={b.brandName}
                          className="text-[15px] font-semibold text-[var(--text-primary)]"
                        />
                        <div className="flex items-center gap-4 shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">
                          <span>{b.daysLogged} days</span>
                          <span>{b.totalHours}h</span>
                          <span>{b.momCount} MoMs</span>
                          <span>{b.tasks.length} tasks</span>
                        </div>
                      </div>

                      {b.entries.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">
                            Worklog by day
                          </p>
                          <div className="space-y-1.5">
                            {b.entries.map((e: any, i: number) => (
                              <div key={i} className="text-[13px]">
                                <span className="tabular-nums text-[var(--text-muted)] mr-2">
                                  {e.date}
                                </span>
                                <span className="text-[var(--text-primary)]">
                                  {e.content}
                                </span>
                                {e.hoursSpent != null && (
                                  <span className="tabular-nums text-[var(--text-muted)]">
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
                          <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">
                            Tasks
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {b.tasks.map((t: any) => (
                              <span
                                key={t._id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                              >
                                {t.title}
                                <span className="tabular-nums text-[var(--text-muted)]">
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
