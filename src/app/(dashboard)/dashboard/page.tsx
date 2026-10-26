"use client";

import { useQuery, useMutation } from "convex/react";
import { useUpdateTaskStatus } from "@/lib/useUpdateTaskStatus";
import { NewSelfTaskModal } from "@/components/NewSelfTaskModal";
import { isTaskOverdue } from "@/lib/status";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, EmptyState, PageHeader, SectionHeader, SegmentedTabs, StatTile, TaskDetailModal, DatePicker, Skeleton, useCelebrate, useToast } from "@/components/ui";
import { TodayList } from "@/components/dashboard/TodayList";
import { X, BarChart3, ArrowRight, ChevronDown, ChevronRight, ClipboardCheck, Briefcase, AlertTriangle, Phone, Clock, Play, CalendarClock, Info, UserX, CalendarOff, Trash2, Calendar, LayoutGrid, List as ListIcon, ListChecks, Layers, Users, Inbox, CheckCircle2, Plus, type LucideIcon } from "lucide-react";

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
            <p className="text-[11px] text-[var(--text-muted)]">
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

// ═══════════════════════════════════════════
// EMPLOYEE TASK VIEWS (Kanban + Tabbed List)
// ═══════════════════════════════════════════
type EmployeeTask = {
  _id: string;
  title: string;
  briefName?: string;
  description?: string;
  status: string;
  deadline?: number;
};

const EMPLOYEE_STATUSES: Array<{ key: string; label: string; color: string; bg: string; dot: string }> = [
  { key: "pending", label: "Pending", color: "var(--text-muted)", bg: "var(--bg-hover)", dot: "#9CA3AF" },
  { key: "in-progress", label: "In Progress", color: "#3B82F6", bg: "#EFF6FF", dot: "#3B82F6" },
  { key: "review", label: "Review", color: "#F59E0B", bg: "#FFFBEB", dot: "#F59E0B" },
  { key: "done", label: "Done", color: "var(--accent-employee)", bg: "var(--accent-employee-dim)", dot: "#10B981" },
];

const VIEW_STORAGE_KEY = "employeeQueueView";
const TAB_STORAGE_KEY = "employeeQueueTab";

function EmployeeTaskCard({
  task,
  onSelect,
  onStart,
  isStarting,
  statusColors,
  compact = false,
}: {
  task: EmployeeTask;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  isStarting: boolean;
  statusColors: Record<string, { color: string; bg: string }>;
  compact?: boolean;
}) {
  const sc = statusColors[task.status] ?? statusColors.pending;
  const t = task as EmployeeTask & {
    parentTaskId?: string;
    isHelper?: boolean;
    parentTaskTitle?: string | null;
    brandName?: string | null;
    brandColor?: string | null;
    deadlineExtended?: boolean;
    briefStatus?: string;
    briefDescription?: string;
  };
  // A task inside an on-hold brief is frozen — the server rejects starting it.
  const isOnHold = t.briefStatus === "on_hold";

  return (
    <Card
      className={task.status === "done" ? "opacity-60" : ""}
      accent={task.status === "done" ? "employee" : undefined}
      onClick={() => onSelect(task._id)}
    >
      <div className={compact ? "flex flex-col gap-2" : "flex justify-between items-start gap-2"}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {!!t.isHelper && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                HELPER
              </span>
            )}
            {isTaskOverdue(task) && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-[var(--danger)] shrink-0">
                OVERDUE
              </span>
            )}
            {t.deadlineExtended && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-yellow-50 text-yellow-700 shrink-0">
                EXTENDED
              </span>
            )}
            {t.briefStatus === "on_hold" && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                ⏸ ON HOLD
              </span>
            )}
            {(task as any).creativesRequired > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 shrink-0"
                title={`${(task as any).creativesRequired} creative deliverables required`}
              >
                {(task as any).creativesRequired} CREATIVES REQUIRED
              </span>
            )}
            <h3 className="font-semibold text-[13px] sm:text-[15px] text-[var(--text-primary)]">
              {task.title}
            </h3>
          </div>
          {/* Sub-tasks are meaningless without their master task — name it. */}
          {t.parentTaskTitle && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
              ↳ {t.parentTaskTitle}
            </p>
          )}
          <p className="text-[12px] text-[var(--text-secondary)] mt-1 flex items-center gap-1.5 flex-wrap">
            {t.brandName && (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: t.brandColor ?? "#9CA3AF" }}
                />
                {t.brandName}
              </span>
            )}
            <span>
              {t.brandName && task.briefName ? "· " : ""}
              {task.briefName}
              {task.deadline
                ? ` · Due ${new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`
                : ""}
            </span>
          </p>
          {(task.description || t.briefDescription) && (
            <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">
              {task.description || t.briefDescription}
            </p>
          )}
        </div>
        {task.status === "pending" && !isOnHold ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStart(task._id);
            }}
            disabled={isStarting}
            className={`${compact ? "self-start" : "shrink-0"} inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-60`}
          >
            {isStarting ? <Clock className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Start
          </button>
        ) : (
          <span
            className={`${compact ? "self-start" : "shrink-0"} inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium`}
            style={{ color: sc.color, backgroundColor: sc.bg }}
          >
            {task.status}
          </span>
        )}
      </div>
    </Card>
  );
}

