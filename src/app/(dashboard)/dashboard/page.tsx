"use client";

import { useQuery, useMutation } from "convex/react";
import { useUpdateTaskStatus } from "@/lib/useUpdateTaskStatus";
import { NewSelfTaskModal } from "@/components/NewSelfTaskModal";
import { EchoActionItems } from "@/components/EchoActionItems";
import { isTaskOverdue, TASK_STATUS_META, taskStatusMeta } from "@/lib/status";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";
import { formatDeadline } from "@/lib/deadlineInput";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Panel, PanelEmpty, SectionHeader, SegmentedTabs, StatStrip, StatTile, StatusBadge, TaskDetailModal, DatePicker, Skeleton, useCelebrate, useToast } from "@/components/ui";
import { TodayList } from "@/components/dashboard/TodayList";
import { TodayMeetings } from "@/components/dashboard/TodayMeetings";
import { EchoNudge } from "@/components/dashboard/EchoNudge";
import { X, ArrowRight, ChevronDown, ChevronRight, ClipboardCheck, AlertTriangle, Phone, Clock, Play, CalendarClock, UserX, CalendarOff, Trash2, Calendar, LayoutGrid, List as ListIcon, Inbox, Plus, type LucideIcon } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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

// Same labels and dot colours as My Tasks, the calendar and every other page.
const EMPLOYEE_STATUSES = (["pending", "in-progress", "review", "done"] as const).map((key) => ({
  key,
  label: TASK_STATUS_META[key].label,
  dot: TASK_STATUS_META[key].dot,
}));

const VIEW_STORAGE_KEY = "employeeQueueView";
const TAB_STORAGE_KEY = "employeeQueueTab";

