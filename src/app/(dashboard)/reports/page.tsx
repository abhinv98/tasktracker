"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Card, EmptyState, PageHeader, StatStrip, StatTile, StatusBadge } from "@/components/ui";
import { taskStatusMeta } from "@/lib/status";

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthAgoStr(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const allUsers = useQuery(api.users.listAllUsers);
  const employees = (allUsers ?? []).filter((u) => u.name || u.email);

  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [startDate, setStartDate] = useState(getMonthAgoStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  const report = useQuery(api.reports.getEmployeeReport, {
    ...(selectedEmployee ? { employeeId: selectedEmployee as Id<"users"> } : {}),
    startDate,
    endDate,
  });

  if (!user || user.role !== "admin") {
    return (
      <div className="p-8">
        <p className="text-[15px] text-[var(--text-secondary)]">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Reports"
        subtitle="Individual employee performance reports"
      />

      {/* Filters */}
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div>
          <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1">Employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-control text-[var(--text-primary)] h-control px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[200px]"
          >
            <option value="">All Team Members</option>
            {employees.map((emp) => (
              <option key={emp._id} value={emp._id}>
                {emp.name ?? emp.email}{emp.role === "admin" ? " (Admin)" : (emp as any).isSuperAdmin ? " (Super Admin)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-control text-[var(--text-primary)] h-control px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-control text-[var(--text-primary)] h-control px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
        </div>
      </div>

      {/* Report Cards */}
      {report?.employees && report.employees.length > 0 ? (
        <div className="flex flex-col gap-4">
          {report.employees.map((emp: any) => (
            <Card key={emp.employee._id} className="p-0 overflow-hidden">
              {/* Employee Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                <div className="w-9 h-9 rounded-full bg-[var(--accent-admin-dim)] flex items-center justify-center">
                  <span className="text-[14px] font-semibold text-[var(--accent-admin-text)]">
                    {(emp.employee.name ?? emp.employee.email ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[15px] text-[var(--text-primary)]">
                      {emp.employee.name ?? emp.employee.email}
                    </p>
                    {emp.employee.role === "admin" && (
                      <Badge variant="admin">
                        {emp.employee.isSuperAdmin ? "Super admin" : "Admin"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {emp.employee.designation ?? emp.employee.role}
                  </p>
                </div>
              </div>

              {/* KPI Cards */}
              <StatStrip bare className={emp.tasks.length > 0 ? "border-b border-[var(--border-subtle)]" : ""}>
                <StatTile label="Total Tasks" value={emp.totalTasks} />
                <StatTile label="Completed" value={emp.completedTasks} />
                <StatTile label="Overdue" value={emp.overdueTasks} hint={emp.overdueTasks > 0 ? "Past deadline" : undefined} bad />
                <StatTile label="Time Spent" value={`${Math.round(emp.totalMinutes / 60)}h`} />
                <StatTile label="Briefs" value={emp.briefCount} />
                <StatTile label="Avg Completion" value={`${emp.avgCompletionHours}h`} />
              </StatStrip>

              {/* Task Breakdown */}
              {emp.tasks.length > 0 && (
                <div>
                  <h3 className="px-4 pt-3 pb-1 text-[12px] font-medium text-[var(--text-muted)]">Task Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th className="text-[12px] font-medium text-[var(--text-muted)] px-4 py-2">Task</th>
                          <th className="text-[12px] font-medium text-[var(--text-muted)] px-4 py-2">Brief</th>
                          <th className="text-[12px] font-medium text-[var(--text-muted)] px-4 py-2">Status</th>
                          <th className="text-[12px] font-medium text-[var(--text-muted)] px-4 py-2">Deadline</th>
                          <th className="text-[12px] font-medium text-[var(--text-muted)] px-4 py-2 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emp.tasks.map((task: any) => {
                          const sc = taskStatusMeta(task.status);
                          const isOverdue = task.deadline && task.deadline < Date.now() && task.status !== "done" && task.status !== "review";
                          return (
                            <tr
                              key={task._id}
                              className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] cursor-pointer transition-colors"
                              onClick={() => router.push(`/brief/${task.briefId}`)}
                            >
                              <td className="px-4 py-2">
                                <span className="text-[13px] text-[var(--text-primary)] font-medium">{task.title}</span>
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-[12px] text-[var(--text-secondary)]">{task.briefTitle}</span>
                              </td>
                              <td className="px-4 py-2">
                                <StatusBadge color={sc.dot} label={sc.label} />
                              </td>
                              <td className="px-4 py-2">
                                {task.deadline ? (
                                  <span className={`text-[12px] tabular-nums ${isOverdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                                    {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                ) : "-"}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
                                  {task.timeSpentMinutes > 0 ? `${Math.round(task.timeSpentMinutes)}m` : "-"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : report?.employees && report.employees.length === 0 ? (
        <EmptyState title="No data found for the selected filters." />
      ) : (
        <Card>
          <p className="text-[13px] text-[var(--text-muted)] text-center py-8">Loading...</p>
        </Card>
      )}
    </div>
  );
}
