"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui";
import {
  Briefcase,
  CheckSquare,
  AlertTriangle,
  Users,
  Tag,
  Clock,
  Activity,
} from "lucide-react";

type EmployeeStat = {
  _id: string;
  name: string;
  totalTasks: number;
  doneTasks: number;
  trackedHours: number;
  estimatedHours?: number;
};

type ActivityLog = {
  _id: string;
  userName: string;
  action: string;
  briefTitle: string;
  timestamp: number;
};

const STATUS_TASK_TINTS: Record<string, { bar: string; chip: string }> = {
  pending: { bar: "#9ca3af", chip: "var(--bg-hover)" },
  "in-progress": { bar: "#3b82f6", chip: "rgba(59,130,246,0.12)" },
  review: { bar: "#f59e0b", chip: "rgba(245,158,11,0.14)" },
  done: { bar: "#10b981", chip: "rgba(16,185,129,0.14)" },
};

const STATUS_BRIEF_TINTS: Record<string, { bar: string; chip: string }> = {
  draft: { bar: "#9ca3af", chip: "var(--bg-hover)" },
  active: { bar: "var(--accent-manager)", chip: "var(--accent-manager-dim)" },
  "in-progress": { bar: "#3b82f6", chip: "rgba(59,130,246,0.12)" },
  review: { bar: "#f59e0b", chip: "rgba(245,158,11,0.14)" },
  completed: { bar: "#10b981", chip: "rgba(16,185,129,0.14)" },
  archived: { bar: "var(--text-disabled)", chip: "var(--bg-hover)" },
};

function actionStyle(action: string): { dot: string; bg: string; label: string } {
  if (action.startsWith("brief"))
    return { dot: "var(--accent-admin)", bg: "var(--accent-admin-dim)", label: "Brief" };
  if (action.startsWith("deliverable") || action.startsWith("approve"))
    return { dot: "#10b981", bg: "rgba(16,185,129,0.14)", label: "Deliverable" };
  if (action.startsWith("task") || action.includes("status") || action.includes("assigned"))
    return { dot: "var(--accent-manager)", bg: "var(--accent-manager-dim)", label: "Task" };
  return { dot: "var(--text-muted)", bg: "var(--bg-hover)", label: "Activity" };
}

