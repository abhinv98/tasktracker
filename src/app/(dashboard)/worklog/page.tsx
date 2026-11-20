"use client";

import { useQuery } from "convex/react";
import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, PageHeader, SegmentedTabs, StatStrip, StatTile, StatusBadge } from "@/components/ui";
import { TaskNavigator } from "@/components/TaskNavigator";
import { ChevronLeft, ChevronRight, Calendar, Users, X, Filter, Search, Eye, UsersRound } from "lucide-react";
import { taskStatusMeta } from "@/lib/status";
import ManagerWorklogPanel from "@/components/worklog/ManagerWorklogPanel";
import OversightBoard from "@/components/oversight/OversightBoard";
import { fieldClass, iconButtonClass } from "@/components/ui/classes";

const LOAD_LABELS: Record<string, string> = {
  idle: "Idle",
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
};

const ICON_BTN = iconButtonClass;
const FIELD = fieldClass;
const AVATAR =
  "rounded-full bg-[var(--bg-hover)] flex items-center justify-center shrink-0 font-medium text-[var(--text-secondary)]";
const TH = "text-[12px] font-medium text-[var(--text-muted)] px-3 py-2 whitespace-nowrap";

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: taskStatusMeta(status).dot }}
    />
  );
}

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

// Sort order of the member panel's task table; labels and colours come from the lib.
const MEMBER_STATUS_ORDER: Record<string, number> = {
  "in-progress": 1,
  pending: 2,
  review: 3,
  done: 4,
};

type WorklogTab = "worklog" | "teamload" | "managerlog" | "oversight";
const WORKLOG_TABS: WorklogTab[] = ["worklog", "teamload", "managerlog", "oversight"];

// useSearchParams needs a Suspense boundary on statically prerendered pages.
export default function WorkLogPage() {
  return (
    <Suspense fallback={null}>
      <WorkLogPageInner />
    </Suspense>
  );
}

function WorkLogPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useQuery(api.users.getCurrentUser);
  // The active tab lives in the URL so that navigating away (e.g. into a task's
  // brief from Team Load) and coming back via the back button lands on the same
  // tab, not the default one. replace() keeps tab switches out of history.
  const tabParam = searchParams.get("tab");
  const activeTab: WorklogTab = WORKLOG_TABS.includes(tabParam as WorklogTab)
    ? (tabParam as WorklogTab)
    : "worklog";
  const setActiveTab = (tab: WorklogTab) => {
    router.replace(tab === "worklog" ? "/worklog" : `/worklog?tab=${tab}`, {
      scroll: false,
    });
  };
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState("");

  const teams = useQuery(api.teams.listTeams);
  const worklog = useQuery(api.worklog.getEmployeeWorkLog, { date: selectedDate });

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
  const oversightAccess = useQuery(api.oversight.getOversightAccess);

  const isAdmin = user?.role === "admin";
  const isTeamLead = (teams ?? []).some((t: any) => t.leadId === user?._id);
  const hasOversight = oversightAccess != null;

  if (!user || (!isAdmin && !isTeamLead)) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[var(--text-secondary)]">Access denied. Admin or Team Lead only.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Work Log"
        subtitle="Employee task tracking, manifest, and team workload"
      />

      {/* Tab Bar */}
      <div className="mb-4 overflow-x-auto">
        <SegmentedTabs
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "worklog" as const, label: "Daily Work Log", icon: Calendar },
            { value: "teamload" as const, label: "Team Load", icon: Users },
            ...(user?.isSuperAdmin || isTeamLead
              ? [
                  {
                    value: "managerlog" as const,
                    label: "Manager Worklog",
                    icon: UsersRound,
                  },
                ]
              : []),
            ...(hasOversight
              ? [
                  {
                    value: "oversight" as const,
                    label: "Oversight",
                    icon: Eye,
                  },
                ]
              : []),
          ]}
        />
      </div>

      {/* Tab Content */}

      {activeTab === "worklog" && (
        <div>
          {/* Date Navigation */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
              className={ICON_BTN}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Date"
                className={FIELD}
              />
              <span className="text-[13px] text-[var(--text-secondary)] font-medium hidden sm:inline">
                {formatDate(selectedDate)}
              </span>
            </div>
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              className={ICON_BTN}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {selectedDate !== getTodayStr() && (
              <Button variant="secondary" onClick={() => setSelectedDate(getTodayStr())}>
                Today
              </Button>
            )}
          </div>

          {/* Summary Stats */}
          {worklog?.summary && (
            <StatStrip className="mb-4">
              <StatTile label="Active employees" value={worklog.summary.employeesActive} />
              <StatTile label="Total tasks" value={worklog.summary.totalTasks} />
              <StatTile label="Completed" value={worklog.summary.completedTasks} />
              <StatTile
                label="Completion rate"
                value={`${
                  worklog.summary.totalTasks > 0
                    ? Math.round((worklog.summary.completedTasks / worklog.summary.totalTasks) * 100)
                    : 0
                }%`}
              />
            </StatStrip>
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
                aria-label="Search employee"
                className={`${FIELD} w-[180px]`}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by status"
                className={FIELD}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
            {(filterSearch || filterStatus) && (
              <Button variant="ghost" onClick={() => { setFilterSearch(""); setFilterStatus(""); }}>
                Clear Filters
              </Button>
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
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`${AVATAR} w-8 h-8 text-[12px]`}>
                      {(emp.user.name ?? emp.user.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                          {emp.user.name ?? emp.user.email ?? "Unknown"}
                        </p>
                        {emp.user.role === "admin" && (
                          <Badge>{emp.user.isSuperAdmin ? "SA" : "Admin"}</Badge>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)] truncate">{emp.user.designation ?? emp.user.role}</p>
                    </div>
                  </div>
                  <span className="text-[12px] tabular-nums text-[var(--text-muted)] shrink-0">
                    {emp.completedTasks}/{emp.totalTasks} done
                  </span>
                </div>
                {emp.tasks.length > 0 ? (
                  <div className="flex flex-col -mx-2">
                    {emp.tasks
                      .filter((task: any) => !filterStatus || task.status === filterStatus)
                      .map((task: any) => {
                      const statusInfo = taskStatusMeta(task.status);
                      const deadlineDate = task.deadline ? new Date(task.deadline) : null;
                      const isTaskOverdue = deadlineDate && deadlineDate.getTime() < Date.now() && task.status !== "done" && task.status !== "review";
                      return (
                        <div
                          key={task._id}
                          onClick={() => router.push(`/brief/${task.briefId}`)}
                          className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
                        >
                          <span className="text-[13px] text-[var(--text-primary)] truncate flex-1 min-w-0">
                            {task.title}
                          </span>
                          <span className="text-[12px] text-[var(--text-muted)] truncate max-w-[140px] shrink-0">
                            {task.briefTitle}
                          </span>
                          {deadlineDate && (
                            <span
                              title="Deadline"
                              className={`text-[12px] tabular-nums shrink-0 ${isTaskOverdue ? "font-medium text-[var(--danger)]" : "text-[var(--text-muted)]"}`}
                            >
                              {deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {task.timeSpentMinutes > 0 && (
                            <span title="Time spent" className="text-[12px] tabular-nums text-[var(--text-muted)] shrink-0">
                              {Math.round(task.timeSpentMinutes)}m
                            </span>
                          )}
                          {(task as any).changesCount > 0 && (
                            <Badge className="shrink-0">
                              {(task as any).changesCount} {(task as any).changesCount === 1 ? "change" : "changes"}
                            </Badge>
                          )}
                          <StatusBadge
                            className="w-[88px] shrink-0"
                            color={statusInfo.dot}
                            label={statusInfo.label}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)]">No tasks for this day</p>
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

      {activeTab === "teamload" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(teamLoad ?? []).map((team: any) => (
            <Card key={team.team._id}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: team.team.color }}
                  />
                  <h3 className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                    {team.team.name}
                  </h3>
                </div>
                {team.loadLevel === "heavy" ? (
                  <Badge variant="warning">{LOAD_LABELS[team.loadLevel]} Load</Badge>
                ) : (
                  <Badge>{LOAD_LABELS[team.loadLevel]} Load</Badge>
                )}
              </div>

              {/* Task Distribution Bar */}
              <div className="mb-3">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--border-subtle)]">
                  {team.totalTasks > 0 && (
                    <>
                      <div style={{ width: `${(team.statusCounts.review / team.totalTasks) * 100}%`, backgroundColor: taskStatusMeta("review").dot }} />
                      <div style={{ width: `${(team.statusCounts["in-progress"] / team.totalTasks) * 100}%`, backgroundColor: taskStatusMeta("in-progress").dot }} />
                      <div style={{ width: `${(team.statusCounts.pending / team.totalTasks) * 100}%`, backgroundColor: taskStatusMeta("pending").dot }} />
                      <div style={{ width: `${(team.statusCounts["on-hold"] / team.totalTasks) * 100}%`, backgroundColor: taskStatusMeta("on-hold").dot }} />
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12px] tabular-nums text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1.5"><StatusDot status="pending" />{team.statusCounts.pending} pending</span>
                  <span className="inline-flex items-center gap-1.5"><StatusDot status="in-progress" />{team.statusCounts["in-progress"]} in progress</span>
                  <span className="inline-flex items-center gap-1.5"><StatusDot status="review" />{team.statusCounts.review} review</span>
                  {team.statusCounts["on-hold"] > 0 && (
                    <span className="inline-flex items-center gap-1.5"><StatusDot status="on-hold" />{team.statusCounts["on-hold"]} on hold</span>
                  )}
                </div>
              </div>

              {/* Members */}
              <div className="flex flex-col -mx-2">
                {team.members.map((member: any) => (
                  <div
                    key={member._id}
                    onClick={() => openMemberPanel(member._id as Id<"users">)}
                    className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`${AVATAR} w-6 h-6 text-[11px]`}>
                        {(member.name ?? member.email ?? "?")[0]?.toUpperCase()}
                      </div>
                      <span className="text-[13px] text-[var(--text-primary)] truncate">
                        {member.name ?? member.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {member.supervisingCount > 0 && (
                        <Badge>{member.supervisingCount} supervising</Badge>
                      )}
                      <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                        {member.taskCount} active
                      </span>
                      <div className="flex h-1.5 w-16 rounded-full overflow-hidden bg-[var(--border-subtle)]">
                        {member.taskCount > 0 && (
                          <>
                            <div style={{ width: `${(member.reviewTasks / member.taskCount) * 100}%`, backgroundColor: taskStatusMeta("review").dot }} />
                            <div style={{ width: `${(member.inProgressTasks / member.taskCount) * 100}%`, backgroundColor: taskStatusMeta("in-progress").dot }} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
                  {team.members.length} members &middot; {team.totalTasks} active tasks
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
            <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className={`${AVATAR} w-8 h-8 text-[12px]`}>
                  {(memberTasks?.user?.name ?? memberTasks?.user?.email ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                    {memberTasks?.user?.name ?? memberTasks?.user?.email ?? "Loading..."}
                  </h2>
                  {memberTasks?.user?.designation && (
                    <p className="text-[12px] text-[var(--text-muted)] truncate">
                      {memberTasks.user.designation}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={closeMemberPanel}
                className={`${ICON_BTN} shrink-0`}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
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
                  <div className="mb-3">
                    <span className="text-[12px] font-medium text-[var(--text-muted)]">
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
                          <tr className="bg-[var(--bg-primary)]">
                            <th className={TH}>Task</th>
                            <th className={TH}>Brand</th>
                            <th className={TH}>Status</th>
                            <th className={TH}>Assigned</th>
                            <th className={TH}>Deadline</th>
                            <th className={TH}>Sent for Review</th>
                            <th className={TH}>Approved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...memberTasks.tasks]
                            .sort((a: any, b: any) => {
                              const byStatus =
                                (MEMBER_STATUS_ORDER[a.status] ?? 99) -
                                (MEMBER_STATUS_ORDER[b.status] ?? 99);
                              if (byStatus !== 0) return byStatus;
                              // Newest first within a status.
                              return (b.createdAt ?? 0) - (a.createdAt ?? 0);
                            })
                            .map((task: any) => {
                              const config = taskStatusMeta(task.status);
                              const fmtDate = (ts: number | null | undefined) => {
                                if (!ts) return "-";
                                return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                              };
                              const isOverdue = task.deadline && task.deadline < Date.now() && task.status !== "done" && task.status !== "review";
                              return (
                                <tr
                                  key={task._id}
                                  className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
                                  onClick={() => {
                                    // Content-calendar entries: carry the month
                                    // so the calendar opens on the right sheet
                                    // instead of the first one ever created.
                                    const month =
                                      typeof task.postDate === "string"
                                        ? task.postDate.slice(0, 7)
                                        : null;
                                    router.push(
                                      month
                                        ? `/brief/${task.briefId}?month=${month}`
                                        : `/brief/${task.briefId}`
                                    );
                                  }}
                                >
                                  <td className="px-3 py-2.5">
                                    <span className="text-[13px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2">
                                      {task.title}
                                    </span>
                                    <span className="text-[12px] text-[var(--text-muted)] block truncate max-w-[200px]">
                                      {task.briefTitle}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[12px] text-[var(--text-secondary)] truncate block max-w-[100px]">
                                      {task.brandName ?? "-"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <StatusBadge color={config.dot} label={config.label} />
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                                      {fmtDate(task.assignedAt)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {task.deadline ? (
                                      <span className={`text-[12px] tabular-nums whitespace-nowrap ${isOverdue ? "text-[var(--danger)] font-medium" : "text-[var(--text-secondary)]"}`}>
                                        {fmtDate(task.deadline)}
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {task.submittedForReviewAt ? (
                                      <span className="text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                                        {fmtDate(task.submittedForReviewAt)}
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {task.completedAt ? (
                                      <span className="text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                                        {fmtDate(task.completedAt)}
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Supervising — open delegated tasks */}
                  <div className="mt-6">
                    <span className="text-[12px] font-medium text-[var(--text-muted)]">
                      {(memberTasks.supervising?.length ?? 0)} supervising (delegated) task{(memberTasks.supervising?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                    {(memberTasks.supervising?.length ?? 0) === 0 ? (
                      <p className="text-[13px] text-[var(--text-muted)] mt-1">None.</p>
                    ) : (
                      <div className="mt-3 rounded-lg border border-[var(--border)] overflow-x-auto">
                        <table className="w-full text-left min-w-[640px]">
                          <thead>
                            <tr className="bg-[var(--bg-primary)]">
                              <th className={TH}>Task</th>
                              <th className={TH}>Assigned to</th>
                              <th className={TH}>Brand</th>
                              <th className={TH}>Status</th>
                              <th className={TH}>Deadline</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberTasks.supervising.map((t: any) => {
                              const config = taskStatusMeta(t.status);
                              return (
                                <tr
                                  key={t._id}
                                  onClick={() => setOpenTaskId(t._id)}
                                  title="Open task"
                                  className="border-t border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-primary)] transition-colors"
                                >
                                  <td className="px-3 py-2.5">
                                    <span className="text-[13px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2">
                                      {t.title}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[12px] text-[var(--text-secondary)]">{t.assigneeName}</span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.brandColor }} />
                                      {t.brandName}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <StatusBadge color={config.dot} label={config.label} />
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                                      {t.deadline ? new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "managerlog" && (user?.isSuperAdmin || isTeamLead) && (
        <ManagerWorklogPanel />
      )}

      {activeTab === "oversight" && hasOversight && (
        <OversightBoard />
      )}

      <TaskNavigator
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