function EmployeeTaskCard({
  task,
  onSelect,
  onStart,
  isStarting,
  compact = false,
}: {
  task: EmployeeTask;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  isStarting: boolean;
  /** Inside a status column: tighter, and the status is not repeated. */
  compact?: boolean;
}) {
  const meta = taskStatusMeta(task.status);
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
  const overdue = isTaskOverdue(task);
  const creatives: number = (task as { creativesRequired?: number }).creativesRequired ?? 0;

  return (
    <Card className={task.status === "done" ? "opacity-60" : ""} onClick={() => onSelect(task._id)}>
      <div className={compact ? "flex flex-col gap-2" : "flex justify-between items-start gap-3"}>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-[14px] leading-snug text-[var(--text-primary)]">{task.title}</h3>
          {/* Sub-tasks are meaningless without their master task — name it. */}
          {t.parentTaskTitle && (
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5 truncate">
              ↳ {t.parentTaskTitle}
            </p>
          )}
          <p className="text-[12px] text-[var(--text-secondary)] mt-1 flex items-center gap-1.5 flex-wrap">
            {t.brandName && (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: t.brandColor ?? "var(--text-disabled)" }}
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
          {(overdue || t.isHelper || t.deadlineExtended || isOnHold || creatives > 0) && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              {overdue && <Badge variant="danger">Overdue</Badge>}
              {isOnHold && <Badge>On hold</Badge>}
              {!!t.isHelper && <Badge>Helper</Badge>}
              {t.deadlineExtended && <Badge>Extended</Badge>}
              {creatives > 0 && (
                <span title={`${creatives} creative deliverables required`}>
                  <Badge>
                    {creatives} creative{creatives !== 1 ? "s" : ""} required
                  </Badge>
                </span>
              )}
            </div>
          )}
          {(task.description || t.briefDescription) && (
            <p className="text-[12px] text-[var(--text-muted)] mt-1.5 line-clamp-2">
              {task.description || t.briefDescription}
            </p>
          )}
        </div>
        {task.status === "pending" && !isOnHold ? (
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onStart(task._id);
            }}
            disabled={isStarting}
            className={compact ? "self-start" : "shrink-0"}
          >
            <Play className="h-3 w-3" />
            Start
          </Button>
        ) : (
          !compact && <StatusBadge color={meta.dot} label={meta.label} className="shrink-0" />
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
}: {
  tasks: EmployeeTask[];
  onSelectTask: (id: string) => void;
  onStartTask: (id: string) => void;
  startingTaskId: string | null;
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
      <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
        <button
          onClick={() => setShowOnHold((v) => !v)}
          aria-expanded={showOnHold}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
        >
          {showOnHold ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          )}
          <span className="font-medium text-[13px] text-[var(--text-primary)]">On hold</span>
          <span className="text-[13px] tabular-nums text-[var(--text-muted)]">{onHoldTasks.length}</span>
          <span className="ml-auto text-[12px] text-[var(--text-muted)]">Brief paused, no action needed</span>
        </button>
        {showOnHold && (
          <div className="flex flex-col gap-2 p-2 border-t border-[var(--border-subtle)] bg-[var(--bg-hover)]">
            {onHoldTasks.map((task) => (
              <EmployeeTaskCard
                key={task._id}
                task={task}
                onSelect={onSelectTask}
                onStart={onStartTask}
                isStarting={startingTaskId === task._id}
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
                className="flex flex-col min-w-[280px] sm:min-w-0 snap-start rounded-lg bg-[var(--bg-hover)]"
              >
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.dot }} aria-hidden />
                  <span className="font-medium text-[13px] text-[var(--text-primary)]">{col.label}</span>
                  <span className="text-[13px] tabular-nums text-[var(--text-muted)]">{colTasks.length}</span>
                </div>
                <div className="flex flex-col gap-2 p-2 min-h-[80px] max-h-[70vh] overflow-y-auto">
                  {colTasks.length === 0 ? (
                    <p className="text-[12px] text-[var(--text-muted)] px-1 py-4">Nothing here.</p>
                  ) : (
                    colTasks.map((task) => (
                      <EmployeeTaskCard
                        key={task._id}
                        task={task}
                        onSelect={onSelectTask}
                        onStart={onStartTask}
                        isStarting={startingTaskId === task._id}
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
                      ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: tab.dot }}
                  />
                  {tab.label}
                  <span className="text-[12px] font-normal tabular-nums text-[var(--text-muted)]">{count}</span>
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
  if (user?.isReviewer === true) return <ReviewerDashboard firstName={(user.name ?? "").split(" ")[0]} email={user.email} />;
  return user?.role === "admin" ? <AdminDashboard /> : <EmployeeDashboard />;
}

// An outside reviewer's account (users.isReviewer): their own calendar and
// Echo, nothing of Ecultify's work. The backend returns nothing else to it.
function ReviewerDashboard({ firstName, email }: { firstName: string; email?: string }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <h1 className="font-semibold text-[26px] text-[var(--text-primary)] leading-tight">
        {getGreeting()}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-1 mb-6 text-[13px] text-[var(--text-secondary)]">
        This is a review account for Echo. Connect your Google Calendar on the Profile page to see today&apos;s
        meetings here; meetings Echo records for you appear under Meetings.
      </p>
      <EchoNudge email={email} />
      <EchoActionItems />
      <TodayMeetings />
    </div>
  );
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
  const brands = useQuery(api.brands.listBrandNames);
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
  const todayLine = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
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
        iconClass: "text-[var(--danger)]",
        title: ot.title,
        context: `Your task · ${ot.briefTitle} · was due ${new Date(ot.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}${contacted ? " · waiting on " + ot.managerName : ""}`,
        href: `/brief/${ot.briefId}`,
        action: contacted ? undefined : (
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await adminContactManager({ taskId: ot._id as Id<"tasks"> });
                setAdminContactedTasks((prev) => new Set(prev).add(ot._id));
                adminToast("success", `${ot.managerName} has been asked to follow up`);
              } catch (err) {
                adminToast("error", err instanceof Error ? err.message : "Couldn't contact the manager");
              }
            }}
            className="shrink-0"
          >
            <Phone className="h-3 w-3" /> Contact {ot.managerName.split(" ")[0]}
          </Button>
        ),
      };
    }),
    ...(needsReview > 0
      ? [{
          key: "review-queue",
          icon: ClipboardCheck,
          iconClass: "text-[var(--text-muted)]",
          title: `${needsReview} deliverable${needsReview !== 1 ? "s" : ""} waiting on your review`,
          context: "Approve or send back so work keeps moving",
          href: "/deliverables",
        } as AttentionRow]
      : []),
    // Then overdue work across your team, action-needed, and client requests
    ...(overdueTasksForManager ?? []).map((ot: any): AttentionRow => ({
      key: `overdue-${ot._id}`,
      icon: AlertTriangle,
      iconClass: "text-[var(--danger)]",
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
      iconClass: "text-[var(--text-muted)]",
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
      iconClass: "text-[var(--text-muted)]",
      title: r.title,
      context: `${r.brandName} · Client request`,
      href: "/client-requests",
    })),
  ];
  const attentionTotal = attentionRows.length;
  const attentionVisible = attentionRows.slice(0, 6);

  // Open briefs rolled up per brand and per status. scopedBriefs is already
  // limited to what this person may see, and listBriefs only returns open ones.
  const brandRows = (brands ?? [])
    .map((brand) => {
      const own = scopedBriefs.filter((b) => b.brandId === brand._id);
      // Upcoming only: a brief past its date is usually sitting in review, which
      // this app does not count as overdue (see isTaskOverdue).
      const deadlines = own.map((b) => b.deadline).filter((d): d is number => !!d && d >= dayStart.getTime());
      return {
        _id: brand._id,
        name: brand.name,
        color: brand.color,
        briefs: own.length,
        tasks: own.reduce((n, b) => n + b.taskCount, 0),
        done: own.reduce((n, b) => n + b.doneCount, 0),
        inReview: own.filter((b) => b.status === "review").length,
        nextDeadline: deadlines.length ? Math.min(...deadlines) : undefined,
      };
    })
    .filter((r) => r.briefs > 0)
    .sort((a, b) => b.tasks - b.done - (a.tasks - a.done));
  const brandRowsVisible = brandRows.slice(0, 8);
  const statusRows = ["active", "in-progress", "review", "sent_to_client", "on_hold", "draft", "rejected"]
    .map((status) => ({ status, count: scopedBriefs.filter((b) => b.status === status).length }))
    .filter((r) => r.count > 0);
  const statusMax = Math.max(1, ...statusRows.map((r) => r.count));

  const mineOpen = myWork?.counts.assignedToMeOpen ?? 0;
  const supervisingOpen = myWork?.counts.supervisingOpen ?? 0;
  const showMyTasks = mineOpen > 0 || supervisingOpen > 0;
  const showTeams = (teamLeadOverview ?? []).length > 0 || (pendingApprovalCount ?? 0) > 0;
  const clientApprovalTotal = clientApprovalCounts
    ? clientApprovalCounts.pendingClient +
      clientApprovalCounts.approved +
      clientApprovalCounts.changesRequested +
      clientApprovalCounts.denied
    : 0;

  function toggleTeam(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 relative">
      {/* Header: greeting, then the date and what today holds on one line */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="font-semibold text-[26px] text-[var(--text-primary)] leading-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {todayLine}
            <span className="mx-1.5 text-[var(--text-muted)]">·</span>
            {!heroLoaded ? (
              <span className="text-[var(--text-muted)]">Pulling up your day…</span>
            ) : digestSegments.length === 0 ? (
              <span>Nothing urgent today</span>
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
          <Button
            variant="secondary"
            onClick={() => router.push("/brands-overview?filter=mine")}
            className="shrink-0 self-start sm:self-auto"
          >
            My Brands
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <EchoNudge email={user?.email} />
      <EchoActionItems />

      {/* Numbers that go somewhere: one strip, each cell opens its list */}
      <StatStrip className="mb-4">
        <StatTile
          label="Active briefs"
          value={scopedActiveBriefs}
          hint={newBriefsThisWeek > 0 ? `${newBriefsThisWeek} new this week` : "None new this week"}
          href="/briefs"
        />
        <StatTile
          label="Open tasks"
          value={scopedOpenTasks}
          hint={overdueCount > 0 ? `${overdueCount} overdue` : "None overdue"}
          bad={overdueCount > 0}
          href="/worklog"
        />
        <StatTile
          label="Client requests"
          value={pendingRequests.length}
          hint={pendingRequests.length > 0 ? "Waiting for review" : "Queue is clear"}
          bad={pendingRequests.length > 0}
          href="/client-requests"
        />
        <StatTile
          label={isSuperAdmin ? "Teams" : "My brands"}
          value={isSuperAdmin ? (teams?.length ?? 0) : myBrandIdSet.size}
          hint={`${employeeCount} people`}
          href={isSuperAdmin ? "/users?tab=teams" : "/brands-overview?filter=mine"}
        />
      </StatStrip>

      {/* One grid, one gutter: the work in the wide column, reference blocks
          in the rail. Every block is a Panel, so title bars and edges line up.
          Below xl the rail stacks under the work. */}
      <div className="grid gap-4 xl:grid-cols-3 items-start">
      <div className="min-w-0 flex flex-col gap-4 xl:col-span-2">
      {/* Needs attention — the page's lead: the only block that asks the
          reader to DO something. */}
      <Panel title="Needs attention" count={attentionLoaded ? attentionTotal : undefined} tone="danger">
        {!attentionLoaded ? (
          <div className="p-4 flex flex-col gap-3">
            <Skeleton className="h-[13px] w-[60%]" />
            <Skeleton className="h-[13px] w-[45%]" />
            <Skeleton className="h-[13px] w-[52%]" />
          </div>
        ) : attentionTotal === 0 ? (
          <PanelEmpty>Nothing overdue, nothing waiting on your review, and the client queue is empty.</PanelEmpty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {attentionVisible.map((row) => {
              const RowIcon = row.icon;
              return (
                <li key={row.key} className="flex items-center gap-2 pr-4 hover:bg-[var(--bg-hover)] transition-colors">
                  <Link
                    href={row.href}
                    // The whole row is the target, not a 40px "View" link at
                    // the end of it — this is the thing you're here to click.
                    className="group flex-1 min-w-0 flex items-center gap-3 pl-4 pr-1 py-3 focus-visible:outline-offset-[-2px]"
                  >
                    <RowIcon className={`h-4 w-4 shrink-0 ${row.iconClass}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-[var(--text-primary)] truncate">
                        {row.title}
                      </span>
                      <span className="block text-[12px] text-[var(--text-muted)] truncate">
                        {row.context}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-[color,transform]" />
                  </Link>
                  {row.action}
                </li>
              );
            })}
            {attentionTotal > attentionVisible.length && (
              <li className="px-4 py-2.5 text-[12px] text-[var(--text-muted)]">
                {attentionTotal - attentionVisible.length} more in the sections below
              </li>
            )}
          </ul>
        )}
      </Panel>

      <TodayList tasks={tasks as any} onOpen={(id) => setAdminSelectedTaskId(id)} />

      {/* Client approval status */}
      {clientApprovalCounts && clientApprovalTotal > 0 && (
        <Panel
          title="Client approvals"
          count={clientApprovalTotal}
          action={{ label: "View all", href: "/deliverables" }}
        >
          <StatStrip bare>
            <StatTile label="Pending client" value={clientApprovalCounts.pendingClient} href="/deliverables" />
            <StatTile label="Client approved" value={clientApprovalCounts.approved} href="/deliverables" />
            <StatTile
              label="Changes requested"
              value={clientApprovalCounts.changesRequested}
              href="/deliverables"
            />
            <StatTile label="Client denied" value={clientApprovalCounts.denied} href="/deliverables" />
          </StatStrip>
        </Panel>
      )}

      {/* Overdue Tasks Section */}
      {(overdueTasksForManager ?? []).length > 0 && (
        <Panel
          title="Overdue alerts"
          count={overdueTasksForManager!.length}
          action={{ label: "View all", href: "/worklog" }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--border-subtle)] sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            {overdueTasksForManager!.map((ot: any) => (
              <div key={ot._id} className="bg-white p-4">
                <div className="mb-2">
                  <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">{ot.title}</p>
                  {ot.alertType === "unassigned" ? (
                    <p className="text-[12px] text-[var(--warning)] mt-0.5 font-medium">
                      No one is assigned yet.
                    </p>
                  ) : (
                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 truncate">
                      {ot.briefTitle} &middot; <span className="font-medium text-[var(--text-primary)]">{ot.assigneeName}</span>
                    </p>
                  )}
                  <p className="text-[12px] text-[var(--danger)] mt-0.5 tabular-nums">
                    <Clock className="inline h-3 w-3 mr-1 -mt-px" />
                    {new Date(ot.deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                    {" "}({Math.round((Date.now() - ot.deadline) / (1000 * 60 * 60))}h overdue)
                  </p>
                  {ot.deadlineExtended && <Badge className="mt-1">Extended</Badge>}
                </div>
                {ot.alertType !== "unassigned" && ot.overdueContacted && (
                  <div className="mt-2 p-2.5 rounded-md bg-[var(--bg-primary)]">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] mb-2">
                      <Phone className="inline h-3 w-3 mr-1 -mt-px" />
                      {ot.assigneeName} has contacted you. Have you had the meeting?
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={async () => {
                          await confirmOverdueContact({ taskId: ot._id as Id<"tasks">, confirmed: true });
                        }}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          await confirmOverdueContact({ taskId: ot._id as Id<"tasks">, confirmed: false });
                        }}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                )}
                {ot.briefType === "content_calendar" && (
                  <p className="text-[12px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Content calendar
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                  {ot.alertType === "unassigned" ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (ot.briefType === "content_calendar" && ot.brandId) {
                            router.push(`/content-calendar?brand=${ot.brandId}`);
                          } else {
                            router.push(`/brief/${ot.briefId}`);
                          }
                        }}
                      >
                        {ot.briefType === "content_calendar" ? "Open Calendar" : "Assign Tasks"}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      {resolvingTaskId !== ot._id && (
                        <button
                          onClick={() => setResolvingTaskId(ot._id)}
                          aria-label={`Remove ${ot.title}`}
                          title="Remove"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors ml-auto"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          await resumeOverdueTask({ taskId: ot._id as Id<"tasks"> });
                        }}
                      >
                        <Play className="h-3 w-3" />
                        Resume
                      </Button>
                      {extendingTaskId === ot._id ? (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="flex-1 min-w-[100px]">
                            <DatePicker value={extendDeadline} onChange={setExtendDeadline} placeholder="New deadline" />
                          </div>
                          <input
                            type="time"
                            value={extendDeadlineTime}
                            onChange={(e) => setExtendDeadlineTime(e.target.value)}
                            aria-label="New deadline time"
                            className="w-24 px-2 rounded-md border border-[var(--border)] bg-white"
                          />
                          <Button
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
                          >
                            Save
                          </Button>
                          <button
                            onClick={() => { setExtendingTaskId(null); setExtendDeadline(undefined); setExtendDeadlineTime(""); }}
                            aria-label="Cancel"
                            className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button variant="secondary" onClick={() => setExtendingTaskId(ot._id)}>
                          <CalendarClock className="h-3 w-3" />
                          Extend Deadline
                        </Button>
                      )}
                      {resolvingTaskId !== ot._id && (
                        <button
                          onClick={() => setResolvingTaskId(ot._id)}
                          aria-label={`Remove ${ot.title}`}
                          title="Remove"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors ml-auto"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
                {resolvingTaskId === ot._id && (
                  <div className="mt-2 p-2.5 rounded-md bg-[var(--bg-primary)]">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] mb-2">
                      {ot.alertType === "unassigned" ? "Delete this brief and all its data?" : "Is this task already done?"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (ot.alertType === "unassigned") {
                            await deleteBrief({ briefId: ot.briefId as Id<"briefs"> });
                          } else {
                            await deleteTask({ taskId: ot._id as Id<"tasks"> });
                          }
                          setResolvingTaskId(null);
                        }}
                      >
                        Yes, Delete
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (ot.briefType === "content_calendar" && ot.brandId) {
                            router.push(`/content-calendar?brand=${ot.brandId}`);
                          } else {
                            router.push(`/brief/${ot.briefId}`);
                          }
                          setResolvingTaskId(null);
                        }}
                      >
                        No, Continue
                      </Button>
                      <Button variant="ghost" onClick={() => setResolvingTaskId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Action Needed Grid */}
      {(actionNeededTasks ?? []).length > 0 && (
        <Panel title="Action needed" count={actionNeededTasks!.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--border-subtle)] sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            {actionNeededTasks!.map((t: any) => {
              const label =
                t.category === "neither"
                  ? "No assignee, no deadline"
                  : t.category === "no_assignee"
                    ? "No assignee"
                    : "No deadline";
              const IconComp = t.category === "no_deadline" ? CalendarOff : UserX;

              return (
                <div key={t._id} className="bg-white p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <IconComp className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                        {t.title}
                      </p>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                        {t.briefTitle} &middot; {t.brandName}
                      </p>
                    </div>
                  </div>
                  {t.briefType === "content_calendar" && (
                    <p className="text-[12px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Content calendar
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
                    <Badge>{label}</Badge>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (t.briefType === "content_calendar" && t.brandId) {
                            router.push(`/content-calendar?brand=${t.brandId}`);
                          } else {
                            router.push(`/brief/${t.briefId}`);
                          }
                        }}
                      >
                        {t.briefType === "content_calendar" ? "Open Calendar" : "Take Action"}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      {resolvingTaskId !== t._id && (
                        <button
                          onClick={() => setResolvingTaskId(t._id)}
                          aria-label={`Remove ${t.title}`}
                          title="Remove"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {resolvingTaskId === t._id && (
                    <div className="mt-2 p-2.5 rounded-md bg-[var(--bg-primary)]">
                      <p className="text-[12px] font-medium text-[var(--text-primary)] mb-2">Is this task already done?</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            await deleteTask({ taskId: t._id as Id<"tasks"> });
                            setResolvingTaskId(null);
                          }}
                        >
                          Yes, Delete
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (t.briefType === "content_calendar" && t.brandId) {
                              router.push(`/content-calendar?brand=${t.brandId}`);
                            } else {
                              router.push(`/brief/${t.briefId}`);
                            }
                            setResolvingTaskId(null);
                          }}
                        >
                          No, Continue
                        </Button>
                        <Button variant="ghost" onClick={() => setResolvingTaskId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Where the open work sits, brand by brand */}
      {brandRows.length > 0 && (
        <Panel
          title="Brands"
          count={brandRows.length}
          action={{ label: "All brands", href: "/brands-overview" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="h-9 px-4 text-left">Brand</th>
                  <th className="h-9 px-3 text-right">Open briefs</th>
                  <th className="h-9 px-3 text-left">Tasks done</th>
                  <th className="h-9 px-3 text-right">Briefs in review</th>
                  <th className="h-9 px-4 text-right">Next deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {brandRowsVisible.map((r) => (
                    <tr key={r._id}>
                      <td className="h-11 px-4 max-w-[220px]">
                        <Link
                          href={`/brands/${r._id}`}
                          className="flex items-center gap-2 font-medium text-[var(--text-primary)] hover:underline underline-offset-2"
                        >
                          <span
                            className="w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: r.color ?? "var(--text-disabled)" }}
                            aria-hidden
                          />
                          <span className="truncate">{r.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 text-right tabular-nums">{r.briefs}</td>
                      <td className="px-3">
                        <span className="flex items-center gap-2">
                          <span className="w-20 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden shrink-0">
                            <span
                              className="block h-full rounded-full bg-[var(--accent-employee)]"
                              style={{ width: `${r.tasks > 0 ? (r.done / r.tasks) * 100 : 0}%` }}
                            />
                          </span>
                          <span className="tabular-nums text-[var(--text-secondary)]">
                            {r.done}/{r.tasks}
                          </span>
                        </span>
                      </td>
                      <td className={`px-3 text-right tabular-nums ${r.inReview ? "" : "text-[var(--text-disabled)]"}`}>
                        {r.inReview || "–"}
                      </td>
                      <td
                        className={`px-4 text-right tabular-nums whitespace-nowrap ${
                          r.nextDeadline ? "text-[var(--text-secondary)]" : "text-[var(--text-disabled)]"
                        }`}
                      >
                        {r.nextDeadline ? formatDeadline(r.nextDeadline) : "–"}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
          {brandRows.length > brandRowsVisible.length && (
            <p className="px-4 py-2.5 border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-muted)]">
              {brandRows.length - brandRowsVisible.length} more with open briefs
            </p>
          )}
        </Panel>
      )}
      </div>

      <aside className="min-w-0 flex flex-col gap-4">
      <TodayMeetings />
      {/* My Tasks lives on its own page (/my-tasks); this is the way in */}
      {showMyTasks && (
        <Panel title="My tasks" action={{ label: "Open", href: "/my-tasks" }}>
          <div className="grid grid-cols-3 gap-px bg-[var(--border-subtle)]">
            <StatTile label="Yours" value={mineOpen} href="/my-tasks" />
            <StatTile label="Supervising" value={supervisingOpen} href="/my-tasks" />
            <StatTile label="To review" value={needsReview} href="/deliverables" />
          </div>
        </Panel>
      )}

      {/* Open briefs by stage */}
      {statusRows.length > 0 && (
        <Panel title="Briefs by status" count={scopedActiveBriefs} action={{ label: "All briefs", href: "/briefs" }}>
          <ul className="px-4 py-2">
            {statusRows.map((r) => (
              <li key={r.status} className="flex items-center gap-3 h-9 text-[13px]">
                <span className="flex items-center gap-2 w-[112px] shrink-0 text-[var(--text-primary)]">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: BRIEF_STATUS_COLORS[r.status] }}
                    aria-hidden
                  />
                  {BRIEF_STATUS_LABELS[r.status]}
                </span>
                <span className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-[var(--text-secondary)]"
                    style={{ width: `${(r.count / statusMax) * 100}%` }}
                  />
                </span>
                <span className="w-7 text-right tabular-nums text-[var(--text-primary)]">{r.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Team lead overview: one list, each team opens in place */}
      {showTeams && (
        <Panel
          title="My teams"
          count={(teamLeadOverview ?? []).length}
          action={{ label: "View all", href: "/teams" }}
        >
          <div className="divide-y divide-[var(--border-subtle)]">
            {(pendingApprovalCount ?? 0) > 0 && (
              <Link
                href="/deliverables"
                className="group flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-[var(--bg-hover)] transition-colors focus-visible:outline-offset-[-2px]"
              >
                <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <span className="flex-1 font-medium text-[var(--text-primary)]">
                  {pendingApprovalCount} approval{pendingApprovalCount !== 1 ? "s" : ""} pending
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-primary)] transition-colors" />
              </Link>
            )}
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
                <div key={teamData.team._id}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleTeam(teamData.team._id)}
                    className="w-full px-4 py-3 flex items-center gap-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors focus-visible:outline-offset-[-2px]"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: teamData.team.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[14px] text-[var(--text-primary)] truncate">
                        {teamData.team.name}
                      </span>
                      <span className="block text-[12px] text-[var(--text-muted)]">
                        {teamData.members.length} member{teamData.members.length !== 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="w-14 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                        <span
                          className="block h-full rounded-full bg-[var(--accent-employee)]"
                          style={{ width: `${progress}%` }}
                        />
                      </span>
                      <span className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                        {doneTasks}/{totalTasks}
                      </span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                      {teamData.members.map((memberData: any, midx: number) => {
                        const memberDone = memberData.briefs.reduce((a: number, b: any) => a + (b.doneCount ?? 0), 0);
                        const memberTotal = memberData.briefs.reduce((a: number, b: any) => a + (b.taskCount ?? 0), 0);

                        return (
                          <div
                            key={memberData.user._id}
                            className={`px-4 py-3 ${midx !== teamData.members.length - 1 ? "border-b border-[var(--border-subtle)]" : ""}`}
                          >
                            <div className="flex items-center gap-2.5">
                              {memberData.user.avatarUrl ? (
                                <img src={memberData.user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[12px] font-medium text-[var(--text-secondary)] shrink-0">
                                  {(memberData.user.name ?? memberData.user.email ?? "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                                  {memberData.user.name ?? memberData.user.email}
                                </p>
                                {memberData.user.designation && (
                                  <p className="text-[12px] text-[var(--text-muted)] truncate">{memberData.user.designation}</p>
                                )}
                              </div>
                              <span className="shrink-0 text-[12px] text-[var(--text-secondary)] tabular-nums">
                                {memberDone}/{memberTotal}
                              </span>
                            </div>
                            {memberData.briefs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2 ml-[37px]">
                                {memberData.briefs.map((briefInfo: any) => (
                                  <button
                                    key={briefInfo._id}
                                    onClick={() => router.push(`/brief/${briefInfo._id}`)}
                                    className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md text-[12px] bg-white border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors text-left"
                                  >
                                    <span className="text-[var(--text-primary)] truncate max-w-[160px]">
                                      {briefInfo.title}
                                    </span>
                                    <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                                      {briefInfo.doneCount}/{briefInfo.taskCount}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}
      </aside>
      </div>

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
  const { user, tasks, displayName, greeting } = useDashboardBase();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const overdueStatus = useQuery(api.tasks.getOverdueHaltStatus);
  const contactManager = useMutation(api.tasks.contactManagerForOverdue);
  const { toast } = useToast();
  const updateTaskStatus = useUpdateTaskStatus();
  const [justContactedTasks, setJustContactedTasks] = useState<Set<string>>(new Set());
  const startingTaskId: string | null = null;
  const [showNewTask, setShowNewTask] = useState(false);

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
      <div className="min-w-0">
        <h1 className="font-semibold text-[26px] text-[var(--text-primary)] leading-tight">
          {greeting}, {displayName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          {myOverdue > 0
            ? `${myOverdue} overdue · ${dueThisWeek} due this week`
            : dueThisWeek > 0
              ? `${dueThisWeek} due this week`
              : "Nothing due this week"}
        </p>
      </div>
        <Button onClick={() => setShowNewTask(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>
      <NewSelfTaskModal open={showNewTask} onClose={() => setShowNewTask(false)} />
      <EchoNudge email={user?.email} />
      <EchoActionItems />

      <StatStrip className="mb-4">
        <StatTile label="Open tasks" value={myOpen.length} href="/my-tasks"
          hint={myOverdue > 0 ? `${myOverdue} overdue` : "None overdue"} bad={myOverdue > 0} />
        <StatTile label="In progress" value={myOpen.filter((t) => t.status === "in-progress").length} href="/my-tasks" />
        <StatTile label="In review" value={myOpen.filter((t) => t.status === "review").length} href="/my-tasks"
          hint="Waiting on a reviewer" />
        <StatTile label="Done this week" value={doneThisWeek} href="/worklog" />
      </StatStrip>

      {/* Needs attention: your overdue tasks, each with its next step */}
      {isHalted && (
        <Panel title="Needs attention" count={overdueStatus.length} tone="danger" className="mb-4">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {overdueStatus.map((ot) => {
              const isContacted = ot.overdueContacted || justContactedTasks.has(ot._id);
              return (
                <li key={ot._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                  <button type="button" onClick={() => setSelectedTaskId(ot._id)} className="min-w-0 flex-1 text-left">
                    <span className="block text-[14px] font-medium text-[var(--text-primary)] truncate">{ot.title}</span>
                    <span className="block text-[12px] text-[var(--text-muted)] truncate">
                      {ot.briefTitle} · was due {new Date(ot.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · Manager {ot.managerName}
                    </span>
                    {isContacted && (
                      <span className="block text-[12px] text-[var(--text-secondary)] mt-0.5">Waiting for {ot.managerName} to confirm.</span>
                    )}
                    {!isContacted && ot.overdueContactDenied && (
                      <span className="block text-[12px] text-[var(--danger)] mt-0.5">You haven&apos;t met the brand manager about this yet. Please contact them.</span>
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
                    className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-md text-[13px] font-medium bg-[var(--text-primary)] text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
                  >
                    <Phone className="h-3 w-3" />
                    {isContacted ? "Contacted" : "Contact manager"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="mb-4 empty:hidden">
        <TodayMeetings />
      </div>
      <TodayList tasks={tasks as any} onOpen={setSelectedTaskId} />

      <SectionHeader title="All my tasks" className="mt-8 mb-3" />
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
