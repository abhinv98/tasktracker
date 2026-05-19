"use client";

import { useQuery } from "convex/react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Card } from "@/components/ui";
import { ChevronLeft, ChevronRight, Calendar, Clock, CheckCircle2, Users, Briefcase, X, Filter, Search, FileText, AlertTriangle, Eye, Building2, UsersRound } from "lucide-react";
import { TASK_STATUS_CONFIG } from "@/lib/statusColors";
import ManagerWorklogPanel from "@/components/worklog/ManagerWorklogPanel";
import OversightBoard from "@/components/oversight/OversightBoard";

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

const MEMBER_STATUS_CONFIG: Record<string, { color: string; label: string; order: number }> = {
  "in-progress": { color: "#f59e0b", label: "In Progress", order: 1 },
  pending: { color: "#6b7280", label: "To Do", order: 2 },
  review: { color: "#8b5cf6", label: "Review", order: 3 },
  done: { color: "#10b981", label: "Done", order: 4 },
};

export default function WorkLogPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const [activeTab, setActiveTab] = useState<"teamload" | "managerlog" | "oversight">("teamload");

  const teams = useQuery(api.teams.listTeams);

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

  const teamLoad = useQuery(api.worklog.getTeamLoadView);

  const isAdmin = user?.role === "admin";
  const isTeamLead = (teams ?? []).some((t: any) => t.leadId === user?._id);

  if (!user || (!isAdmin && !isTeamLead)) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Access denied. Admin or Team Lead only.</p>
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
          { key: "teamload" as const, label: "Team Load", icon: Users },
          ...(user?.isSuperAdmin || isTeamLead
            ? [
                {
                  key: "managerlog" as const,
                  label: "Manager Worklog",
                  icon: UsersRound,
                },
              ]
            : []),
          ...(user?.isOversightAdmin
            ? [
                {
                  key: "oversight" as const,
                  label: "Oversight",
                  icon: Eye,
                },
              ]
            : []),
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
            className={`fixed right-0 top-0 h-full w-full sm:w-[960px] z-50 bg-white border-l border-[var(--border)] shadow-xl flex flex-col transition-transform duration-200 ease-out ${
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
                    <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
                      <table className="w-full text-left min-w-[880px]">
                        <thead>
                          <tr className="bg-[var(--bg-hover)]">
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Task</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Brand</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Status</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Assigned</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Deadline</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Sent for Review</th>
                            <th className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-3 py-2">Approved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberTasks.tasks
                            .sort((a: any, b: any) => (MEMBER_STATUS_CONFIG[a.status]?.order ?? 99) - (MEMBER_STATUS_CONFIG[b.status]?.order ?? 99))
                            .map((task: any, idx: number) => {
                              const config = MEMBER_STATUS_CONFIG[task.status] ?? { color: "var(--text-muted)", label: task.status, order: 99 };
                              const fmtDate = (ts: number | null | undefined) => {
                                if (!ts) return "—";
                                return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                              };
                              const isOverdue = task.deadline && task.deadline < Date.now() && task.status !== "done" && task.status !== "review";
                              return (
                                <tr
                                  key={task._id}
                                  className={`border-t border-[var(--border-subtle)] ${idx % 2 === 0 ? "bg-white" : "bg-[var(--bg-primary)]"} hover:bg-[var(--bg-hover)] transition-colors cursor-pointer`}
                                  onClick={() => router.push(`/brief/${task.briefId}`)}
                                >
                                  <td className="px-3 py-2.5">
                                    <span className="text-[12px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2">
                                      {task.title}
                                    </span>
                                    <span className="text-[10px] text-[var(--text-muted)] block truncate max-w-[200px]">
                                      {task.briefTitle}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] text-[var(--text-secondary)] truncate block max-w-[100px]">
                                      {task.brandName ?? "—"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap"
                                      style={{ color: config.color, backgroundColor: config.color + "18" }}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                                      {config.label}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                                      {fmtDate(task.assignedAt)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {task.deadline ? (
                                      <span className={`text-[11px] whitespace-nowrap ${isOverdue ? "text-[var(--danger)] font-semibold" : "text-[var(--text-secondary)]"}`}>
                                        {fmtDate(task.deadline)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-[var(--text-muted)]">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {task.submittedForReviewAt ? (
                                      <span className="text-[11px] text-blue-600 whitespace-nowrap">
                                        {fmtDate(task.submittedForReviewAt)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-[var(--text-muted)]">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {task.completedAt ? (
                                      <span className="text-[11px] text-emerald-600 whitespace-nowrap">
                                        {fmtDate(task.completedAt)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-[var(--text-muted)]">—</span>
                                    )}
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

      {activeTab === "managerlog" && (user?.isSuperAdmin || isTeamLead) && (
        <ManagerWorklogPanel />
      )}

      {activeTab === "oversight" && user?.isOversightAdmin && (
        <OversightBoard />
      )}
    </div>
  );
}
