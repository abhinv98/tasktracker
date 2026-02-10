"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, TaskDetailModal } from "@/components/ui";
import { X, BarChart3, ArrowRight } from "lucide-react";

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
  "in-progress": { color: "var(--accent-manager)", label: "In Progress", order: 1 },
  pending: { color: "var(--text-secondary)", label: "Pending", order: 2 },
  review: { color: "var(--accent-admin)", label: "Review", order: 3 },
  done: { color: "var(--accent-employee)", label: "Done", order: 4 },
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

  const [selectedBriefId, setSelectedBriefId] = useState<Id<"briefs"> | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedBrief = useQuery(
    api.briefs.getBrief,
    selectedBriefId ? { briefId: selectedBriefId } : "skip"
  );

  function openBriefPanel(briefId: Id<"briefs">) {
    setSelectedBriefId(briefId);
    // Small delay for mount animation
    requestAnimationFrame(() => setPanelOpen(true));
  }

  function closeBriefPanel() {
    setPanelOpen(false);
    setTimeout(() => setSelectedBriefId(null), 200);
  }

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeBriefPanel();
    }
    if (selectedBriefId) {
      document.addEventListener("keydown", handleKey);
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedBriefId]);

  const activeBriefs = (briefs ?? []).filter(
    (b) => !["archived", "completed"].includes(b.status)
  ).length;

  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "there";
  const greeting = getGreeting();

  // Helper to get user name from ID
  function getUserName(userId: string): string {
    if (!allUsers) return "Unknown";
    const u = allUsers.find((u) => u._id === userId);
    return u?.name ?? u?.email?.split("@")[0] ?? "Unknown";
  }

  // Build the tree structure for the selected brief
  function renderTaskTree() {
    if (!selectedBrief) return null;
    const tasksList = selectedBrief.tasks ?? [];
    
    // Group by status
    const grouped: Record<string, typeof tasksList> = {};
    for (const task of tasksList) {
      if (!grouped[task.status]) grouped[task.status] = [];
      grouped[task.status].push(task);
    }

    const statusKeys = Object.keys(grouped).sort(
      (a, b) => (STATUS_CONFIG[a]?.order ?? 99) - (STATUS_CONFIG[b]?.order ?? 99)
    );

    if (statusKeys.length === 0) {
      return (
        <div className="text-[13px] text-[var(--text-muted)] font-mono px-1">
          └── No tasks yet
        </div>
      );
    }

    return (
      <div className="font-mono text-[13px] leading-relaxed text-[var(--text-primary)]">
        {statusKeys.map((status, statusIdx) => {
          const config = STATUS_CONFIG[status] ?? { color: "var(--text-muted)", label: status, order: 99 };
          const statusTasks = grouped[status];
          const isLastStatus = statusIdx === statusKeys.length - 1;
          const connector = isLastStatus ? "└── " : "├── ";
          const childPrefix = isLastStatus ? "    " : "│   ";

          return (
            <div key={status}>
              <div className="flex items-center gap-1">
                <span className="text-[var(--text-muted)] select-none">{connector}</span>
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                <span className="font-semibold text-[var(--text-secondary)]">{config.label}</span>
                <span className="text-[var(--text-disabled)]">({statusTasks.length})</span>
              </div>
              {statusTasks.map((task, taskIdx) => {
                const isLastTask = taskIdx === statusTasks.length - 1;
                const taskConnector = isLastTask ? "└── " : "├── ";
                return (
                  <div key={task._id} className="flex items-start gap-1">
                    <span className="text-[var(--text-muted)] select-none whitespace-pre">{childPrefix}{taskConnector}</span>
                    <span className="text-[var(--text-primary)] break-words">{task.title}</span>
                    <span className="text-[var(--text-disabled)] whitespace-nowrap ml-1">
                      — @{getUserName(task.assigneeId)}
                    </span>
                    <span className="text-[var(--accent-admin)] whitespace-nowrap ml-1">
                      ({task.duration})
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ADMIN DASHBOARD
  // ═══════════════════════════════════════════
  if (role === "admin") {
    const teams = useQuery(api.teams.listTeams);
    const employeeCount = (allUsers ?? []).filter(
      (u) => u.role === "employee"
    ).length;

    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
            Here&apos;s your operational overview
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card accent="admin">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Active Briefs
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {activeBriefs}
            </p>
          </Card>
          <Card accent="manager">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Open Tasks
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {(briefs ?? []).reduce(
                (acc, b) =>
                  acc +
                  ((b as { taskCount?: number }).taskCount ?? 0) -
                  ((b as { doneCount?: number }).doneCount ?? 0),
                0
              )}
            </p>
          </Card>
          <Card accent="employee">
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Teams
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {teams?.length ?? 0}
            </p>
          </Card>
          <Card>
            <p className="text-[11px] sm:text-[12px] font-medium text-[var(--text-secondary)]">
              Employees
            </p>
            <p className="font-bold text-[24px] sm:text-[32px] text-[var(--text-primary)] mt-1 tabular-nums">
              {employeeCount}
            </p>
          </Card>
        </div>

        {/* Brand Overview Shortcut */}
        <Card
          hover
          accent="admin"
          onClick={() => router.push("/overview")}
          className="mb-6 sm:mb-8 cursor-pointer"
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
                View all brands, managers, and task progress at a glance
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          </div>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="mb-6 sm:mb-8 p-4">
          <h3 className="font-semibold text-[13px] text-[var(--text-secondary)] uppercase tracking-wide mb-3">
            Recent Activity
          </h3>
          <ActivityFeed />
        </Card>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <h2 className="font-semibold text-[14px] text-[var(--text-secondary)]">
            Briefs Overview
          </h2>
          <Button variant="primary" onClick={() => router.push("/briefs")}>
            Create Brief
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {(briefs ?? [])
            .filter((b) => b.status !== "archived")
            .sort((a, b) => a.globalPriority - b.globalPriority)
            .map((brief) => (
              <Card
                key={brief._id}
                onClick={() => openBriefPanel(brief._id)}
                hover
                accent={brief.status === "active" ? "employee" : brief.status === "draft" ? undefined : "manager"}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[13px] sm:text-[14px] text-[var(--text-primary)] truncate flex-1">
                    {brief.title}
                  </h3>
                  <Badge variant="neutral">{brief.status}</Badge>
                </div>
                {brief.managerName && (
                  <p className="text-[12px] text-[var(--text-secondary)] mb-2">
                    Manager: {brief.managerName}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-employee)]"
                      style={{ width: `${brief.progress ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {brief.doneCount ?? 0}/{brief.taskCount ?? 0}
                  </span>
                </div>
                {(brief.teamNames?.length ?? 0) > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {brief.teamNames?.filter((name): name is string => !!name).map((name) => (
                      <Badge key={name} variant="neutral">{name}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          {(briefs ?? []).filter((b) => b.status !== "archived").length === 0 && (
            <p className="text-[13px] text-[var(--text-muted)] col-span-full">
              No briefs yet. Create one to get started.
            </p>
          )}
        </div>

        {/* ═══ Brief Slide-in Panel ═══ */}
        {selectedBriefId && (
          <>
            {/* Backdrop */}
            <div
              className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${
                panelOpen ? "opacity-100" : "opacity-0"
              }`}
              onClick={closeBriefPanel}
            />

            {/* Panel */}
            <div
              ref={panelRef}
              className={`fixed right-0 top-0 h-full w-full sm:w-[420px] z-50 bg-white border-l border-[var(--border)] shadow-xl flex flex-col transition-transform duration-200 ease-out ${
                panelOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border)] shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--accent-admin)]" />
                  <h2 className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                    {selectedBrief?.title ?? "Loading..."}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedBrief && (
                    <Badge variant="neutral">{selectedBrief.status}</Badge>
                  )}
                  <button
                    onClick={closeBriefPanel}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto px-5 py-5">
                {selectedBrief === undefined ? (
                  <p className="text-[13px] text-[var(--text-muted)]">Loading brief data...</p>
                ) : selectedBrief === null ? (
                  <p className="text-[13px] text-[var(--text-muted)]">Brief not found.</p>
                ) : (
                  <>
                    {/* Brief description */}
                    {selectedBrief.description && (
                      <p className="text-[13px] text-[var(--text-secondary)] mb-4 leading-relaxed">
                        {selectedBrief.description}
                      </p>
                    )}

                    {/* Manager */}
                    {selectedBrief.manager && (
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[12px] text-[var(--text-muted)]">Manager:</span>
                        <Badge variant="manager">
                          {selectedBrief.manager.name ?? selectedBrief.manager.email}
                        </Badge>
                      </div>
                    )}

                    {/* Progress */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] font-medium text-[var(--text-secondary)]">Progress</span>
                        <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">
                          {Math.round(selectedBrief.progress)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent-employee)] transition-all"
                          style={{ width: `${selectedBrief.progress}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">
                        {selectedBrief.doneCount}/{selectedBrief.taskCount} tasks completed
                      </p>
                    </div>

                    {/* Task Tree */}
                    <div className="mb-4">
                      <h3 className="font-semibold text-[13px] text-[var(--text-secondary)] mb-3 uppercase tracking-wider">
                        Task Structure
                      </h3>
                      <div className="bg-[var(--bg-hover)] rounded-lg p-4 overflow-x-auto">
                        <div className="font-mono text-[13px] text-[var(--text-primary)] mb-2 font-semibold">
                          {selectedBrief.title}
                        </div>
                        {renderTaskTree()}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Panel Footer */}
              <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    closeBriefPanel();
                    router.push(`/brief/${selectedBriefId}`);
                  }}
                >
                  View Complete Brief
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // MANAGER DASHBOARD
  // ═══════════════════════════════════════════
  if (role === "manager") {
    const myBriefs = (briefs ?? []).filter(
      (b) => b.assignedManagerId === user?._id
    );

    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
            Your briefs and team status
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {myBriefs.map((brief) => (
            <Card
              key={brief._id}
              onClick={() => router.push(`/brief/${brief._id}`)}
              accent="manager"
              hover
            >
              <h3 className="font-semibold text-[14px] sm:text-[15px] text-[var(--text-primary)]">
                {brief.title}
              </h3>
              <Badge variant="neutral" className="mt-2">
                {brief.status}
              </Badge>
              <p className="text-[12px] text-[var(--text-secondary)] mt-2">
                {(brief as { doneCount?: number }).doneCount ?? 0}/
                {(brief as { taskCount?: number }).taskCount ?? 0} tasks done
              </p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // EMPLOYEE DASHBOARD
  // ═══════════════════════════════════════════
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    "pending": { color: "var(--text-muted)", bg: "var(--bg-hover)" },
    "in-progress": { color: "#3B82F6", bg: "#EFF6FF" },
    "review": { color: "#F59E0B", bg: "#FFFBEB" },
    "done": { color: "var(--accent-employee)", bg: "var(--accent-employee-dim)" },
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
          {greeting}, {displayName}
        </h1>
        <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
          Here are your active tasks &mdash; click a task for details
        </p>
      </div>

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
                  <h3 className="font-semibold text-[13px] sm:text-[14px] text-[var(--text-primary)]">
                    {task.title}
                  </h3>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                    {task.briefName} &middot; {task.duration}
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
