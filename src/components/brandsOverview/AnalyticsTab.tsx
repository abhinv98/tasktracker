"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Card, Panel, PanelEmpty, StatStrip, StatTile } from "@/components/ui";

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

function actionLabel(action: string): string {
  if (action.startsWith("brief")) return "Brief";
  if (action.startsWith("deliverable") || action.startsWith("approve")) return "Deliverable";
  if (action.startsWith("task") || action.includes("status") || action.includes("assigned"))
    return "Task";
  return "Activity";
}

/** Heading over a chart: title left, one quiet total right. */
function ChartHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">{title}</h3>
      <span className="text-[12px] tabular-nums text-[var(--text-muted)]">{note}</span>
    </div>
  );
}

function StatusRow({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
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
      <div className="w-full h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
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
      <p className="text-[13px] text-[var(--text-secondary)]">Loading analytics...</p>
    );
  }

  const maxVelocity = Math.max(...data.weeklyVelocity.map((w) => w.count), 1);
  const velocitySum = data.weeklyVelocity.reduce((s, w) => s + w.count, 0);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <StatStrip>
        <StatTile label="Briefs" value={data.totalBriefs} />
        <StatTile label="Tasks" value={data.totalTasks} />
        <StatTile
          label="Overdue"
          value={data.overdueTasks}
          hint={data.overdueTasks > 0 ? "Past deadline" : undefined}
          bad={data.overdueTasks > 0}
        />
        <StatTile label="Teams" value={data.totalTeams} />
        <StatTile label="Brands" value={data.totalBrands} />
        <StatTile label="Avg Completion" value={`${data.avgCompletionHours}h`} />
      </StatStrip>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tasks by Status */}
        <Card>
          <ChartHeader title="Tasks by Status" note={`${data.totalTasks} total`} />
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
                  color="var(--accent-manager)"
                />
              );
            })}
          </div>
        </Card>

        {/* Briefs by Status */}
        <Card>
          <ChartHeader title="Briefs by Status" note={`${data.totalBriefs} total`} />
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
                  color="var(--accent-admin)"
                />
              );
            })}
          </div>
        </Card>

        {/* Weekly Velocity */}
        <Card>
          <ChartHeader title="Weekly Velocity" note={`${velocitySum} done in 8 weeks`} />
          <div className="relative h-[160px] pt-3">
            <div className="absolute inset-x-0 top-3 bottom-6 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="border-t border-[var(--border-subtle)]"
                />
              ))}
            </div>
            <div className="relative flex items-end gap-2 h-full">
              {data.weeklyVelocity.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                  <span className="text-[11px] tabular-nums font-medium text-[var(--text-primary)] h-3.5">
                    {w.count > 0 ? w.count : ""}
                  </span>
                  <div
                    className="w-full rounded-t-sm transition-all duration-300"
                    style={{
                      height: `${Math.max((w.count / maxVelocity) * 100, 4)}%`,
                      backgroundColor: w.count > 0 ? "var(--accent-employee)" : "var(--border-subtle)",
                      minHeight: "4px",
                    }}
                  />
                  <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                    {w.week}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Employee Utilization (banded) */}
        <Card>
          <ChartHeader
            title="Employee Utilization"
            note={`${data.employeeStats.length} ${data.employeeStats.length === 1 ? "person" : "people"}`}
          />
          <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
            {data.employeeStats.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">No employees yet.</p>
            )}
            {banded.behind.length > 0 && (
              <UtilGroup title="Behind" count={banded.behind.length} emps={banded.behind} />
            )}
            {banded.inProgress.length > 0 && (
              <UtilGroup title="In progress" count={banded.inProgress.length} emps={banded.inProgress} />
            )}
            {banded.onTrack.length > 0 && (
              <UtilGroup title="On track" count={banded.onTrack.length} emps={banded.onTrack} />
            )}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Panel title="Recent Activity">
        <div className="max-h-[300px] overflow-y-auto divide-y divide-[var(--border-subtle)]">
          {data.recentActivity.map((log: ActivityLog) => (
            <div key={log._id} className="flex items-start gap-3 px-4 py-2.5">
              <Badge className="min-w-[68px] justify-center mt-0.5 shrink-0">
                {actionLabel(log.action)}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--text-primary)]">
                  <span className="font-medium">{log.userName}</span>{" "}
                  <span className="text-[var(--text-secondary)]">
                    {log.action.replace(/_/g, " ")}
                  </span>{" "}
                  on <span className="font-medium">{log.briefTitle}</span>
                </p>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {new Date(log.timestamp).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          {data.recentActivity.length === 0 && (
            <PanelEmpty>No recent activity.</PanelEmpty>
          )}
        </div>
      </Panel>
    </div>
  );
}

function UtilGroup({
  title,
  count,
  emps,
}: {
  title: string;
  count: number;
  emps: EmployeeStat[];
}) {
  return (
    <div>
      <p className="flex items-center gap-2 mb-1.5 text-[12px] font-medium text-[var(--text-muted)]">
        {title}
        <span className="font-normal tabular-nums">{count}</span>
      </p>
      <div className="space-y-1.5">
        {emps.map((emp) => {
          const rate = emp.totalTasks > 0
            ? Math.round((emp.doneTasks / emp.totalTasks) * 100)
            : 0;
          return (
            <div key={emp._id} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[11px] font-medium text-[var(--text-secondary)] shrink-0">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                    {emp.name}
                  </span>
                  <span className="text-[12px] tabular-nums text-[var(--text-secondary)] shrink-0">
                    {emp.doneTasks}/{emp.totalTasks}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--border-subtle)] mt-0.5">
                  <div
                    className="h-full rounded-full bg-[var(--accent-employee)] transition-all duration-300"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
              <span className="text-[12px] text-[var(--text-muted)] shrink-0 w-9 text-right tabular-nums">
                {emp.trackedHours}h
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
