"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, PromptModal, Select, Textarea, useToast } from "@/components/ui";
import { AttachmentList } from "@/components/ui/AttachmentList";
import { Trash2, Calendar, Columns3, List, Lock, FileDown, Save, MessageCircle } from "lucide-react";

function parseDuration(str: string): number {
  const m = str.match(/^(\d+)(m|h|d)$/i);
  if (!m) return 0;
  const value = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "m") return value;
  if (unit === "h") return value * 60;
  if (unit === "d") return value * 60 * 8;
  return 0;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  todo: { label: "To Do", color: "var(--text-secondary)" },
  "in-progress": { label: "In Progress", color: "var(--accent-manager)" },
  review: { label: "Review", color: "var(--accent-admin)" },
  done: { label: "Done", color: "var(--accent-employee)" },
};

export default function BriefPage() {
  const params = useParams();
  const router = useRouter();
  const briefId = params.id as Id<"briefs">;

  const brief = useQuery(api.briefs.getBrief, { briefId });
  const tasksData = useQuery(api.tasks.listTasksForBrief, { briefId });
  const graphData = useQuery(api.briefs.getBriefGraphData, { briefId });
  const teamsForBrief = useQuery(api.briefs.getTeamsForBrief, { briefId });
  const employees = useQuery(api.users.listEmployees);
  const user = useQuery(api.users.getCurrentUser);

  const createTask = useMutation(api.tasks.createTask);
  const updateBrief = useMutation(api.briefs.updateBrief);
  const archiveBrief = useMutation(api.briefs.archiveBrief);
  const deleteBrief = useMutation(api.briefs.deleteBrief);
  const assignTeamsToBrief = useMutation(api.briefs.assignTeamsToBrief);
  const removeTeamFromBrief = useMutation(api.briefs.removeTeamFromBrief);
  const allTeams = useQuery(api.teams.listTeams, {});

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<Id<"users"> | "">("");
  const [taskDuration, setTaskDuration] = useState("2h");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTemplatePrompt, setShowTemplatePrompt] = useState(false);

  const { toast } = useToast();
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const saveAsTemplate = useMutation(api.templates.saveAsTemplate);

  const employeesInBriefTeams =
    graphData?.teams.flatMap((t) => t.members.map((m) => m.user)) ?? [];
  const uniqueEmployees = [...new Map(employeesInBriefTeams.map((e) => [e._id, e])).values()];

  const allTasks = tasksData?.tasks ?? [];
  const tasksByStatus = {
    todo: allTasks.filter((t) => t.status === "pending"),
    "in-progress": allTasks.filter((t) => t.status === "in-progress"),
    review: allTasks.filter((t) => t.status === "review"),
    done: allTasks.filter((t) => t.status === "done"),
  };
  const totalTasks = allTasks.length;
  const doneTasks = tasksByStatus.done.length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskAssignee) return;
    const durationMinutes = parseDuration(taskDuration);
    if (durationMinutes <= 0) {
      toast("error", "Invalid duration. Use format like 2h, 30m, 1d");
      return;
    }
    try {
      await createTask({
        briefId,
        title: taskTitle,
        description: taskDesc || undefined,
        assigneeId: taskAssignee as Id<"users">,
        duration: taskDuration,
        durationMinutes,
      });
      setTaskTitle("");
      setTaskDesc("");
      setTaskAssignee("");
      setTaskDuration("2h");
      toast("success", "Task created");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create task");
    }
  }

  async function handleArchive() {
    try {
      await archiveBrief({ briefId });
      toast("success", "Brief archived");
      router.push("/briefs");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to archive");
    }
  }

  async function handleDelete() {
    try {
      await deleteBrief({ briefId });
      toast("success", "Brief deleted");
      router.push("/briefs");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete brief");
    }
  }

  if (brief === undefined || brief === null) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  const isAdminOrManager =
    user?.role === "admin" ||
    (user?.role === "manager" && brief.assignedManagerId === user._id);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Brief Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--border)] bg-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => router.push("/briefs")}
            className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            &larr; Briefs
          </button>
          <div className="h-4 w-px bg-[var(--border)] hidden sm:block" aria-hidden />
          <h1 className="font-semibold text-[15px] sm:text-[16px] text-[var(--text-primary)] truncate">
            {brief.title}
          </h1>
          <Badge
            variant={
              brief.status === "archived"
                ? "neutral"
                : brief.assignedManagerId
                  ? "manager"
                  : "neutral"
            }
          >
            {brief.status}
          </Badge>
          {brief.deadline && (
            <div className={`flex items-center gap-1 shrink-0 ${
              brief.status !== "completed" && brief.status !== "archived" && brief.deadline < Date.now()
                ? "text-[var(--danger)]"
                : "text-[var(--text-secondary)]"
            }`}>
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-[12px] font-medium">
                {new Date(brief.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {isAdminOrManager && brief.status !== "archived" && (
            <>
              {/* Deadline picker */}
              <DatePicker
                value={brief.deadline}
                onChange={(deadline) => updateBrief({ briefId, deadline })}
                placeholder="Set deadline"
                className="w-[140px]"
              />
              <select
                value={brief.status}
                onChange={(e) => updateBrief({ briefId, status: e.target.value })}
                className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="in-progress">In Progress</option>
                <option value="review">Review</option>
                <option value="completed">Completed</option>
              </select>
              <Button variant="secondary" onClick={handleArchive}>
                Archive
              </Button>
            </>
          )}
          {/* PDF Export */}
          <button
            onClick={() => window.print()}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all no-print"
            title="Export PDF"
          >
            <FileDown className="h-4 w-4" />
          </button>
          {/* Save as template */}
          {user?.role === "admin" && allTasks.length > 0 && (
            <button
              onClick={() => setShowTemplatePrompt(true)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-all no-print"
              title="Save as template"
            >
              <Save className="h-4 w-4" />
            </button>
          )}
          {user?.role === "admin" && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all"
              title="Delete brief permanently"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Column 1 - Create Task + Task List */}
        <div className="lg:col-span-3 flex flex-col border-r border-[var(--border)] overflow-hidden bg-white">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[13px] text-[var(--text-primary)] mb-3">
              Create Task
            </h2>

            {/* Team assignment */}
            {isAdminOrManager && brief.status !== "archived" && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-2">
                  Assigned Teams
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(teamsForBrief ?? []).filter((t): t is NonNullable<typeof t> => !!t).map((team) => (
                    <span
                      key={team._id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-white border border-[var(--border)]"
                      style={{ borderLeftWidth: 3, borderLeftColor: team.color }}
                    >
                      {team.name}
                      <button
                        type="button"
                        onClick={() => removeTeamFromBrief({ briefId, teamId: team._id })}
                        className="text-[var(--text-muted)] hover:text-[var(--danger)] ml-0.5"
                        title="Remove team"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {(teamsForBrief?.length ?? 0) === 0 && (
                    <span className="text-[11px] text-[var(--text-disabled)]">
                      No teams assigned
                    </span>
                  )}
                </div>
                {(allTeams ?? []).filter((t) => !teamsForBrief?.some((tb) => tb?._id === t._id)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {allTeams
                      ?.filter((t) => !teamsForBrief?.some((tb) => tb?._id === t._id))
                      .map((team) => (
                        <Button
                          key={team._id}
                          variant="ghost"
                          className="text-[11px] px-2 py-1 h-auto"
                          onClick={() =>
                            assignTeamsToBrief({
                              briefId,
                              teamIds: [
                                ...(teamsForBrief ?? []).map((t) => t?._id).filter((id): id is Id<"teams"> => !!id),
                                team._id,
                              ],
                            })
                          }
                        >
                          + {team.name}
                        </Button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Create task form */}
            {isAdminOrManager && brief.status !== "archived" ? (
              <form onSubmit={handleCreateTask} className="flex flex-col gap-3">
                <Input
                  label="Title"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  required
                />
                <Textarea
                  label="Description"
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="min-h-[60px]"
                />
                <Select
                  label="Assignee"
                  options={uniqueEmployees.map((e) => ({
                    value: e._id,
                    label: (e.name ?? e.email ?? "Unknown") as string,
                  }))}
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value as Id<"users">)}
                  placeholder={
                    teamsForBrief?.length
                      ? "Select employee"
                      : "Assign teams first"
                  }
                />
                <Input
                  label="Duration"
                  value={taskDuration}
                  onChange={(e) => setTaskDuration(e.target.value)}
                  placeholder="2h, 30m, 1d"
                />
                <Button type="submit" variant="primary">
                  Assign Task
                </Button>
              </form>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                {brief.status === "archived" ? "This brief is archived." : "Assign teams to begin task allocation."}
              </p>
            )}
          </div>

          {/* Task manifest */}
          <div className="flex-1 overflow-auto p-4">
            <h3 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              Task Manifest
            </h3>
            {tasksData?.byTeam &&
              Object.entries(tasksData.byTeam).map(([teamName, items]) => (
                <div key={teamName} className="mb-4">
                  <h4 className="font-medium text-[12px] text-[var(--text-secondary)] mb-2 pl-2 border-l-2 border-[var(--border-strong)]">
                    {teamName}
                  </h4>
                  {items.map(({ task, assignee }) => (
                    <div
                      key={task._id}
                      className="py-2 px-2 border-b border-[var(--border-subtle)]"
                    >
                      <div className="font-medium text-[13px] text-[var(--text-primary)]">
                        {task.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {assignee?.name ?? assignee?.email} &middot;{" "}
                        <span style={{ color: STATUS_LABELS[task.status]?.color ?? "var(--text-secondary)" }}>
                          {STATUS_LABELS[task.status]?.label ?? task.status}
                        </span>{" "}
                        &middot; {task.duration}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            {(!tasksData?.byTeam || Object.keys(tasksData.byTeam).length === 0) && (
              <p className="text-[12px] text-[var(--text-muted)]">No tasks yet.</p>
            )}
          </div>
        </div>

        {/* Column 2 - Task Overview & Progress */}
        <div className="hidden lg:flex lg:col-span-6 flex-col border-r border-[var(--border)] bg-[var(--bg-primary)] overflow-auto">
          <div className="p-6">
            {/* Brief info */}
            <div className="mb-6">
              <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-2">
                {brief.title}
              </h2>
              {brief.description && (
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {brief.description}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <Card className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-[13px] text-[var(--text-primary)]">
                  Overall Progress
                </span>
                <span className="font-semibold text-[13px] text-[var(--accent-admin)]">
                  {progressPct}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-employee)] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                {doneTasks} of {totalTasks} tasks completed
              </p>
            </Card>

            {/* Status columns */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {(Object.entries(STATUS_LABELS) as [string, { label: string; color: string }][]).map(([status, { label, color }]) => (
                <Card key={status} className="text-center p-4">
                  <p className="font-bold text-[24px] tabular-nums" style={{ color }}>
                    {tasksByStatus[status as keyof typeof tasksByStatus]?.length ?? 0}
                  </p>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-1">
                    {label}
                  </p>
                </Card>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[13px] text-[var(--text-primary)]">
                Tasks
              </h3>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)]">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  title="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  title="Kanban view"
                >
                  <Columns3 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {viewMode === "kanban" ? (
              /* Kanban Board */
              <div className="grid grid-cols-4 gap-3">
                {(["pending", "in-progress", "review", "done"] as const).map((status) => {
                  const info = STATUS_LABELS[status === "pending" ? "todo" : status] ?? STATUS_LABELS[status] ?? { label: status, color: "var(--text-secondary)" };
                  const colTasks = allTasks.filter((t) => t.status === status);
                  return (
                    <div key={status} className="flex flex-col">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b-2" style={{ borderColor: info.color }}>
                        <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                          {info.label}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                          {colTasks.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 min-h-[100px]">
                        {colTasks.map((task) => {
                          const assignee = tasksData?.byTeam
                            ? Object.values(tasksData.byTeam).flat().find((t) => t.task._id === task._id)?.assignee
                            : null;
                          const isBlocked = task.blockedBy && task.blockedBy.length > 0 &&
                            task.blockedBy.some((bId: string) => {
                              const blocker = allTasks.find((t) => t._id === bId);
                              return blocker && blocker.status !== "done";
                            });
                          return (
                            <div
                              key={task._id}
                              className={`p-2.5 rounded-lg border bg-white ${isBlocked ? "border-[var(--danger)] opacity-60" : "border-[var(--border-subtle)]"}`}
                            >
                              <div className="flex items-start gap-1.5">
                                {isBlocked && <Lock className="h-3 w-3 text-[var(--danger)] shrink-0 mt-0.5" />}
                                <p className="font-medium text-[11px] text-[var(--text-primary)] leading-tight">
                                  {task.title}
                                </p>
                              </div>
                              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                {assignee?.name ?? assignee?.email ?? "?"} &middot; {task.duration}
                              </p>
                              {/* Quick status change — admin/manager or task assignee (employees capped at review) */}
                              {(() => {
                                const rawNext = status === "pending" ? "in-progress" : status === "in-progress" ? "review" : "done";
                                const canMoveDone = isAdminOrManager;
                                const next = rawNext === "done" && !canMoveDone ? null : rawNext;
                                if (!next || status === "done" || isBlocked) return null;
                                if (!isAdminOrManager && task.assigneeId !== user?._id) return null;
                                return (
                                  <button
                                    onClick={() => updateTaskStatus({ taskId: task._id, newStatus: next as "pending" | "in-progress" | "review" | "done" })}
                                    className="mt-1.5 text-[9px] font-medium text-[var(--accent-admin)] hover:underline"
                                  >
                                    Move &rarr;
                                  </button>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List View */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allTasks.map((task) => {
                  const statusInfo = STATUS_LABELS[task.status] ?? { label: task.status, color: "var(--text-secondary)" };
                  const assignee = tasksData?.byTeam
                    ? Object.values(tasksData.byTeam).flat().find((t) => t.task._id === task._id)?.assignee
                    : null;
                  const isBlocked = task.blockedBy && task.blockedBy.length > 0 &&
                    task.blockedBy.some((bId: string) => {
                      const blocker = allTasks.find((t) => t._id === bId);
                      return blocker && blocker.status !== "done";
                    });
                  return (
                    <Card key={task._id} className={`p-4 ${isBlocked ? "opacity-60 border-[var(--danger)]" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {isBlocked && <Lock className="h-3 w-3 text-[var(--danger)] shrink-0" />}
                            <p className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                              {task.title}
                            </p>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                            {assignee?.name ?? assignee?.email ?? "Unassigned"} &middot; {task.duration}
                          </p>
                          {/* Quick status change — admin/manager or task assignee (employees capped at review) */}
                          {(() => {
                            const rawNext = task.status === "pending" ? "in-progress" : task.status === "in-progress" ? "review" : "done";
                            const canMoveDone = isAdminOrManager;
                            const next = rawNext === "done" && !canMoveDone ? null : rawNext;
                            if (!next || task.status === "done" || isBlocked) return null;
                            if (!isAdminOrManager && task.assigneeId !== user?._id) return null;
                            const label = next === "in-progress" ? "In Progress" : next === "review" ? "Review" : "Done";
                            return (
                              <button
                                onClick={() => updateTaskStatus({ taskId: task._id, newStatus: next as "pending" | "in-progress" | "review" | "done" })}
                                className="mt-1.5 text-[9px] font-medium text-[var(--accent-admin)] hover:underline"
                              >
                                Move to {label} &rarr;
                              </button>
                            );
                          })()}
                        </div>
                        <span
                          className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium"
                          style={{
                            color: statusInfo.color,
                            backgroundColor: `color-mix(in srgb, ${statusInfo.color} 12%, transparent)`,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                    </Card>
                  );
                })}
                {allTasks.length === 0 && (
                  <p className="text-[13px] text-[var(--text-muted)] col-span-2">
                    No tasks created yet. Use the panel on the left to create tasks.
                  </p>
                )}
              </div>
            )}

            {/* Attachments */}
            <div className="mt-6 space-y-6">
              <AttachmentList parentType="brief" parentId={briefId} />
              {/* Link to Discussions */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]">
                <MessageCircle className="h-4 w-4 text-[var(--accent-admin)]" />
                <span className="text-[12px] text-[var(--text-secondary)]">
                  Discussions have moved!
                </span>
                <a
                  href="/discussions"
                  className="text-[12px] font-medium text-[var(--accent-admin)] hover:underline ml-auto"
                >
                  Open Discussions &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3 - Team Load */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden bg-white">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[13px] text-[var(--text-primary)]">
              Team Load
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {graphData?.teams.map(({ team, members }) => (
              <div key={team._id} className="mb-5">
                <h3
                  className="font-semibold text-[12px] text-[var(--text-primary)] mb-2 pl-2"
                  style={{ borderLeft: `3px solid ${team.color}` }}
                >
                  {team.name}
                </h3>
                {members.map(({ user: emp, taskCount, totalHours }) => (
                  <Card key={emp._id} className="mb-2 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-[13px] text-[var(--text-primary)]">
                        {emp.name ?? emp.email ?? "Unknown"}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {totalHours.toFixed(1)}h
                      </span>
                    </div>
                    {(tasksData?.tasks ?? [])
                      .filter((t) => t.assigneeId === emp._id)
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((t, i) => {
                        const statusInfo = STATUS_LABELS[t.status];
                        return (
                          <div
                            key={t._id}
                            className="flex items-center gap-2 py-1 text-[12px]"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: statusInfo?.color ?? "var(--text-muted)" }}
                            />
                            <span className="text-[var(--text-primary)] truncate flex-1">{t.title}</span>
                            <span className="text-[var(--text-muted)] shrink-0">{t.duration}</span>
                          </div>
                        );
                      })}
                  </Card>
                ))}
              </div>
            ))}
            {!graphData?.teams?.length && (
              <p className="text-[12px] text-[var(--text-muted)]">
                Assign teams to this brief to see team load.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Brief"
        message="Permanently delete this brief and all its tasks? This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          await handleDelete();
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Save as Template Prompt */}
      <PromptModal
        open={showTemplatePrompt}
        title="Save as Template"
        message="Enter a name for this template."
        placeholder="Template name"
        defaultValue={brief?.title ?? ""}
        confirmLabel="Save"
        confirmingLabel="Saving..."
        onConfirm={async (name) => {
          await saveAsTemplate({ briefId, name });
          toast("success", "Saved as template");
          setShowTemplatePrompt(false);
        }}
        onCancel={() => setShowTemplatePrompt(false)}
      />
    </div>
  );
}