function StatusRow({
  label,
  count,
  pct,
  tint,
}: {
  label: string;
  count: number;
  pct: number;
  tint: { bar: string; chip: string };
}) {
  const showInside = pct >= 22;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">
          {count}
          {pct > 0 && (
            <span className="text-[var(--text-muted)] ml-1">
              ({Math.round(pct)}%)
            </span>
          )}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-1.5"
          style={{ width: `${pct}%`, backgroundColor: tint.bar }}
        >
          {showInside && (
            <span className="text-[11px] font-semibold text-white tabular-nums">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  const data = useQuery(api.analytics.getDashboardAnalytics);

  const banded = useMemo(() => {
    if (!data)
      return {
        onTrack: [] as EmployeeStat[],
        inProgress: [] as EmployeeStat[],
        behind: [] as EmployeeStat[],
      };
    const out = { onTrack: [] as EmployeeStat[], inProgress: [] as EmployeeStat[], behind: [] as EmployeeStat[] };
    for (const emp of data.employeeStats as EmployeeStat[]) {
      const rate = emp.totalTasks > 0 ? (emp.doneTasks / emp.totalTasks) * 100 : 0;
      if (rate >= 75) out.onTrack.push(emp);
      else if (rate >= 25) out.inProgress.push(emp);
      else out.behind.push(emp);
    }
    return out;
  }, [data]);

  if (!data) {
    return (
      <p className="text-[15px] text-[var(--text-secondary)]">Loading analytics...</p>
    );
  }

  const maxVelocity = Math.max(...data.weeklyVelocity.map((w) => w.count), 1);
  const velocitySum = data.weeklyVelocity.reduce((s, w) => s + w.count, 0);

  return (
    <div className="space-y-6">
      {/* Primary KPIs (3-up large) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4" accent="admin">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="h-4 w-4 text-[var(--accent-admin-text)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Briefs
            </p>
          </div>
          <p className="font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {data.totalBriefs}
          </p>
        </Card>
        <Card className="p-4" accent="manager">
          <div className="flex items-center gap-2 mb-1">
            <CheckSquare className="h-4 w-4 text-[var(--accent-manager-text)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Tasks
            </p>
          </div>
          <p className="font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {data.totalTasks}
          </p>
        </Card>
        <Card
          className="p-4 bg-red-50 border-red-100"
          accent={data.overdueTasks > 0 ? "admin" : "none"}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
              Overdue
            </p>
          </div>
          <p
            className={`font-bold text-[24px] tabular-nums ${
              data.overdueTasks > 0 ? "text-red-700" : "text-[var(--text-primary)]"
            }`}
          >
            {data.overdueTasks}
          </p>
        </Card>
      </div>

      {/* Secondary KPIs (3-up smaller) */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-3.5 w-3.5 text-[var(--accent-employee-text)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Teams
            </p>
          </div>
          <p className="font-bold text-[20px] tabular-nums text-[var(--text-primary)]">
            {data.totalTeams}
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="h-3.5 w-3.5 text-[var(--accent-admin-text)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Brands
            </p>
          </div>
          <p className="font-bold text-[20px] tabular-nums text-[var(--text-primary)]">
            {data.totalBrands}
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Avg Completion
            </p>
          </div>
          <p className="font-bold text-[20px] tabular-nums text-[var(--text-primary)]">
            {data.avgCompletionHours}
            <span className="text-[15px] text-[var(--text-muted)] ml-0.5">h</span>
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Status */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
              Tasks by Status
            </h3>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
              {data.totalTasks} total
            </span>
          </div>
          <div className="space-y-2.5">
            {[
              { key: "pending", label: "Pending" },
              { key: "in-progress", label: "In Progress" },
              { key: "review", label: "Review" },
              { key: "done", label: "Done" },
            ].map(({ key, label }) => {
              const count = data.tasksByStatus[key] ?? 0;
              const pct = data.totalTasks > 0 ? (count / data.totalTasks) * 100 : 0;
              return (
                <StatusRow
                  key={key}
                  label={label}
                  count={count}
                  pct={pct}
                  tint={STATUS_TASK_TINTS[key]}
                />
              );
            })}
          </div>
        </Card>

        {/* Briefs by Status */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
              Briefs by Status
            </h3>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
              {data.totalBriefs} total
            </span>
          </div>
          <div className="space-y-2.5">
            {[
              { key: "draft", label: "Draft" },
              { key: "active", label: "Active" },
              { key: "in-progress", label: "In Progress" },
              { key: "review", label: "Review" },
              { key: "completed", label: "Completed" },
              { key: "archived", label: "Archived" },
            ].map(({ key, label }) => {
              const count = data.briefsByStatus[key] ?? 0;
              const pct = data.totalBriefs > 0 ? (count / data.totalBriefs) * 100 : 0;
              return (
                <StatusRow
                  key={key}
                  label={label}
                  count={count}
                  pct={pct}
                  tint={STATUS_BRIEF_TINTS[key]}
                />
              );
            })}
          </div>
        </Card>

        {/* Weekly Velocity */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
              Weekly Velocity
            </h3>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
              {velocitySum} done in 8 weeks
            </span>
          </div>
          <div className="relative h-[160px] pt-3">
            <div className="absolute inset-x-0 top-3 bottom-6 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="border-t border-dashed border-[var(--border-subtle)]"
                />
              ))}
            </div>
            <div className="relative flex items-end gap-2 h-full">
              {data.weeklyVelocity.map((w, i) => {
                const isMax = w.count === maxVelocity && maxVelocity > 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] tabular-nums font-semibold text-[var(--text-primary)] h-3.5">
                      {w.count > 0 ? w.count : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md transition-all duration-300"
                      style={{
                        height: `${Math.max((w.count / maxVelocity) * 100, 4)}%`,
                        backgroundColor: w.count > 0
                          ? isMax
                            ? "var(--accent-employee)"
                            : "rgba(16,185,129,0.65)"
                          : "var(--bg-hover)",
                        minHeight: "4px",
                      }}
                    />
                    <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                      {w.week}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Employee Utilization (banded) */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
              Employee Utilization
            </h3>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
              {data.employeeStats.length} {data.employeeStats.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
            {data.employeeStats.length === 0 && (
              <p className="text-[12px] text-[var(--text-muted)]">No employees yet.</p>
            )}
            {banded.behind.length > 0 && (
              <UtilGroup
                title="Behind"
                tone="rgba(239,68,68,0.85)"
                count={banded.behind.length}
                emps={banded.behind}
              />
            )}
            {banded.inProgress.length > 0 && (
              <UtilGroup
                title="In progress"
                tone="rgba(59,130,246,0.85)"
                count={banded.inProgress.length}
                emps={banded.inProgress}
              />
            )}
            {banded.onTrack.length > 0 && (
              <UtilGroup
                title="On track"
                tone="rgba(16,185,129,0.85)"
                count={banded.onTrack.length}
                emps={banded.onTrack}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
            Recent Activity
          </h3>
          <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {data.recentActivity.map((log: ActivityLog) => {
            const sty = actionStyle(log.action);
            return (
              <div
                key={log._id}
                className="flex items-start gap-2.5 py-1.5 border-b border-[var(--border-subtle)] last:border-0"
              >
                <span
                  className="inline-flex items-center justify-center min-w-[68px] h-5 px-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider mt-0.5 shrink-0"
                  style={{ backgroundColor: sty.bg, color: sty.dot }}
                >
                  {sty.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[var(--text-primary)]">
                    <span className="font-medium">{log.userName}</span>{" "}
                    <span className="text-[var(--text-secondary)]">
                      {log.action.replace(/_/g, " ")}
                    </span>{" "}
                    on <span className="font-medium">{log.briefTitle}</span>
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {new Date(log.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          {data.recentActivity.length === 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">No recent activity.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function UtilGroup({
  title,
  tone,
  count,
  emps,
}: {
  title: string;
  tone: string;
  count: number;
  emps: EmployeeStat[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: tone }}
        />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </p>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {count}
        </span>
      </div>
      <div className="space-y-1.5 pl-1">
        {emps.map((emp) => {
          const rate = emp.totalTasks > 0
            ? Math.round((emp.doneTasks / emp.totalTasks) * 100)
            : 0;
          return (
            <div key={emp._id} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[var(--accent-employee)] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                    {emp.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--text-secondary)] shrink-0">
                    {emp.doneTasks}/{emp.totalTasks}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] mt-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${rate}%`, backgroundColor: tone }}
                  />
                </div>
              </div>
              <span className="text-[11px] text-[var(--text-muted)] shrink-0 w-9 text-right tabular-nums">
                {emp.trackedHours}h
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
