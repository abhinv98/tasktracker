"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui";

export default function AnalyticsPage() {
  const data = useQuery(api.analytics.getDashboardAnalytics);

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading analytics...</p>
      </div>
    );
  }

  const maxVelocity = Math.max(...data.weeklyVelocity.map((w) => w.count), 1);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="font-bold text-[20px] text-[var(--text-primary)] tracking-tight">
        Analytics
      </h1>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Briefs", value: data.totalBriefs, color: "var(--accent-admin)" },
          { label: "Tasks", value: data.totalTasks, color: "var(--accent-manager)" },
          { label: "Overdue", value: data.overdueTasks, color: "var(--danger)" },
          { label: "Teams", value: data.totalTeams, color: "var(--accent-employee)" },
          { label: "Brands", value: data.totalBrands, color: "var(--accent-admin)" },
          { label: "Avg Completion", value: `${data.avgCompletionHours}h`, color: "var(--text-secondary)" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 text-center">
            <p className="font-bold text-[22px] tabular-nums" style={{ color: stat.color }}>
              {stat.value}
            </p>
            <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-1">
              {stat.label}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Status Breakdown */}
        <Card className="p-5">
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
            Tasks by Status
          </h3>
          <div className="space-y-3">
            {[
              { key: "pending", label: "Pending", color: "var(--text-secondary)" },
              { key: "in-progress", label: "In Progress", color: "var(--accent-manager)" },
              { key: "review", label: "Review", color: "var(--accent-admin)" },
              { key: "done", label: "Done", color: "var(--accent-employee)" },
            ].map(({ key, label, color }) => {
              const count = data.tasksByStatus[key] ?? 0;
              const pct = data.totalTasks > 0 ? (count / data.totalTasks) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
                    <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">
                      {count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--bg-hover)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Brief Status Breakdown */}
        <Card className="p-5">
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
            Briefs by Status
          </h3>
          <div className="space-y-3">
            {[
              { key: "draft", label: "Draft", color: "var(--text-muted)" },
              { key: "active", label: "Active", color: "var(--accent-manager)" },
              { key: "in-progress", label: "In Progress", color: "var(--accent-admin)" },
              { key: "review", label: "Review", color: "#d4a017" },
              { key: "completed", label: "Completed", color: "var(--accent-employee)" },
              { key: "archived", label: "Archived", color: "var(--text-disabled)" },
            ].map(({ key, label, color }) => {
              const count = data.briefsByStatus[key] ?? 0;
              const pct = data.totalBriefs > 0 ? (count / data.totalBriefs) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
                    <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">
                      {count}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Weekly Velocity Chart */}
        <Card className="p-5">
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
            Weekly Velocity
          </h3>
          <div className="flex items-end gap-2 h-[140px]">
            {data.weeklyVelocity.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums font-semibold text-[var(--text-primary)]">
                  {w.count > 0 ? w.count : ""}
                </span>
                <div
                  className="w-full rounded-t-md transition-all duration-300"
                  style={{
                    height: `${Math.max((w.count / maxVelocity) * 100, 4)}%`,
                    backgroundColor: w.count > 0 ? "var(--accent-employee)" : "var(--bg-hover)",
                    minHeight: "4px",
                  }}
                />
                <span className="text-[9px] text-[var(--text-muted)] whitespace-nowrap">
                  {w.week}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Employee Utilization */}
        <Card className="p-5">
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
            Employee Utilization
          </h3>
          <div className="space-y-3 max-h-[200px] overflow-y-auto">
            {data.employeeStats.map((emp) => {
              const completionRate = emp.totalTasks > 0
                ? Math.round((emp.doneTasks / emp.totalTasks) * 100)
                : 0;
              return (
                <div key={emp._id} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-employee)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                        {emp.name}
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--text-secondary)]">
                        {emp.doneTasks}/{emp.totalTasks} tasks
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] mt-1">
                      <div
                        className="h-full rounded-full bg-[var(--accent-employee)]"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0 w-10 text-right">
                    {emp.trackedHours}h
                  </span>
                </div>
              );
            })}
            {data.employeeStats.length === 0 && (
              <p className="text-[12px] text-[var(--text-muted)]">No employees yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-5">
        <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
          Recent Activity
        </h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {data.recentActivity.map((log) => (
            <div key={log._id} className="flex items-start gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-admin)] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-[var(--text-primary)]">
                  <span className="font-medium">{log.userName}</span>{" "}
                  <span className="text-[var(--text-secondary)]">
                    {log.action.replace(/_/g, " ")}
                  </span>{" "}
                  on <span className="font-medium">{log.briefTitle}</span>
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
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
            <p className="text-[12px] text-[var(--text-muted)]">No recent activity.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