function EmployeeTaskViews({
  tasks,
  onSelectTask,
  onStartTask,
  startingTaskId,
  statusColors,
}: {
  tasks: EmployeeTask[];
  onSelectTask: (id: string) => void;
  onStartTask: (id: string) => void;
  startingTaskId: string | null;
  statusColors: Record<string, { color: string; bg: string }>;
}) {
  type ViewState = {
    viewMode: "kanban" | "list";
    activeTab: string;
    hydrated: boolean;
  };
  const [state, setState] = useState<ViewState>({
    viewMode: "kanban",
    activeTab: "in-progress",
    hydrated: false,
  });
  const { viewMode, activeTab, hydrated } = state;

  // Hydrate preferences from localStorage on mount (single state update, SSR-safe)
  useEffect(() => {
    let nextView: ViewState["viewMode"] = "kanban";
    let nextTab = "in-progress";
    try {
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
      if (savedView === "kanban" || savedView === "list") nextView = savedView;
      const savedTab = localStorage.getItem(TAB_STORAGE_KEY);
      if (savedTab && EMPLOYEE_STATUSES.some((s) => s.key === savedTab)) nextTab = savedTab;
    } catch {
      // localStorage may be unavailable (private mode). Ignore.
    }
    setState({ viewMode: nextView, activeTab: nextTab, hydrated: true });
  }, []);

  const setViewMode = (next: ViewState["viewMode"]) => {
    setState((prev) => ({ ...prev, viewMode: next }));
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {}
  };
  const setActiveTab = (next: string) => {
    setState((prev) => ({ ...prev, activeTab: next }));
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {}
  };
  void hydrated; // hydrated is reserved for future SSR flicker suppression if needed

  const [showOnHold, setShowOnHold] = useState(false);

  // Tasks whose brief is on hold are parked: they must not sit in the working
  // columns inviting someone to start them (the server rejects it anyway).
  const onHoldTasks = tasks.filter(
    (t) => (t as EmployeeTask & { briefStatus?: string }).briefStatus === "on_hold"
  );
  const activeTasks = tasks.filter(
    (t) => (t as EmployeeTask & { briefStatus?: string }).briefStatus !== "on_hold"
  );

  // Queue-to-zero: the third earned moment. Fires on the TRANSITION to empty,
  // never on arriving at an already-empty queue — otherwise it greets you every
  // morning and stops meaning anything. The ref starts null so the first render
  // (whatever the count) can't trigger it.
  const { celebrate } = useCelebrate();
  const prevOpenCount = useRef<number | null>(null);
  const openCount = activeTasks.filter((t) => t.status !== "done").length;
  useEffect(() => {
    const prev = prevOpenCount.current;
    if (prev !== null && prev > 0 && openCount === 0) {
      celebrate("Queue clear", "Nothing left on your plate. Well done.");
    }
    prevOpenCount.current = openCount;
  }, [openCount, celebrate]);

  // Group tasks by status
  const grouped: Record<string, EmployeeTask[]> = {
    pending: [],
    "in-progress": [],
    review: [],
    done: [],
  };
  for (const task of activeTasks) {
    if (grouped[task.status]) grouped[task.status].push(task);
    else grouped.pending.push(task);
  }

  // Sort each column newest-first. Falls back gracefully when a date field
  // is missing so brand-new tasks (no assignedAt yet) still rank near the top.
  const dateKey = (t: EmployeeTask) => {
    const tt = t as EmployeeTask & {
      completedAt?: number;
      submittedForReviewAt?: number;
      assignedAt?: number;
      _creationTime?: number;
    };
    return (
      tt.completedAt ??
      tt.submittedForReviewAt ??
      tt.assignedAt ??
      t.deadline ??
      tt._creationTime ??
      0
    );
  };
  for (const status of Object.keys(grouped)) {
    grouped[status].sort((a, b) => dateKey(b) - dateKey(a));
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListIcon}
        title="No tasks assigned to you yet"
        description="New tasks appear here as soon as someone assigns them to you."
      />
    );
  }

  const onHoldSection =
    onHoldTasks.length === 0 ? null : (
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
        <button
          onClick={() => setShowOnHold((v) => !v)}
          aria-expanded={showOnHold}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-amber-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            {showOnHold ? (
              <ChevronDown className="h-3.5 w-3.5 text-amber-700" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-amber-700" />
            )}
            <span className="font-semibold text-[12px] text-amber-800 uppercase tracking-wide">
              ⏸ On Hold
            </span>
            <span className="text-[11px] text-amber-700">
              Brief paused — no action needed
            </span>
          </span>
          <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full bg-white border border-amber-200 text-[11px] font-semibold text-amber-800 tabular-nums">
            {onHoldTasks.length}
          </span>
        </button>
        {showOnHold && (
          <div className="flex flex-col gap-2 p-2 border-t border-amber-200">
            {onHoldTasks.map((task) => (
              <EmployeeTaskCard
                key={task._id}
                task={task}
                onSelect={onSelectTask}
                onStart={onStartTask}
                isStarting={startingTaskId === task._id}
                statusColors={statusColors}
              />
            ))}
          </div>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* View Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] text-[var(--text-muted)] tabular-nums">
          {activeTasks.length} task{activeTasks.length !== 1 ? "s" : ""}
        </div>
        <SegmentedTabs
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: "kanban", label: "Kanban", icon: LayoutGrid },
            { value: "list", label: "List", icon: ListIcon },
          ]}
        />
      </div>

      {viewMode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
          {EMPLOYEE_STATUSES.map((col) => {
            const colTasks = grouped[col.key] ?? [];
            return (
              <div
                key={col.key}
                className="flex flex-col min-w-[280px] sm:min-w-0 snap-start rounded-xl bg-[var(--bg-hover)] border border-[var(--border-subtle)]"
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-hover)] rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: col.dot }}
                    />
                    <span className="font-semibold text-[12px] text-[var(--text-primary)] uppercase tracking-wide">
                      {col.label}
                    </span>
                  </div>
                  <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full bg-white border border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2 min-h-[80px] max-h-[70vh] overflow-y-auto">
                  {colTasks.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)] text-center py-6 italic">
                      No tasks
                    </p>
                  ) : (
                    colTasks.map((task) => (
                      <EmployeeTaskCard
                        key={task._id}
                        task={task}
                        onSelect={onSelectTask}
                        onStart={onStartTask}
                        isStarting={startingTaskId === task._id}
                        statusColors={statusColors}
                        compact
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
            {EMPLOYEE_STATUSES.map((tab) => {
              const count = (grouped[tab.key] ?? []).length;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-[var(--accent-employee)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: tab.dot }}
                  />
                  {tab.label}
                  <span
                    className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums ${
                      isActive
                        ? "bg-[var(--accent-employee-dim)] text-[var(--accent-employee-text)]"
                        : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab Panel */}
          <div className="flex flex-col gap-3">
            {(grouped[activeTab] ?? []).length === 0 ? (
              <Card>
                <p className="text-[13px] text-[var(--text-muted)] text-center py-4">
                  No {EMPLOYEE_STATUSES.find((s) => s.key === activeTab)?.label.toLowerCase()} tasks.
                </p>
              </Card>
            ) : (
              (grouped[activeTab] ?? []).map((task) => (
                <EmployeeTaskCard
                  key={task._id}
                  task={task}
                  onSelect={onSelectTask}
                  onStart={onStartTask}
                  isStarting={startingTaskId === task._id}
                  statusColors={statusColors}
                />
              ))
            )}
          </div>
        </div>
      )}

      {onHoldSection}
    </div>
  );
}

function useDashboardBase() {
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
  return { router, user, briefs, tasks, allUsers, role, activeBriefs, displayName, greeting };
}

export default function DashboardPage() {
  const user = useQuery(api.users.getCurrentUser);
  // Two components, not an `if` around hooks: a role change then remounts
  // instead of changing the hook count mid-render.
  return user?.role === "admin" ? <AdminDashboard /> : <EmployeeDashboard />;
}

// ═══════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════
function AdminDashboard() {
  const { router, user, briefs, tasks, allUsers, displayName, greeting } = useDashboardBase();
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
  const pendingClientRequests = useQuery(api.jsr.listPendingClientRequests, {});
  const adminOverdueHalt = useQuery(api.tasks.getOverdueHaltStatus);
  const myWork = useQuery(api.tasks.listMyWork);
  const resumeOverdueTask = useMutation(api.tasks.resumeOverdueTask);
  const extendTaskDeadline = useMutation(api.tasks.extendTaskDeadline);
  const confirmOverdueContact = useMutation(api.tasks.confirmOverdueContact);
  const adminContactManager = useMutation(api.tasks.contactManagerForOverdue);
  const { toast: adminToast } = useToast();
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
  const weekAgo = Date.now() - 7 * 86_400_000;
  const newBriefsThisWeek = scopedBriefs.filter(
    (b) => b._creationTime > weekAgo && !["archived", "completed"].includes(b.status)
  ).length;

  // ── Hero digest + attention strip (derived from queries above only) ──
  const firstName = displayName.split(" ")[0];
  const todayLine = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
  const dueTodayCount = adminActiveTasks.filter(
    (t) => t.deadline && t.deadline >= dayStart.getTime() && t.deadline < dayEnd
  ).length;
  const overdueCount = (overdueTasksForManager ?? []).length;
  const pendingRequests = (pendingClientRequests ?? []).filter(
    (r) => r.status === "pending_review"
  );
  const heroLoaded =
    tasks !== undefined &&
    overdueTasksForManager !== undefined &&
    pendingClientRequests !== undefined;
  const digestSegments: { label: string; href: string }[] = [];
  if (dueTodayCount > 0)
    digestSegments.push({
      label: `${dueTodayCount} task${dueTodayCount !== 1 ? "s" : ""} due today`,
      href: "/my-tasks",
    });
  if (overdueCount > 0)
    digestSegments.push({ label: `${overdueCount} overdue`, href: "/worklog" });
  if (pendingRequests.length > 0)
    digestSegments.push({
      label: `${pendingRequests.length} client request${pendingRequests.length !== 1 ? "s" : ""} waiting`,
      href: "/client-requests",
    });

  type AttentionRow = {
    key: string;
    icon: LucideIcon;
    iconClass: string;
    title: string;
    context: string;
    href: string;
    /** Inline action next to the row (e.g. Contact manager). */
    action?: React.ReactNode;
  };
  const attentionLoaded =
    adminOverdueHalt !== undefined &&
    overdueTasksForManager !== undefined &&
    actionNeededTasks !== undefined &&
    pendingClientRequests !== undefined;
  const needsReview = myWork?.counts.needsReview ?? 0;
  const attentionRows: AttentionRow[] = [
    // Your own overdue work first: it needs you, not someone you manage.
    ...(adminOverdueHalt ?? []).map((ot): AttentionRow => {
      const contacted = ot.overdueContacted || adminContactedTasks.has(ot._id);
      return {
        key: `mine-${ot._id}`,
        icon: AlertTriangle,
        iconClass: "text-red-500",
        title: ot.title,
        context: `Your task · ${ot.briefTitle} · was due ${new Date(ot.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}${contacted ? " · waiting on " + ot.managerName : ""}`,
        href: `/brief/${ot.briefId}`,
        action: contacted ? undefined : (
          <button
            onClick={async () => {
              try {
                await adminContactManager({ taskId: ot._id as Id<"tasks"> });
                setAdminContactedTasks((prev) => new Set(prev).add(ot._id));
                adminToast("success", `${ot.managerName} has been asked to follow up`);
              } catch (err) {
                adminToast("error", err instanceof Error ? err.message : "Couldn't contact the manager");
              }
            }}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <Phone className="h-3 w-3" /> Contact {ot.managerName.split(" ")[0]}
          </button>
        ),
      };
    }),
    ...(needsReview > 0
      ? [{
          key: "review-queue",
          icon: ClipboardCheck,
          iconClass: "text-[var(--accent-manager-text)]",
          title: `${needsReview} deliverable${needsReview !== 1 ? "s" : ""} waiting on your review`,
          context: "Approve or send back so work keeps moving",
          href: "/deliverables",
        } as AttentionRow]
      : []),
    // Then overdue work across your team, action-needed, and client requests
    ...(overdueTasksForManager ?? []).map((ot: any): AttentionRow => ({
      key: `overdue-${ot._id}`,
      icon: AlertTriangle,
      iconClass: "text-red-500",
      title: ot.title,
      context:
        ot.alertType === "unassigned"
          ? "No one assigned · Overdue"
          : `${ot.briefTitle} · ${ot.assigneeName} · Overdue`,
      href:
        ot.briefType === "content_calendar" && ot.brandId
          ? `/content-calendar?brand=${ot.brandId}`
          : `/brief/${ot.briefId}`,
    })),
    ...(actionNeededTasks ?? []).map((t: any): AttentionRow => ({
      key: `action-${t._id}`,
      icon: t.category === "no_deadline" ? CalendarOff : UserX,
      iconClass: "text-amber-500",
      title: t.title,
      context: `${t.briefTitle} · ${t.brandName}`,
      href:
        t.briefType === "content_calendar" && t.brandId
          ? `/content-calendar?brand=${t.brandId}`
          : `/brief/${t.briefId}`,
    })),
    ...pendingRequests.map((r): AttentionRow => ({
      key: `request-${r._id}`,
      icon: Inbox,
      iconClass: "text-[var(--accent-admin-text)]",
      title: r.title,
      context: `${r.brandName} · Client request`,
      href: "/client-requests",
    })),
  ];
  const attentionTotal = attentionRows.length;
  const attentionVisible = attentionRows.slice(0, 6);

  function toggleTeam(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 relative">
      {/* Header: one tight row — greeting + today's digest, brand shortcut */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {todayLine}
          </p>
          <h1 className="font-semibold text-[26px] text-[var(--text-primary)] tracking-tight leading-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {!heroLoaded ? (
              <span className="text-[var(--text-muted)]">Pulling up your day…</span>
            ) : digestSegments.length === 0 ? (
              <span>All caught up. Nothing urgent on your plate.</span>
            ) : (
              digestSegments.map((seg, i) => (
                <span key={seg.href}>
                  {i > 0 && <span className="mx-1.5 text-[var(--text-muted)]">·</span>}
                  <Link
                    href={seg.href}
                    className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-admin-text)] hover:underline underline-offset-2 transition-colors"
                  >
                    {seg.label}
                  </Link>
                </span>
              ))
            )}
          </p>
        </div>
        {(myBrandIds ?? []).length > 0 && (
          <button
            onClick={() => router.push("/brands-overview?filter=mine")}
            className="shrink-0 self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[var(--text-primary)] text-white text-[13px] font-medium hover:bg-[#2a2a2a] transition-colors"
          >
            <Briefcase className="h-4 w-4" />
            My Brands
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Numbers that go somewhere */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatTile
          label="Active briefs"
          value={scopedActiveBriefs}
          hint={newBriefsThisWeek > 0 ? `+${newBriefsThisWeek} new this week` : "None new this week"}
          hintTone={newBriefsThisWeek > 0 ? "good" : "muted"}
          href="/briefs"
          icon={Briefcase}
        />
        <StatTile
          label="Open tasks"
          value={scopedOpenTasks}
          hint={overdueCount > 0 ? `${overdueCount} overdue` : "Nothing overdue"}
          hintTone={overdueCount > 0 ? "bad" : "good"}
          href="/worklog"
          icon={ListChecks}
        />
        <StatTile
          label="Client requests"
          value={pendingRequests.length}
          hint={pendingRequests.length > 0 ? "Waiting for review" : "Queue is clear"}
          hintTone={pendingRequests.length > 0 ? "bad" : "good"}
          href="/client-requests"
          icon={Inbox}
        />
        <StatTile
          label={isSuperAdmin ? "Teams" : "My brands"}
          value={isSuperAdmin ? (teams?.length ?? 0) : myBrandIdSet.size}
          hint={`${employeeCount} people`}
          href={isSuperAdmin ? "/users?tab=teams" : "/brands-overview?filter=mine"}
          icon={isSuperAdmin ? Layers : Users}
        />
      </div>

      {/* Needs attention — the page's lead. Everything below it is reference;
          this is the only block that asks the reader to DO something, so it
          carries the largest heading, the tinted surface and the room. */}
      <div className="mb-8 sm:mb-10">
        <SectionHeader title="Needs attention" count={attentionLoaded ? attentionTotal : undefined} tone="danger" />
        {!attentionLoaded ? (
          <div className="rounded-lg border border-[var(--border)] bg-white p-5 flex flex-col gap-3">
            <Skeleton className="h-[13px] w-[60%]" />
            <Skeleton className="h-[13px] w-[45%]" />
            <Skeleton className="h-[13px] w-[52%]" />
          </div>
        ) : attentionTotal === 0 ? (
          <div className="rounded-lg border border-[var(--accent-employee)]/25 bg-[var(--accent-employee-dim)] px-5 py-6">
            <p className="text-[15px] font-medium text-[var(--text-primary)] flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-[var(--accent-employee-text)] shrink-0" />
              All clear. Nothing needs your attention.
            </p>
            <p className="mt-1 ml-[30px] text-[13px] text-[var(--text-secondary)]">
              Everything overdue, waiting on review, or sitting in the client
              queue has been dealt with.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--danger)]/25 bg-white overflow-hidden shadow-sm">
            <div className="divide-y divide-[var(--border-subtle)]">
              {attentionVisible.map((row) => {
                const RowIcon = row.icon;
                return (
                  <div key={row.key} className="flex items-center gap-2 pr-4 hover:bg-[var(--bg-hover)] transition-colors">
                  <Link
                    href={row.href}
                    // The whole row is the target, not a 40px "View" link at
                    // the end of it — this is the thing you're here to click.
                    className="group flex-1 min-w-0 flex items-center gap-3.5 pl-5 pr-1 py-3.5"
                  >
                    <RowIcon className={`h-4 w-4 shrink-0 ${row.iconClass}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-[var(--text-primary)] truncate">
                        {row.title}
                      </p>
                      <p className="text-[12px] text-[var(--text-secondary)] truncate">
                        {row.context}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--accent-admin-text)] group-hover:translate-x-0.5 transition-all" />
                  </Link>
                  {row.action}
                  </div>
                );
              })}
              {attentionTotal > attentionVisible.length && (
                <p className="px-5 py-2.5 text-[12px] text-[var(--text-muted)]">
                  +{attentionTotal - attentionVisible.length} more in the sections below
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <TodayList tasks={tasks as any} onOpen={(id) => setAdminSelectedTaskId(id)} />

      {/* Client Approval Status */}
      {clientApprovalCounts && (clientApprovalCounts.approved > 0 || clientApprovalCounts.pendingClient > 0 || clientApprovalCounts.changesRequested > 0 || clientApprovalCounts.denied > 0) && (
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
              Client Approvals{" "}
              <span className="font-normal text-[var(--text-muted)] tabular-nums">
                ({clientApprovalCounts.pendingClient + clientApprovalCounts.approved + clientApprovalCounts.changesRequested + clientApprovalCounts.denied})
              </span>
            </h2>
            <Link
              href="/deliverables"
              className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
            >
              View all →
            </Link>
          </div>
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

      {/* Overdue Tasks Section */}
      {(overdueTasksForManager ?? []).length > 0 && (
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Overdue Alerts{" "}
              <span className="font-normal text-[var(--text-muted)] tabular-nums">
                ({overdueTasksForManager!.length})
              </span>
            </h2>
            <Link
              href="/worklog"
              className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
            >
              View all →
            </Link>
          </div>
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
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-yellow-50 text-yellow-700 mt-1">
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
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
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
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin-strong)] hover:opacity-90 transition-opacity"
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--accent-admin-text)] border border-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-colors"
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
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--accent-admin-text)] border border-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-colors"
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
            Action Needed{" "}
            <span className="font-normal text-[var(--text-muted)] tabular-nums">
              ({actionNeededTasks!.length})
            </span>
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
                    <p className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" /> Content Calendar
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${labelColor}`}>
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white bg-[var(--accent-admin-strong)] hover:opacity-90 transition-opacity"
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
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--accent-admin-text)] border border-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-colors"
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

      {/* My Tasks moved to its own page (/my-tasks) */}
      {(() => {
        const mine = myWork?.counts.assignedToMeOpen ?? 0;
        const supervising = myWork?.counts.supervisingOpen ?? 0;
        if (mine === 0 && supervising === 0) return null;
        return (
          <Card
            hover
            onClick={() => router.push("/my-tasks")}
            className="mb-6 sm:mb-8 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
                  My Tasks
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-[12px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                      {mine}
                    </span>{" "}
                    your task{mine !== 1 ? "s" : ""}
                  </span>
                  <span className="h-3 w-px bg-[var(--border)]" aria-hidden />
                  <span className="text-[12px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                      {supervising}
                    </span>{" "}
                    supervising
                  </span>
                  {(myWork?.counts.needsReview ?? 0) > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">
                      {myWork!.counts.needsReview} awaiting your review
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin-strong)]">
                Open My Tasks
              </span>
            </div>
          </Card>
        );
      })()}

      {/* Team Lead Overview */}
      {((teamLeadOverview ?? []).length > 0 || (pendingApprovalCount ?? 0) > 0) && (
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
              My Teams{" "}
              <span className="font-normal text-[var(--text-muted)] tabular-nums">
                ({(teamLeadOverview ?? []).length})
              </span>
            </h2>
            <div className="flex items-center gap-3">
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
              <Link
                href="/teams"
                className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
              >
                View all →
              </Link>
            </div>
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
                    <h3 className="font-semibold text-[15px] text-[var(--text-primary)] flex-1">
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
                        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
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
                                <div className="w-7 h-7 rounded-full bg-[var(--accent-employee-dim)] flex items-center justify-center text-[11px] font-bold text-[var(--accent-employee-text)]">
                                  {(memberData.user.name ?? memberData.user.email ?? "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[13px] text-[var(--text-primary)]">
                                    {memberData.user.name ?? memberData.user.email}
                                  </span>
                                  {memberData.user.designation && (
                                    <span className="text-[11px] text-[var(--text-muted)]">{memberData.user.designation}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="w-20 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                                    <div className="h-full rounded-full bg-[var(--accent-employee)]" style={{ width: `${memberPct}%` }} />
                                  </div>
                                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
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
function EmployeeDashboard() {
  const { tasks, displayName, greeting } = useDashboardBase();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const overdueStatus = useQuery(api.tasks.getOverdueHaltStatus);
  const contactManager = useMutation(api.tasks.contactManagerForOverdue);
  const { toast } = useToast();
  const updateTaskStatus = useUpdateTaskStatus();
  const [justContactedTasks, setJustContactedTasks] = useState<Set<string>>(new Set());
  const startingTaskId: string | null = null;
  const [showNewTask, setShowNewTask] = useState(false);

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    "pending": { color: "var(--text-muted)", bg: "var(--bg-hover)" },
    "in-progress": { color: "#3B82F6", bg: "#EFF6FF" },
    "review": { color: "#F59E0B", bg: "#FFFBEB" },
    "done": { color: "var(--accent-employee)", bg: "var(--accent-employee-dim)" },
  };

  const isHalted = overdueStatus && overdueStatus.length > 0;
  const nowMs = Date.now();
  const myOpen = (tasks ?? []).filter((t) => t.status !== "done" && t.briefStatus !== "archived");
  const myOverdue = myOpen.filter((t) => isTaskOverdue(t, nowMs)).length;
  const dueThisWeek = myOpen.filter((t) => t.deadline && t.deadline >= nowMs && t.deadline <= nowMs + 7 * 86_400_000).length;
  const doneThisWeek = (tasks ?? []).filter((t) => t.completedAt && t.completedAt > nowMs - 7 * 86_400_000).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 relative">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="font-semibold text-[26px] text-[var(--text-primary)] tracking-tight leading-tight">
          {greeting}, {displayName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          {myOverdue > 0
            ? `${myOverdue} overdue · ${dueThisWeek} due this week`
            : dueThisWeek > 0
              ? `${dueThisWeek} due this week. Click a task for details.`
              : "Nothing due this week."}
        </p>
      </div>
        <Button onClick={() => setShowNewTask(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>
      <NewSelfTaskModal open={showNewTask} onClose={() => setShowNewTask(false)} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatTile label="Open tasks" value={myOpen.length} href="/my-tasks" icon={ListChecks}
          hint={myOverdue > 0 ? `${myOverdue} overdue` : "Nothing overdue"} hintTone={myOverdue > 0 ? "bad" : "good"} />
        <StatTile label="In progress" value={myOpen.filter((t) => t.status === "in-progress").length} href="/my-tasks" icon={Play} />
        <StatTile label="In review" value={myOpen.filter((t) => t.status === "review").length} href="/my-tasks" icon={ClipboardCheck}
          hint="Waiting on a reviewer" />
        <StatTile label="Done this week" value={doneThisWeek} href="/worklog" icon={CheckCircle2}
          hintTone="good" hint={doneThisWeek > 0 ? "Nice work" : undefined} />
      </div>

      {/* Needs attention: your overdue tasks, each with its next step */}
      {isHalted && (
        <section className="mb-8">
          <SectionHeader title="Needs attention" count={overdueStatus.length} tone="danger" />
          <ul className="rounded-xl border border-[var(--danger)]/25 bg-white divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
            {overdueStatus.map((ot) => {
              const isContacted = ot.overdueContacted || justContactedTasks.has(ot._id);
              return (
                <li key={ot._id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <button type="button" onClick={() => setSelectedTaskId(ot._id)} className="min-w-0 flex-1 text-left">
                    <span className="block text-[15px] font-medium text-[var(--text-primary)] truncate">{ot.title}</span>
                    <span className="block text-[12px] text-[var(--text-secondary)] truncate">
                      {ot.briefTitle} · was due {new Date(ot.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · Manager {ot.managerName}
                    </span>
                    {isContacted && (
                      <span className="block text-[11px] text-amber-700 mt-0.5">Waiting for {ot.managerName} to confirm.</span>
                    )}
                    {!isContacted && ot.overdueContactDenied && (
                      <span className="block text-[11px] text-red-700 mt-0.5">You haven&apos;t met the brand manager about this yet. Please contact them.</span>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await contactManager({ taskId: ot._id as Id<"tasks"> });
                        setJustContactedTasks((prev) => new Set(prev).add(ot._id));
                      } catch (err) {
                        toast("error", err instanceof Error ? err.message : "Couldn't contact the manager");
                      }
                    }}
                    disabled={isContacted}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-[var(--text-primary)] text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
                  >
                    <Phone className="h-3 w-3" />
                    {isContacted ? "Contacted" : "Contact manager"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <TodayList tasks={tasks as any} onOpen={setSelectedTaskId} />

      <SectionHeader title="All my tasks" />
      <EmployeeTaskViews
        tasks={tasks ?? []}
        onSelectTask={setSelectedTaskId}
        onStartTask={(taskId) => {
          // Shown as started at once (useUpdateTaskStatus); rolled back on error.
          updateTaskStatus({ taskId: taskId as Id<"tasks">, newStatus: "in-progress" }).catch((err) =>
            toast("error", err instanceof Error ? err.message : "Couldn't start the task")
          );
        }}
        startingTaskId={startingTaskId}
        statusColors={STATUS_COLORS}
      />

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
