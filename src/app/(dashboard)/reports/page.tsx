"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui";
import { Calendar, Clock, CheckCircle2, AlertTriangle, FileText, Briefcase } from "lucide-react";
import { TASK_STATUS_CONFIG } from "@/lib/statusColors";

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
        <p className="text-[14px] text-[var(--text-secondary)]">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
          Reports
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Individual employee performance reports
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div>
          <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">Employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[200px]"
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
          <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
        </div>
      </div>

      {/* Report Cards */}
      {report?.employees && report.employees.length > 0 ? (
        <div className="flex flex-col gap-6">
          {report.employees.map((emp: any) => (
            <Card key={emp.employee._id} className="p-0 overflow-hidden">
              {/* Employee Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-primary)]">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-admin-dim)] flex items-center justify-center">
                  <span className="text-[14px] font-bold text-[var(--accent-admin)]">
                    {(emp.employee.name ?? emp.employee.email ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[15px] text-[var(--text-primary)]">
                      {emp.employee.name ?? emp.employee.email}
                    </p>
                    {emp.employee.role === "admin" && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--accent-admin-dim)] text-[var(--accent-admin)]">
                        {emp.employee.isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {emp.employee.designation ?? emp.employee.role}
                  </p>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-5">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                  <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">{emp.totalTasks}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Total Tasks</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#10b981" }} />
                  </div>
                  <p className="font-bold text-[24px] tabular-nums" style={{ color: "#10b981" }}>{emp.completedTasks}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Completed</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--danger)]" />
                  </div>
                  <p className="font-bold text-[24px] text-[var(--danger)] tabular-nums">{emp.overdueTasks}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Overdue</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                  <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">
                    {Math.round(emp.totalMinutes / 60)}h
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">Time Spent</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Briefcase className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                  <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">{emp.briefCount}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Briefs</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                  <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">{emp.avgCompletionHours}h</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Avg Completion</p>
                </div>
              </div>

              {/* Task Breakdown */}
              {emp.tasks.length > 0 && (
                <div className="px-5 pb-5">
                  <h3 className="text-[12px] font-semibold text-[var(--text-secondary)] mb-2">Task Breakdown</h3>
                  <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[var(--bg-hover)]">
                          <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase px-3 py-2">Task</th>
                          <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase px-3 py-2">Brief</th>
                          <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase px-3 py-2">Status</th>
                          <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase px-3 py-2">Deadline</th>
                          <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase px-3 py-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emp.tasks.map((task: any) => {
                          const sc = TASK_STATUS_CONFIG[task.status];
                          const isOverdue = task.deadline && task.deadline < Date.now() && task.status !== "done";
                          return (
                            <tr
                              key={task._id}
                              className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                              onClick={() => router.push(`/brief/${task.briefId}`)}
                            >
                              <td className="px-3 py-2">
                                <span className="text-[12px] text-[var(--text-primary)] font-medium">{task.title}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-[11px] text-[var(--text-secondary)]">{task.briefTitle}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                  style={{ color: sc?.color, backgroundColor: sc?.bg }}
                                >
                                  {sc?.label ?? task.status}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {task.deadline ? (
                                  <span className={`text-[11px] ${isOverdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                                    {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  {task.timeSpentMinutes > 0 ? `${Math.round(task.timeSpentMinutes)}m` : "—"}
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
        <Card>
          <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
            No data found for the selected filters.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-[13px] text-[var(--text-muted)] text-center py-8">Loading...</p>
        </Card>
      )}
    </div>
  );
}
