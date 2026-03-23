"use client";

import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, TaskDetailModal, DatePicker } from "@/components/ui";
import { X, BarChart3, ArrowRight, ChevronDown, ChevronRight, ClipboardCheck, Briefcase, AlertTriangle, Phone, Clock, Play, CalendarClock, Info, UserX, CalendarOff, Trash2, Calendar } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ActivityFeed() {
  const data = useQuery(api.analytics.getDashboardAnalytics);
  if (!data) return <p className="text-[12px] text-[var(--text-muted)]">Loading...</p>;
  const activity = data.recentActivity.slice(0, 8);
  if (activity.length === 0) return <p className="text-[12px] text-[var(--text-muted)]">No recent activity.</p>;
  return (
    <div className="space-y-2 max-h-[200px] overflow-y-auto">
      {activity.map((log) => (
        <div key={log._id} className="flex items-start gap-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-admin)] mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[var(--text-primary)]">
              <span className="font-medium">{log.userName}</span>{" "}
              <span className="text-[var(--text-secondary)]">{log.action.replace(/_/g, " ")}</span>{" "}
              on <span className="font-medium">{log.briefTitle}</span>
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { color: string; label: string; order: number }> = {
  "in-progress": { color: "#f59e0b", label: "In Progress", order: 1 },
  pending: { color: "#6b7280", label: "Pending", order: 2 },
  review: { color: "#8b5cf6", label: "Review", order: 3 },
  done: { color: "#10b981", label: "Done", order: 4 },
};

export default function DashboardPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const briefs = useQuery(api.briefs.listBriefs, {});
  const tasks = useQuery(
    api.tasks.listTasksForUser,
    user ? { userId: user._id } : "skip"
  );
  const allUsers = useQuery(api.users.listAllUsers);
  const role = user?.role ?? "employee";


  const activeBriefs = (briefs ?? []).filter(
    (b) => !["archived", "completed"].includes(b.status)
  ).length;

  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "there";
  const greeting = getGreeting();


  // ═══════════════════════════════════════════
  // ADMIN DASHBOARD
  // ═══════════════════════════════════════════
  if (role === "admin") {
    const teams = useQuery(api.teams.listTeams);
    const teamLeadOverview = useQuery(api.teams.getTeamLeadBriefOverview);
    const pendingApprovalCount = useQuery(api.approvals.getTeamLeadPendingCount);
    const myBrandIds = useQuery(api.brands.getMyManagedBrandIds);
    const clientApprovalCounts = useQuery(api.jsr.getClientApprovalCounts);
    const employeeCount = (allUsers ?? []).filter(
      (u) => u.role === "employee"
    ).length;
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
    const [adminSelectedTaskId, setAdminSelectedTaskId] = useState<string | null>(null);

    const overdueTasksForManager = useQuery(api.tasks.listOverdueTasksForManager);
    const actionNeededTasks = useQuery(api.tasks.listActionNeededTasks);
    const adminOverdueHalt = useQuery(api.tasks.getOverdueHaltStatus);
    const resumeOverdueTask = useMutation(api.tasks.resumeOverdueTask);
    const extendTaskDeadline = useMutation(api.tasks.extendTaskDeadline);
    const confirmOverdueContact = useMutation(api.tasks.confirmOverdueContact);
    const adminContactManager = useMutation(api.tasks.contactManagerForOverdue);
    const [adminContactedTasks, setAdminContactedTasks] = useState<Set<string>>(new Set());
    const deleteTask = useMutation(api.tasks.deleteTask);
    const deleteBrief = useMutation(api.briefs.deleteBrief);
    const [extendingTaskId, setExtendingTaskId] = useState<string | null>(null);
    const [extendDeadline, setExtendDeadline] = useState<number | undefined>(undefined);
    const [extendDeadlineTime, setExtendDeadlineTime] = useState("");
    const [resolvingTaskId, setResolvingTaskId] = useState<string | null>(null);

    const adminIsHalted = adminOverdueHalt && adminOverdueHalt.length > 0;

    const isSuperAdmin = user?.isSuperAdmin === true;
    const myBrandIdSet = new Set(myBrandIds ?? []);
    const scopedBriefs = isSuperAdmin
      ? (briefs ?? [])
      : (briefs ?? []).filter((b: any) => b.brandId && myBrandIdSet.has(b.brandId));
    const scopedActiveBriefs = scopedBriefs.filter(
      (b) => !["archived", "completed"].includes(b.status)
    ).length;
    const scopedOpenTasks = scopedBriefs.reduce(
      (acc, b) =>
        acc +
        ((b as { taskCount?: number }).taskCount ?? 0) -
        ((b as { doneCount?: number }).doneCount ?? 0),
      0
    );

    const adminActiveTasks = (tasks ?? []).filter((t) => t.status !== "done");

    function toggleTeam(teamId: string) {
      setExpandedTeams((prev) => {
        const next = new Set(prev);
        next.has(teamId) ? next.delete(teamId) : next.add(teamId);
        return next;
      });
    }

    return (
      <div className="p-4 sm:p-6 lg:p-8 relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
          <div>
            <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
              {greeting}, {displayName}
            </h1>
            <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
              Here&apos;s your operational overview
            </p>
          </div>
          {(myBrandIds ?? []).length > 0 && (
            <button
              onClick={() => router.push("/brands?filter=mine")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-admin)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <Briefcase className="h-4 w-4" />
              My Brands
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card accent="admin" hover onClick={() => router.push("/briefs")} className="cursor-pointer">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Active Briefs
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {scopedActiveBriefs}
            </p>
          </Card>
          <Card accent="manager" hover onClick={() => router.push("/worklog")} className="cursor-pointer">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Open Tasks
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {scopedOpenTasks}
            </p>
          </Card>
          <Card accent="employee" hover onClick={() => router.push(isSuperAdmin ? "/teams" : "/brands?filter=mine")} className="cursor-pointer">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              {isSuperAdmin ? "Teams" : "My Brands"}
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {isSuperAdmin ? (teams?.length ?? 0) : myBrandIdSet.size}
            </p>
          </Card>
          <Card hover onClick={() => router.push("/users")} className="cursor-pointer">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Employees
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {employeeCount}
            </p>
          </Card>
        </div>

        {/* Brand Overview & Briefs Overview Shortcuts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 sm:mb-8">
          <Card
            hover
            accent="admin"
            onClick={() => router.push("/overview")}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent-admin-dim)] flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-[var(--accent-admin)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
                  Brand Overview
                </h3>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  View all brands, managers, and task progress
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            </div>
          </Card>
          <Card
            hover
            accent="employee"
            onClick={() => router.push("/briefs")}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent-employee-dim)] flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-[var(--accent-employee)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
                  Briefs Overview
                </h3>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Browse all briefs, tasks, and deadlines
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            </div>
          </Card>
        </div>

        {/* Client Approval Status */}
        {clientApprovalCounts && (clientApprovalCounts.approved > 0 || clientApprovalCounts.pendingClient > 0 || clientApprovalCounts.changesRequested > 0 || clientApprovalCounts.denied > 0) && (
          <div className="mb-6 sm:mb-8">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3">Client Approvals</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {clientApprovalCounts.pendingClient > 0 && (
                <Card>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">Pending Client</p>
                  <p className="font-bold text-[24px] text-purple-600 mt-1 tabular-nums">{clientApprovalCounts.pendingClient}</p>
                </Card>
              )}
              {clientApprovalCounts.approved > 0 && (
                <Card accent="employee">
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">Client Approved</p>
                  <p className="font-bold text-[24px] text-emerald-600 mt-1 tabular-nums">{clientApprovalCounts.approved}</p>
                </Card>
              )}
              {clientApprovalCounts.changesRequested > 0 && (
                <Card accent="manager">
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">Changes Requested</p>
                  <p className="font-bold text-[24px] text-amber-600 mt-1 tabular-nums">{clientApprovalCounts.changesRequested}</p>
                </Card>
              )}
              {clientApprovalCounts.denied > 0 && (
                <Card>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">Client Denied</p>
                  <p className="font-bold text-[24px] text-red-600 mt-1 tabular-nums">{clientApprovalCounts.denied}</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Reminders Section (admin assigned to overdue tasks but not the brand manager) */}
        {adminIsHalted && (
          <div className="mb-6 sm:mb-8">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Reminders ({adminOverdueHalt!.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {adminOverdueHalt!.map((ot) => {
                const isContacted = ot.overdueContacted || adminContactedTasks.has(ot._id);
                return (
                  <Card key={ot._id} className="p-4 border-l-4 border-l-red-500">
                    <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">{ot.title}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {ot.briefTitle} &middot; Deadline was {new Date(ot.deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </p>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border-subtle)]">
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Manager: <span className="font-semibold">{ot.managerName}</span>
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            await adminContactManager({ taskId: ot._id as Id<"tasks"> });
                            setAdminContactedTasks((prev) => new Set(prev).add(ot._id));
                          } catch {}
                        }}
                        disabled={isContacted}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--accent-admin)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        <Phone className="h-3 w-3" />
                        {isContacted ? "Contacted" : "Contact Manager"}
                      </button>
                    </div>
                    {isContacted && (
                      <p className="text-[10px] text-amber-700 mt-2 bg-amber-50 rounded px-2 py-1">
                        Waiting for the brand manager to confirm.
                      </p>
                    )}
                    {!isContacted && ot.overdueContactDenied && (
                      <p className="text-[10px] text-red-700 mt-2 bg-red-100 rounded px-2 py-1">
                        It seems you still have not had the meeting with the brand manager. Please contact them regarding this overdue task.
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Overdue Tasks Section */}
        {(overdueTasksForManager ?? []).length > 0 && (
          <div className="mb-6 sm:mb-8">
            <h2 className="font-semibold text-[15px] text-red-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Overdue Alerts ({overdueTasksForManager!.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {overdueTasksForManager!.map((ot: any) => (
                <Card key={ot._id} className={`p-4 border-l-4 ${ot.alertType === "unassigned" ? "border-l-amber-500" : "border-l-red-500"}`}>
                  <div className="mb-2">
                    <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">{ot.title}</p>
                    {ot.alertType === "unassigned" ? (
                      <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                        No tasks assigned. Please assign someone quickly.
                      </p>
                    ) : (
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                        {ot.briefTitle} &middot; <span className="font-semibold">{ot.assigneeName}</span>
                      </p>
                    )}
                    <p className="text-[11px] text-red-600 mt-0.5">
                      <Clock className="inline h-3 w-3 mr-0.5" />
                      {new Date(ot.deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                      {" "}({Math.round((Date.now() - ot.deadline) / (1000 * 60 * 60))}h overdue)
                    </p>
                    {ot.deadlineExtended && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-50 text-yellow-700 mt-1">
                        EXTENDED
                      </span>
                    )}
                  </div>
                  {ot.alertType !== "unassigned" && ot.overdueContacted && (
                    <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-[11px] font-medium text-blue-800 mb-1.5">
                        <Phone className="inline h-3 w-3 mr-0.5" />
                        {ot.assigneeName} has contacted you. Have you had the meeting?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await confirmOverdueContact({ taskId: ot._id as Id<"tasks">, confirmed: true });
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={async () => {
                            await confirmOverdueContact({ taskId: ot._id as Id<"tasks">, confirmed: false });
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-600 border border-red-300 hover:bg-red-50 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )}
                  {ot.briefType === "content_calendar" && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" /> Content Calendar
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                    {ot.alertType === "unassigned" ? (
                      <>
                        <button
                          onClick={() => {
                            if (ot.briefType === "content_calendar" && ot.brandId) {
                              router.push(`/content-calendar?brand=${ot.brandId}`);
                            } else {
                              router.push(`/brief/${ot.briefId}`);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
                        >
                          <ArrowRight className="h-3 w-3" />
                          {ot.briefType === "content_calendar" ? "Open Calendar" : "Assign Tasks"}
                        </button>
                        {resolvingTaskId !== ot._id && (
                          <button
                            onClick={() => setResolvingTaskId(ot._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 transition-colors ml-auto"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            await resumeOverdueTask({ taskId: ot._id as Id<"tasks"> });
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                        >
                          <Play className="h-3 w-3" />
                          Resume
                        </button>
                        {extendingTaskId === ot._id ? (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <div className="flex-1 min-w-[100px]">
                              <DatePicker value={extendDeadline} onChange={setExtendDeadline} placeholder="New deadline" />
                            </div>
                            <input
                              type="time"
                              value={extendDeadlineTime}
                              onChange={(e) => setExtendDeadlineTime(e.target.value)}
                              className="w-24 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                            />
                            <button
                              onClick={async () => {
                                if (!extendDeadline) return;
                                let finalDeadline = extendDeadline;
                                if (extendDeadlineTime) {
                                  const [hh, mm] = extendDeadlineTime.split(":").map(Number);
                                  const d = new Date(extendDeadline);
                                  d.setHours(hh, mm, 0, 0);
                                  finalDeadline = d.getTime();
                                }
                                await extendTaskDeadline({ taskId: ot._id as Id<"tasks">, newDeadline: finalDeadline });
                                setExtendingTaskId(null);
                                setExtendDeadline(undefined);
                                setExtendDeadlineTime("");
                              }}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin)] hover:opacity-90 transition-opacity"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setExtendingTaskId(null); setExtendDeadline(undefined); setExtendDeadlineTime(""); }}
                              className="px-2 py-1.5 rounded-lg text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setExtendingTaskId(ot._id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--accent-admin)] border border-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-colors"
                          >
                            <CalendarClock className="h-3 w-3" />
                            Extend Deadline
                          </button>
                        )}
                        {resolvingTaskId !== ot._id && (
                          <button
                            onClick={() => setResolvingTaskId(ot._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 transition-colors ml-auto"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {resolvingTaskId === ot._id && (
                    <div className="mt-2 p-2.5 rounded-lg bg-gray-50 border border-[var(--border-subtle)]">
                      <p className="text-[12px] font-medium text-[var(--text-primary)] mb-2">
                        {ot.alertType === "unassigned" ? "Delete this brief and all its data?" : "Is this task already done?"}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (ot.alertType === "unassigned") {
                              await deleteBrief({ briefId: ot.briefId as Id<"briefs"> });
                            } else {
                              await deleteTask({ taskId: ot._id as Id<"tasks"> });
                            }
                            setResolvingTaskId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => {
                            if (ot.briefType === "content_calendar" && ot.brandId) {
                              router.push(`/content-calendar?brand=${ot.brandId}`);
                            } else {
                              router.push(`/brief/${ot.briefId}`);
                            }
                            setResolvingTaskId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--accent-admin)] border border-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-colors"
                        >
                          No, Continue
                        </button>
                        <button
                          onClick={() => setResolvingTaskId(null)}
                          className="px-2 py-1.5 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Action Needed Grid */}
        {(actionNeededTasks ?? []).length > 0 && (
          <div className="mb-6 sm:mb-8">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Action Needed ({actionNeededTasks!.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {actionNeededTasks!.map((t: any) => {
                const borderColor =
                  t.category === "neither"
                    ? "border-l-red-500"
                    : t.category === "no_assignee"
                      ? "border-l-amber-500"
                      : "border-l-blue-500";
                const label =
                  t.category === "neither"
                    ? "No Assignee & No Deadline"
                    : t.category === "no_assignee"
                      ? "No Assignee"
                      : "No Deadline";
                const labelColor =
                  t.category === "neither"
                    ? "text-red-600 bg-red-50"
                    : t.category === "no_assignee"
                      ? "text-amber-600 bg-amber-50"
                      : "text-blue-600 bg-blue-50";
                const IconComp = t.category === "no_deadline" ? CalendarOff : UserX;

                return (
                  <Card key={t._id} className={`p-4 border-l-4 ${borderColor}`}>
                    <div className="flex items-start gap-2 mb-2">
                      <IconComp className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-muted)]" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                          {t.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {t.briefTitle} &middot; {t.brandName}
                        </p>
                      </div>
                    </div>
                    {t.briefType === "content_calendar" && (
                      <p className="text-[10px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" /> Content Calendar
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${labelColor}`}>
                        {label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            if (t.briefType === "content_calendar" && t.brandId) {
                              router.push(`/content-calendar?brand=${t.brandId}`);
                            } else {
                              router.push(`/brief/${t.briefId}`);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white bg-[var(--accent-admin)] hover:opacity-90 transition-opacity"
                        >
                          {t.briefType === "content_calendar" ? "Open Calendar" : "Take Action"}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                        {resolvingTaskId !== t._id && (
                          <button
                            onClick={() => setResolvingTaskId(t._id)}
                            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {resolvingTaskId === t._id && (
                      <div className="mt-2 p-2.5 rounded-lg bg-gray-50 border border-[var(--border-subtle)]">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] mb-2">Is this task already done?</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              await deleteTask({ taskId: t._id as Id<"tasks"> });
                              setResolvingTaskId(null);
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => {
                              if (t.briefType === "content_calendar" && t.brandId) {
                                router.push(`/content-calendar?brand=${t.brandId}`);
                              } else {
                                router.push(`/brief/${t.briefId}`);
                              }
                              setResolvingTaskId(null);
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--accent-admin)] border border-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-colors"
                          >
                            No, Continue
                          </button>
                          <button
                            onClick={() => setResolvingTaskId(null)}
                            className="px-2 py-1.5 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* My Tasks (for admins who have tasks assigned) */}
        {adminActiveTasks.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <h2 className="font-semibold text-[14px] text-[var(--text-secondary)] mb-3">
              My Tasks ({adminActiveTasks.length})
            </h2>
            <div className="flex flex-col gap-2">
              {adminActiveTasks.map((task) => {
                const sc: Record<string, { color: string; bg: string }> = {
                  "pending": { color: "var(--text-muted)", bg: "var(--bg-hover)" },
                  "in-progress": { color: "#3B82F6", bg: "#EFF6FF" },
                  "review": { color: "#F59E0B", bg: "#FFFBEB" },
                };
                const s = sc[task.status] ?? sc.pending;
                const isSubTask = !!(task as any).parentTaskId;
                return (
                  <Card
                    key={task._id}
                    hover
                    onClick={() => setAdminSelectedTaskId(task._id)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isSubTask && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                              HELPER
                            </span>
                          )}
                          {(task as any).deadlineExtended && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-50 text-yellow-700 shrink-0">
                              EXTENDED
                            </span>
                          )}
                          {(task as any).briefStatus === "on_hold" && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              ⏸ ON HOLD
                            </span>
                          )}
                          <h3 className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                            {task.title}
                          </h3>
                        </div>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                          {task.briefName}{task.deadline ? ` · Due ${new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                        </p>
                      </div>
                      <span
                        className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium"
                        style={{ color: s.color, backgroundColor: s.bg }}
                      >
                        {task.status}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Activity Feed */}
        <Card className="mb-6 sm:mb-8 p-4">
          <h3 className="font-semibold text-[13px] text-[var(--text-secondary)] uppercase tracking-wide mb-3">
            Recent Activity
          </h3>
          <ActivityFeed />
        </Card>

        {/* Team Lead Overview */}
        {((teamLeadOverview ?? []).length > 0 || (pendingApprovalCount ?? 0) > 0) && (
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[14px] text-[var(--text-secondary)]">
                My Teams
              </h2>
              {(pendingApprovalCount ?? 0) > 0 && (
                <button
                  onClick={() => router.push("/deliverables")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  <ClipboardCheck className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[12px] font-semibold text-amber-700">
                    {pendingApprovalCount} Approval{pendingApprovalCount !== 1 ? "s" : ""} Pending
                  </span>
                  <ArrowRight className="h-3 w-3 text-amber-500" />
                </button>
              )}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
              {(teamLeadOverview ?? []).map((teamData: any) => {
                const isExpanded = expandedTeams.has(teamData.team._id);
                const totalTasks = teamData.members.reduce(
                  (acc: number, m: any) => acc + m.briefs.reduce((a: number, b: any) => a + (b.taskCount ?? 0), 0), 0
                );
                const doneTasks = teamData.members.reduce(
                  (acc: number, m: any) => acc + m.briefs.reduce((a: number, b: any) => a + (b.doneCount ?? 0), 0), 0
                );
                const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

                return (
                  <Card key={teamData.team._id} className="p-0 overflow-hidden min-w-[350px] snap-start shrink-0">
                    <div
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                      style={{ borderLeft: `4px solid ${teamData.team.color}` }}
                      onClick={() => toggleTeam(teamData.team._id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      )}
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: teamData.team.color }}
                      />
                      <h3 className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">
                        {teamData.team.name}
                      </h3>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--accent-employee)]"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                            {doneTasks}/{totalTasks}
                          </span>
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {teamData.members.length} member{teamData.members.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[var(--border)]">
                        {teamData.members.map((memberData: any, midx: number) => {
                          const memberDone = memberData.briefs.reduce((a: number, b: any) => a + (b.doneCount ?? 0), 0);
                          const memberTotal = memberData.briefs.reduce((a: number, b: any) => a + (b.taskCount ?? 0), 0);
                          const memberPct = memberTotal > 0 ? Math.round((memberDone / memberTotal) * 100) : 0;

                          return (
                            <div
                              key={memberData.user._id}
                              className={`px-4 py-3 ${midx !== teamData.members.length - 1 ? "border-b border-[var(--border-subtle)]" : ""}`}
                            >
                              <div className="flex items-center gap-2.5 mb-2">
                                {memberData.user.avatarUrl ? (
                                  <img src={memberData.user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-[var(--accent-employee-dim)] flex items-center justify-center text-[10px] font-bold text-[var(--accent-employee)]">
                                    {(memberData.user.name ?? memberData.user.email ?? "?").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-[13px] text-[var(--text-primary)]">
                                      {memberData.user.name ?? memberData.user.email}
                                    </span>
                                    {memberData.user.designation && (
                                      <span className="text-[10px] text-[var(--text-muted)]">{memberData.user.designation}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <div className="w-20 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                                      <div className="h-full rounded-full bg-[var(--accent-employee)]" style={{ width: `${memberPct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                                      {memberDone}/{memberTotal} tasks
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 ml-9">
                                {memberData.briefs.map((briefInfo: any) => (
                                  <button
                                    key={briefInfo._id}
                                    onClick={() => router.push(`/brief/${briefInfo._id}`)}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-[var(--bg-hover)] hover:bg-[var(--border)] transition-colors text-left"
                                  >
                                    <span className="font-medium text-[var(--text-primary)] truncate max-w-[160px]">
                                      {briefInfo.title}
                                    </span>
                                    <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                                      {briefInfo.doneCount}/{briefInfo.taskCount}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin Task Detail Modal */}
        {adminSelectedTaskId && (
          <TaskDetailModal
            taskId={adminSelectedTaskId}
            onClose={() => setAdminSelectedTaskId(null)}
          />
        )}

      </div>
    );
  }

  // ═══════════════════════════════════════════
  // EMPLOYEE DASHBOARD
  // ═══════════════════════════════════════════
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const overdueStatus = useQuery(api.tasks.getOverdueHaltStatus);
  const contactManager = useMutation(api.tasks.contactManagerForOverdue);
  const [justContactedTasks, setJustContactedTasks] = useState<Set<string>>(new Set());

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    "pending": { color: "var(--text-muted)", bg: "var(--bg-hover)" },
    "in-progress": { color: "#3B82F6", bg: "#EFF6FF" },
    "review": { color: "#F59E0B", bg: "#FFFBEB" },
    "done": { color: "var(--accent-employee)", bg: "var(--accent-employee-dim)" },
  };

  const isHalted = overdueStatus && overdueStatus.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 relative">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
          {greeting}, {displayName}
        </h1>
        <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
          Here are your active tasks &mdash; click a task for details
        </p>
      </div>

      {/* Reminders Section */}
      {isHalted && (
        <div className="mb-6">
          <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Reminders ({overdueStatus.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdueStatus.map((ot) => {
              const isContacted = ot.overdueContacted || justContactedTasks.has(ot._id);
              return (
                <Card key={ot._id} className="p-4 border-l-4 border-l-red-500">
                  <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">{ot.title}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {ot.briefTitle} &middot; Deadline was {new Date(ot.deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border-subtle)]">
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Manager: <span className="font-semibold">{ot.managerName}</span>
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          await contactManager({ taskId: ot._id as Id<"tasks"> });
                          setJustContactedTasks((prev) => new Set(prev).add(ot._id));
                        } catch {}
                      }}
                      disabled={isContacted}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--accent-admin)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Phone className="h-3 w-3" />
                      {isContacted ? "Contacted" : "Contact Manager"}
                    </button>
                  </div>
                  {isContacted && (
                    <p className="text-[10px] text-amber-700 mt-2 bg-amber-50 rounded px-2 py-1">
                      Waiting for the brand manager to confirm.
                    </p>
                  )}
                  {!isContacted && ot.overdueContactDenied && (
                    <p className="text-[10px] text-red-700 mt-2 bg-red-100 rounded px-2 py-1">
                      It seems you still have not had the meeting with the brand manager. Please contact them regarding this overdue task.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(tasks ?? []).map((task) => {
          const sc = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;
          return (
            <Card
              key={task._id}
              className={task.status === "done" ? "opacity-60" : ""}
              accent={task.status === "done" ? "employee" : undefined}
              onClick={() => setSelectedTaskId(task._id)}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {!!(task as any).parentTaskId && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                        HELPER
                      </span>
                    )}
                    {(task as any).deadlineExtended && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-50 text-yellow-700 shrink-0">
                        EXTENDED
                      </span>
                    )}
                    {(task as any).briefStatus === "on_hold" && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                        ⏸ ON HOLD
                      </span>
                    )}
                    <h3 className="font-semibold text-[13px] sm:text-[14px] text-[var(--text-primary)]">
                      {task.title}
                    </h3>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                    {task.briefName}{task.deadline ? ` · Due ${new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
                  </p>
                </div>
                <span
                  className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium"
                  style={{ color: sc.color, backgroundColor: sc.bg }}
                >
                  {task.status}
                </span>
              </div>
            </Card>
          );
        })}
        {(tasks ?? []).length === 0 && (
          <Card>
            <p className="text-[13px] text-[var(--text-muted)] text-center py-4">
              No tasks assigned to you yet.
            </p>
          </Card>
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
