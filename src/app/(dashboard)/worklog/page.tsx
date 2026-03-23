"use client";

import { useQuery } from "convex/react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Card } from "@/components/ui";
import { ChevronLeft, ChevronRight, Calendar, Clock, CheckCircle2, Users, Briefcase, X, Filter, Search } from "lucide-react";
import { TASK_STATUS_CONFIG } from "@/lib/statusColors";

const STATUS_COLORS = TASK_STATUS_CONFIG;

const LOAD_COLORS: Record<string, { label: string; color: string }> = {
  idle: { label: "Idle", color: "#9ca3af" },
  light: { label: "Light", color: "#10b981" },
  moderate: { label: "Moderate", color: "#f59e0b" },
  heavy: { label: "Heavy", color: "#ef4444" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MEMBER_STATUS_CONFIG: Record<string, { color: string; label: string; order: number }> = {
  "in-progress": { color: "#f59e0b", label: "In Progress", order: 1 },
  pending: { color: "#6b7280", label: "To Do", order: 2 },
  review: { color: "#8b5cf6", label: "Review", order: 3 },
  done: { color: "#10b981", label: "Done", order: 4 },
};

export default function WorkLogPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const [activeTab, setActiveTab] = useState<"worklog" | "manifest" | "teamload">("worklog");
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState("");

  const [selectedMemberId, setSelectedMemberId] = useState<Id<"users"> | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const memberTasks = useQuery(
    api.worklog.getTeamMemberTasks,
    selectedMemberId ? { userId: selectedMemberId } : "skip"
  );

  function openMemberPanel(userId: Id<"users">) {
    setSelectedMemberId(userId);
    requestAnimationFrame(() => setPanelOpen(true));
  }

  function closeMemberPanel() {
    setPanelOpen(false);
    setTimeout(() => setSelectedMemberId(null), 200);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMemberPanel();
    }
    if (selectedMemberId) {
      document.addEventListener("keydown", handleKey);
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedMemberId]);

  const worklog = useQuery(api.worklog.getEmployeeWorkLog, { date: selectedDate });
  const manifest = useQuery(api.worklog.getTaskManifest);
  const teamLoad = useQuery(api.worklog.getTeamLoadView);

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
          Work Log
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Employee task tracking, manifest, and team workload
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] w-fit mb-6">
        {[
          { key: "worklog" as const, label: "Daily Work Log", icon: Calendar },
          { key: "manifest" as const, label: "Task Manifest", icon: Briefcase },
          { key: "teamload" as const, label: "Team Load", icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              activeTab === key
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "worklog" && (
        <div>
          {/* Date Navigation */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--accent-admin)]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
              <span className="text-[13px] text-[var(--text-secondary)] font-medium hidden sm:inline">
                {formatDate(selectedDate)}
              </span>
            </div>
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            {selectedDate !== getTodayStr() && (
              <button
                onClick={() => setSelectedDate(getTodayStr())}
                className="text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
              >
                Today
              </button>
            )}
          </div>

          {/* Summary Stats */}
          {worklog?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">Active Employees</p>
                <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
                  {worklog.summary.employeesActive}
                </p>
              </Card>
              <Card>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">Total Tasks</p>
                <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
                  {worklog.summary.totalTasks}
                </p>
              </Card>
              <Card>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">Completed</p>
                <p className="font-bold text-[28px] mt-1 tabular-nums" style={{ color: "#10b981" }}>
                  {worklog.summary.completedTasks}
                </p>
              </Card>
              <Card>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">Completion Rate</p>
                <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
                  {worklog.summary.totalTasks > 0
                    ? Math.round((worklog.summary.completedTasks / worklog.summary.totalTasks) * 100)
                    : 0}%
                </p>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search employee..."
                className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] w-[180px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
            {(filterSearch || filterStatus) && (
              <button onClick={() => { setFilterSearch(""); setFilterStatus(""); }} className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline">
                Clear Filters
              </button>
            )}
          </div>

          {/* Employee Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...(worklog?.employees ?? [])]
              .filter((emp) => {
                if (filterSearch) {
                  const name = (emp.user.name ?? emp.user.email ?? "").toLowerCase();
                  if (!name.includes(filterSearch.toLowerCase())) return false;
                }
                if (filterStatus) {
                  if (!emp.tasks.some((t: any) => t.status === filterStatus)) return false;
                }
                return true;
              })
              .sort((a, b) => b.totalTasks - a.totalTasks).map((emp) => (
              <Card key={emp.user._id} className={emp.totalTasks === 0 ? "opacity-50" : ""}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-admin-dim)] flex items-center justify-center">
                      <span className="text-[12px] font-bold text-[var(--accent-admin)]">
                        {(emp.user.name ?? emp.user.email ?? "?")[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-[13px] text-[var(--text-primary)]">
                        {emp.user.name ?? emp.user.email ?? "Unknown"}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] capitalize">{emp.user.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[var(--text-muted)]">
                      {emp.completedTasks}/{emp.totalTasks} done
                    </span>
                  </div>
                </div>
                {emp.tasks.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {emp.tasks
                      .filter((task: any) => !filterStatus || task.status === filterStatus)
                      .map((task: any) => {
                      const statusInfo = STATUS_COLORS[task.status];
                      const deadlineDate = task.deadline ? new Date(task.deadline) : null;
                      const isTaskOverdue = deadlineDate && deadlineDate.getTime() < Date.now() && task.status !== "done";
                      return (
                        <div
                          key={task._id}
                          onClick={() => router.push(`/brief/${task.briefId}`)}
                          className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: statusInfo?.color ?? "#6b7280" }}
                          />
                          <span className="text-[12px] text-[var(--text-primary)] truncate flex-1">
                            {task.title}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                            {task.briefTitle}
                          </span>
                          {deadlineDate && (
                            <span className={`text-[10px] flex items-center gap-0.5 shrink-0 ${isTaskOverdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                              <Calendar className="h-2.5 w-2.5" />
                              {deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                            style={{ color: statusInfo?.color, backgroundColor: statusInfo?.bg }}
                          >
                            {statusInfo?.label}
                          </span>
                          {task.timeSpentMinutes > 0 && (
                            <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-0.5 shrink-0">
                              <Clock className="h-2.5 w-2.5" />
                              {Math.round(task.timeSpentMinutes)}m
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-[var(--text-muted)]">No tasks for this day</p>
                )}
              </Card>
            ))}
          </div>

          {worklog && worklog.employees.length === 0 && (
            <Card>
              <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
                No employee data available.
              </p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "manifest" && (
        <div>
          <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-secondary)]">Employee</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-secondary)]">Brief</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-secondary)]">Brand</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-secondary)]">Type</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-[var(--text-secondary)]">Tasks</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-secondary)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {(manifest ?? []).flatMap((emp) =>
                  emp.briefs.map((brief: any, idx: number) => (
                    <tr key={`${emp.user._id}-${brief.briefId}`} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                      {idx === 0 && (
                        <td
                          className="px-4 py-2.5 align-top"
                          rowSpan={emp.briefs.length}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[var(--accent-admin-dim)] flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-[var(--accent-admin)]">
                                {(emp.user.name ?? emp.user.email ?? "?")[0]?.toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-[12px] text-[var(--text-primary)]">
                                {emp.user.name ?? emp.user.email}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)]">
                                {emp.totalTasks} tasks ({emp.completedTasks} done)
                              </p>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-[12px] text-[var(--text-primary)]">
                          {brief.briefTitle}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md"
                          style={{
                            color: brief.brandColor,
                            backgroundColor: brief.brandColor + "15",
                          }}
                        >
                          {brief.brandName}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {brief.briefType
                            ? brief.briefType === "content_calendar" ? "Content Calendar"
                              : brief.briefType === "video_editing" ? "Video Editing"
                              : brief.briefType === "developmental" ? "Developmental"
                              : brief.briefType === "designing" ? "Designing"
                              : brief.briefType
                            : "—"
                          }
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[12px] text-[var(--text-primary)] font-medium tabular-nums">
                          {brief.doneTasks}/{brief.totalTasks}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={brief.status === "active" ? "employee" : brief.status === "in-progress" ? "manager" : "neutral"}>
                          {brief.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
                {(manifest ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                      No active task assignments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "teamload" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(teamLoad ?? []).map((team: any) => (
            <Card key={team.team._id}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: team.team.color }}
                  />
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
                    {team.team.name}
                  </h3>
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: LOAD_COLORS[team.loadLevel]?.color,
                    backgroundColor: LOAD_COLORS[team.loadLevel]?.color + "15",
                  }}
                >
                  {LOAD_COLORS[team.loadLevel]?.label} Load
                </span>
              </div>

              {/* Task Distribution Bar */}
              <div className="mb-3">
                <div className="flex h-2 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                  {team.totalTasks > 0 && (
                    <>
                      <div style={{ width: `${(team.statusCounts.done / team.totalTasks) * 100}%`, backgroundColor: "var(--accent-employee)" }} />
                      <div style={{ width: `${(team.statusCounts.review / team.totalTasks) * 100}%`, backgroundColor: "var(--accent-admin)" }} />
                      <div style={{ width: `${(team.statusCounts["in-progress"] / team.totalTasks) * 100}%`, backgroundColor: "var(--accent-manager)" }} />
                      <div style={{ width: `${(team.statusCounts.pending / team.totalTasks) * 100}%`, backgroundColor: "var(--text-secondary)" }} />
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)]">
                  <span>{team.statusCounts.pending} pending</span>
                  <span>{team.statusCounts["in-progress"]} in progress</span>
                  <span>{team.statusCounts.review} review</span>
                  <span>{team.statusCounts.done} done</span>
                </div>
              </div>

              {/* Members */}
              <div className="flex flex-col gap-1.5">
                {team.members.map((member: any) => (
                  <div
                    key={member._id}
                    onClick={() => openMemberPanel(member._id as Id<"users">)}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--accent-admin-dim)] flex items-center justify-center">
                        <span className="text-[9px] font-bold text-[var(--accent-admin)]">
                          {(member.name ?? member.email ?? "?")[0]?.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[12px] text-[var(--text-primary)]">
                        {member.name ?? member.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                        {member.taskCount} tasks
                      </span>
                      {member.taskCount > 0 && (
                        <div className="flex h-1.5 w-16 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                          <div style={{ width: `${(member.doneTasks / member.taskCount) * 100}%`, backgroundColor: "var(--accent-employee)" }} />
                          <div style={{ width: `${(member.reviewTasks / member.taskCount) * 100}%`, backgroundColor: "var(--accent-admin)" }} />
                          <div style={{ width: `${(member.inProgressTasks / member.taskCount) * 100}%`, backgroundColor: "var(--accent-manager)" }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-[11px] text-[var(--text-muted)]">
                  {team.members.length} members &middot; {team.totalTasks} total tasks
                </span>
              </div>
            </Card>
          ))}
          {(teamLoad ?? []).length === 0 && (
            <Card className="col-span-2">
              <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
                No teams found.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Member Tasks Slide-in Panel */}
      {selectedMemberId && (
        <>
          <div
            className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${
              panelOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeMemberPanel}
          />
          <div
            ref={panelRef}
            className={`fixed right-0 top-0 h-full w-full sm:w-[820px] z-50 bg-white border-l border-[var(--border)] shadow-xl flex flex-col transition-transform duration-200 ease-out ${
              panelOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-admin-dim)] flex items-center justify-center shrink-0">
                  <span className="text-[12px] font-bold text-[var(--accent-admin)]">
                    {(memberTasks?.user?.name ?? memberTasks?.user?.email ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                    {memberTasks?.user?.name ?? memberTasks?.user?.email ?? "Loading..."}
                  </h2>
                  {memberTasks?.user?.designation && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {memberTasks.user.designation}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={closeMemberPanel}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {memberTasks === undefined ? (
                <p className="text-[13px] text-[var(--text-muted)]">Loading tasks...</p>
              ) : memberTasks === null ? (
                <p className="text-[13px] text-[var(--text-muted)]">Could not load data.</p>
              ) : (
                <>
                  <div className="mb-4">
                    <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                      {memberTasks.tasks.length} active task{memberTasks.tasks.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Task Table */}
                  {memberTasks.tasks.length === 0 ? (
                    <p className="text-[13px] text-[var(--text-muted)]">No active tasks</p>
                  ) : (
                    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[var(--bg-hover)]">
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Task</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Brand</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Brief</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Status</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Duration</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Assigned By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberTasks.tasks
                            .sort((a, b) => (MEMBER_STATUS_CONFIG[a.status]?.order ?? 99) - (MEMBER_STATUS_CONFIG[b.status]?.order ?? 99))
                            .map((task, idx) => {
                              const config = MEMBER_STATUS_CONFIG[task.status] ?? { color: "var(--text-muted)", label: task.status, order: 99 };
                              return (
                                <tr
                                  key={task._id}
                                  className={`border-t border-[var(--border-subtle)] ${idx % 2 === 0 ? "bg-white" : "bg-[var(--bg-primary)]"} hover:bg-[var(--bg-hover)] transition-colors`}
                                >
                                  <td className="px-3 py-2.5">
                                    <span className="text-[12px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2">
                                      {task.title}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] text-[var(--text-secondary)] truncate block max-w-[120px]">
                                      {(task as any).brandName ?? "—"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] text-[var(--text-secondary)] block max-w-[180px] leading-snug line-clamp-2">
                                      {task.briefTitle}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                                      style={{ color: config.color, backgroundColor: config.color + "18" }}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                                      {config.label}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] text-[var(--accent-admin)] font-medium">{task.duration}</span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] text-[var(--text-muted)]">{task.assignedByName}</span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
