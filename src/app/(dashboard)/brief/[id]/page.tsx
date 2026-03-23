"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, Textarea, useToast } from "@/components/ui";
import { AttachmentList } from "@/components/ui/AttachmentList";
import { TaskDetailModal } from "@/components/ui/TaskDetailModal";
import { Trash2, Calendar, Columns3, List, Lock, FileDown, MessageCircle, ArrowLeft, AlertTriangle, User, Clock, ClipboardList, FileText, Paperclip, UserPlus, Loader2, Pencil } from "lucide-react";
import { ContentCalendarView } from "@/components/ContentCalendarView";
import { CommentThread } from "@/components/comments/CommentThread";

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
  pending: { label: "Pending", color: "#6b7280" },
  todo: { label: "To Do", color: "#6b7280" },
  "in-progress": { label: "In Progress", color: "#f59e0b" },
  review: { label: "Review", color: "#8b5cf6" },
  done: { label: "Done", color: "#10b981" },
};

function SingleTaskBriefView({ brief, tasks, tasksData, isAdmin, user, onOpenTask, onUpdateStatus }: {
  brief: any;
  tasks: any[];
  tasksData: any;
  isAdmin: boolean;
  user: any;
  onOpenTask: (taskId: string) => void;
  onUpdateStatus: (taskId: Id<"tasks">, newStatus: "pending" | "in-progress" | "review" | "done") => void;
}) {
  const task = tasks[0];
  const taskId = task?._id as Id<"tasks"> | undefined;

  const deliverables = useQuery(api.approvals.listDeliverables, taskId ? { taskId } : "skip");
  const dailySummaries = useQuery(api.taskDailySummaries.listSummaries, taskId ? { taskId } : "skip");
  const subTasks = useQuery(api.tasks.getSubTasks, taskId ? { parentTaskId: taskId } : "skip");
  const graphData = useQuery(api.briefs.getBriefGraphData, { briefId: brief._id });
  const createSubTask = useMutation(api.tasks.createSubTask);

  const [showAddHelper, setShowAddHelper] = useState(false);
  const [helperAssignee, setHelperAssignee] = useState("");
  const [helperDesc, setHelperDesc] = useState("");
  const [helperDeadline, setHelperDeadline] = useState<number | undefined>(undefined);
  const [helperDeadlineTime, setHelperDeadlineTime] = useState("");
  const [isCreatingSubTask, setIsCreatingSubTask] = useState(false);

  const teamMembers = useMemo(() => {
    if (!graphData?.teams) return [];
    return graphData.teams.flatMap((t: any) =>
      t.members.map((m: any) => m.user).filter(Boolean)
    );
  }, [graphData]);

  const assigneeName = useMemo(() => {
    if (!task || !tasksData?.byTeam) return "Unassigned";
    for (const items of Object.values(tasksData.byTeam) as any[]) {
      for (const item of items) {
        if (item.task._id === task._id) return item.assignee?.name ?? item.assignee?.email ?? "Unassigned";
      }
    }
    return "Unassigned";
  }, [task, tasksData]);

  const assignerName = useMemo(() => {
    if (!task?.assignedBy || !tasksData?.users) return "—";
    const u = tasksData.users.find((u: any) => u._id === task.assignedBy);
    return u?.name ?? u?.email ?? "—";
  }, [task, tasksData]);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-[13px] text-[var(--text-muted)]">
          No task found for this single task brief. The task may still be loading.
        </p>
      </div>
    );
  }

  const statusStyle = STATUS_LABELS[task.status] ?? { label: task.status, color: "var(--text-secondary)" };
  const isDelivered = task.status === "done";

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
      {/* Left: Task Details + Daily Summaries */}
      <div className="border-r border-[var(--border)] overflow-auto p-5 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">{task.title}</h2>
            {isAdmin && !isDelivered && (
              <button
                onClick={() => onOpenTask(task._id)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
                title="Edit task"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2.5 py-0.5 font-medium text-[11px] rounded-full"
              style={{ color: statusStyle.color, backgroundColor: `color-mix(in srgb, ${statusStyle.color} 12%, transparent)` }}
            >{statusStyle.label}</span>
            {isDelivered && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-hover)]">
                🔒 Task Done by Employee
              </span>
            )}
            {!isDelivered && task.status !== "done" && (() => {
              const nextMap: Record<string, { status: "in-progress" | "review" | "done"; label: string }> = {
                pending: { status: "in-progress", label: "In Progress" },
                "in-progress": { status: "review", label: "Review" },
                review: { status: "done", label: "Done" },
              };
              const next = nextMap[task.status];
              if (!next) return null;
              if (next.status === "done" && !isAdmin) return null;
              return (
                <button
                  onClick={() => onUpdateStatus(task._id, next.status)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors"
                >
                  Move to {next.label} &rarr;
                </button>
              );
            })()}
          </div>
        </div>

        {(task.description || brief.description) && (
          <div>
            <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">Description</p>
            <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">{task.description || brief.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Assignee</p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              {assigneeName}
            </p>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Assigned By</p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              {assignerName}
            </p>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Duration</p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              {task.duration ?? "—"}
            </p>
          </div>
          {task.deadline && (
            <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Deadline</p>
              <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                {new Date(task.deadline).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Sub-tasks / Helpers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> Sub-Tasks ({subTasks?.length ?? 0})
            </p>
            {isAdmin && task.status !== "done" && (
              <button
                onClick={() => setShowAddHelper(!showAddHelper)}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
              >
                <UserPlus className="h-3 w-3" />
                Add Helper
              </button>
            )}
          </div>

          {showAddHelper && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!helperAssignee || !helperDesc.trim() || isCreatingSubTask || !taskId) return;
                setIsCreatingSubTask(true);
                try {
                  let finalDeadline = helperDeadline;
                  if (helperDeadline && helperDeadlineTime) {
                    const [hh, mm] = helperDeadlineTime.split(":").map(Number);
                    const d = new Date(helperDeadline);
                    d.setHours(hh, mm, 0, 0);
                    finalDeadline = d.getTime();
                  }
                  await createSubTask({
                    parentTaskId: taskId,
                    assigneeId: helperAssignee as Id<"users">,
                    description: helperDesc.trim(),
                    ...(finalDeadline ? { deadline: finalDeadline } : {}),
                  });
                  setHelperAssignee("");
                  setHelperDesc("");
                  setHelperDeadline(undefined);
                  setHelperDeadlineTime("");
                  setShowAddHelper(false);
                } finally {
                  setIsCreatingSubTask(false);
                }
              }}
              className="space-y-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] mb-3"
            >
              <select
                value={helperAssignee}
                onChange={(e) => setHelperAssignee(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                required
              >
                <option value="">Select team member...</option>
                {teamMembers.map((u: any) => (
                  <option key={u._id} value={u._id}>
                    {u.name ?? u.email ?? "Unknown"}
                  </option>
                ))}
              </select>
              <textarea
                value={helperDesc}
                onChange={(e) => setHelperDesc(e.target.value)}
                placeholder="Describe the sub-task..."
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] min-h-[50px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                required
              />
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">Deadline</label>
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <DatePicker value={helperDeadline} onChange={setHelperDeadline} placeholder="Set date" />
                  </div>
                  <input
                    type="time"
                    value={helperDeadlineTime}
                    onChange={(e) => setHelperDeadlineTime(e.target.value)}
                    className="w-24 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddHelper(false)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSubTask}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors disabled:opacity-50"
                >
                  {isCreatingSubTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                  {isCreatingSubTask ? "Adding..." : "Add Helper"}
                </button>
              </div>
            </form>
          )}

          {subTasks && subTasks.length > 0 ? (
            <div className="space-y-1.5">
              {subTasks.map((st: any) => (
                <div key={st._id} className="flex items-center justify-between bg-[var(--bg-primary)] rounded-lg px-3 py-2 border border-[var(--border-subtle)]">
                  <div>
                    <p className="text-[12px] font-medium text-[var(--text-primary)]">{st.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{st.assigneeName}</p>
                  </div>
                  <span
                    className="inline-flex items-center px-2 py-0.5 font-medium text-[10px] rounded-full"
                    style={{ color: STATUS_LABELS[st.status]?.color ?? "var(--text-secondary)", backgroundColor: `color-mix(in srgb, ${STATUS_LABELS[st.status]?.color ?? "var(--text-secondary)"} 12%, transparent)` }}
                  >{STATUS_LABELS[st.status]?.label ?? st.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">No helpers added yet.</p>
          )}
        </div>

        {/* Daily Summaries */}
        <div>
          <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Daily Summaries
          </p>
          {dailySummaries && dailySummaries.length > 0 ? (
            <div className="space-y-2">
              {dailySummaries.map((s: any, idx: number) => (
                <div key={s._id} className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
                  <p className="text-[11px] font-medium text-[var(--accent-admin)]">
                    Day {idx + 1} — {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-[13px] text-[var(--text-primary)] mt-1 whitespace-pre-wrap">{s.summary}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">No daily summaries yet.</p>
          )}
        </div>
      </div>

      {/* Right: Deliverables + Attachments + Comments */}
      <div className="overflow-auto p-5 space-y-5">
        {/* Deliverables */}
        <div>
          <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Deliverables ({deliverables?.length ?? 0})
          </p>
          {deliverables && deliverables.length > 0 ? (
            <div className="space-y-2">
              {deliverables.map((d: any) => {
                const badgeColor =
                  d.status === "approved" ? "var(--accent-employee)" :
                  d.status === "rejected" ? "#dc2626" :
                  d.status === "changes_requested" ? "#f59e0b" :
                  "var(--text-secondary)";
                return (
                  <Card key={d._id} className="!p-3">
                    <div className="flex items-center justify-between">
                      <div className="truncate mr-2">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{d.fileName ?? "Deliverable"}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          by {d.submitterName ?? "Unknown"} · {new Date(d.submittedAt ?? d._creationTime).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className="inline-flex items-center px-2 py-0.5 font-medium text-[10px] rounded-full"
                        style={{ color: badgeColor, backgroundColor: `color-mix(in srgb, ${badgeColor} 12%, transparent)` }}
                      >{d.status}</span>
                    </div>
                    {d.note && <p className="text-[11px] text-[var(--text-secondary)] mt-1">{d.note}</p>}
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">No deliverables submitted yet.</p>
          )}
        </div>

        {/* Attachments */}
        <div>
          <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">Attachments</p>
          <AttachmentList parentType="brief" parentId={brief._id} />
        </div>

        {/* Comments */}
        <div>
          <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> Comments
          </p>
          <CommentThread parentType="brief" parentId={brief._id} />
        </div>
      </div>
    </div>
  );
}

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
  const [taskTeamFilter, setTaskTeamFilter] = useState<string>("");
  const [taskAssignee, setTaskAssignee] = useState<Id<"users"> | "">("");
  const [taskDeadline, setTaskDeadline] = useState<number | undefined>(undefined);
  const [taskDeadlineTime, setTaskDeadlineTime] = useState("");
  const [taskClientFacing, setTaskClientFacing] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { toast } = useToast();
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);

  const briefTeamsList = graphData?.teams ?? [];
  const employeesInBriefTeams =
    briefTeamsList.flatMap((t) => t.members.map((m) => m.user)) ?? [];
  const uniqueEmployees = [...new Map(employeesInBriefTeams.map((e) => [e._id, e])).values()];

  const filteredEmployees = taskTeamFilter
    ? briefTeamsList
        .find((t) => t.team._id === taskTeamFilter)
        ?.members.map((m) => m.user) ?? []
    : uniqueEmployees;

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
    let finalDeadline = taskDeadline;
    if (taskDeadline !== undefined && taskDeadlineTime) {
      const [hh, mm] = taskDeadlineTime.split(":").map(Number);
      const d = new Date(taskDeadline);
      d.setHours(hh, mm, 0, 0);
      finalDeadline = d.getTime();
    }
    try {
      await createTask({
        briefId,
        title: taskTitle,
        description: taskDesc || undefined,
        assigneeId: taskAssignee as Id<"users">,
        ...(finalDeadline !== undefined ? { deadline: finalDeadline } : {}),
        ...(taskClientFacing ? { clientFacing: true } : {}),
      });
      setTaskTitle("");
      setTaskDesc("");
      setTaskTeamFilter("");
      setTaskAssignee("");
      setTaskDeadline(undefined);
      setTaskDeadlineTime("");
      setTaskClientFacing(false);
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

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Brief Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--border)] bg-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => router.push("/briefs")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium text-[var(--accent-admin)] bg-[var(--accent-admin-dim)] hover:bg-[var(--accent-admin)] hover:text-white transition-all shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Briefs
          </button>
          <div className="h-4 w-px bg-[var(--border)] hidden sm:block" aria-hidden />
          {isAdmin && brief.status !== "archived" ? (
            <input
              className="font-semibold text-[15px] sm:text-[16px] text-[var(--text-primary)] truncate bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent-admin)] focus:outline-none px-1 -ml-1 min-w-0"
              defaultValue={brief.title}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val && val !== brief.title) updateBrief({ briefId, title: val });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <h1 className="font-semibold text-[15px] sm:text-[16px] text-[var(--text-primary)] truncate">
              {brief.title}
            </h1>
          )}
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
          {brief.briefType && (
            <Badge variant="neutral">
              {brief.briefType === "content_calendar" ? "Content Calendar" :
               brief.briefType === "video_editing" ? "Video Editing" :
               brief.briefType === "developmental" ? "Developmental" :
               brief.briefType === "designing" ? "Designing" : brief.briefType}
            </Badge>
          )}
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
          {isAdmin && brief.status !== "archived" && (
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
                <option value="rejected">Rejected</option>
                <option value="on_hold">On Hold</option>
                <option value="sent_to_client">Sent to Client</option>
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
          {/* Edit brief */}
          {isAdmin && brief.status !== "archived" && (
            <button
              onClick={() => {
                const titleInput = document.querySelector<HTMLInputElement>('header input[class*="font-semibold"]');
                if (titleInput) { titleInput.focus(); titleInput.select(); }
              }}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-all no-print"
              title="Edit brief"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
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

      {/* Content Calendar briefs get a full-width spreadsheet layout */}
      {brief.briefType === "content_calendar" ? (
        <div className="flex-1 overflow-hidden">
          <ContentCalendarView briefId={briefId} isEditable={!!isAdmin} brandId={brief?.brandId} />
        </div>
      ) : brief.briefType === "single_task" ? (
        <SingleTaskBriefView
          brief={brief}
          tasks={allTasks}
          tasksData={tasksData}
          isAdmin={!!isAdmin}
          user={user}
          onOpenTask={(taskId) => setSelectedTaskId(taskId)}
          onUpdateStatus={async (taskId, newStatus) => {
            try {
              await updateTaskStatus({ taskId, newStatus });
              toast("success", `Task moved to ${newStatus}`);
            } catch (err) {
              toast("error", err instanceof Error ? err.message : "Failed to update status");
            }
          }}
        />
      ) : (
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Column 1 - Create Task + Task List */}
        <div className="lg:col-span-3 border-r border-[var(--border)] overflow-auto bg-white">
          <div>
          <div className="p-4">
            <h2 className="font-semibold text-[13px] text-[var(--text-primary)] mb-3">
              Create Task
            </h2>

            {/* Team assignment */}
            {isAdmin && brief.status !== "archived" && (
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
            {isAdmin && brief.status !== "archived" ? (
              <form onSubmit={handleCreateTask} className="flex flex-col gap-2">
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
                  className="min-h-[48px]"
                />
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Team</label>
                  <select
                    value={taskTeamFilter}
                    onChange={(e) => { setTaskTeamFilter(e.target.value); setTaskAssignee(""); }}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">All teams</option>
                    {briefTeamsList.map((t) => (
                      <option key={t.team._id} value={t.team._id}>{t.team.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value as Id<"users">)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">{teamsForBrief?.length ? "Select employee" : "Assign teams first"}</option>
                    {filteredEmployees.map((e) => (
                      <option key={e._id} value={e._id}>{(e.name ?? e.email ?? "Unknown") as string}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Deadline</label>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <DatePicker
                        value={taskDeadline}
                        onChange={setTaskDeadline}
                        placeholder="Set date"
                      />
                    </div>
                    <input
                      type="time"
                      value={taskDeadlineTime}
                      onChange={(e) => setTaskDeadlineTime(e.target.value)}
                      className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
                  <input
                    type="checkbox"
                    checked={taskClientFacing}
                    onChange={(e) => setTaskClientFacing(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--accent-admin)]"
                  />
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">Client-facing task</span>
                </label>
                <Button type="submit" variant="primary" className="mt-2">
                  Assign Task
                </Button>
              </form>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                {brief.status === "archived" ? "This brief is archived." : "Assign teams to begin task allocation."}
              </p>
            )}
          </div>

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
              {isAdmin && brief.status !== "archived" ? (
                <textarea
                  className="w-full text-[13px] text-[var(--text-secondary)] leading-relaxed bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--accent-admin)] focus:outline-none rounded-lg px-2 py-1 -ml-2 resize-none"
                  defaultValue={brief.description}
                  rows={2}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== brief.description) updateBrief({ briefId, description: val });
                  }}
                />
              ) : brief.description ? (
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {brief.description}
                </p>
              ) : null}
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
                              onClick={() => setSelectedTaskId(task._id)}
                              className={`p-2.5 rounded-lg border bg-white cursor-pointer hover:shadow-sm transition-shadow ${isBlocked ? "border-[var(--danger)] opacity-60" : !assignee ? "border-amber-400" : "border-[var(--border-subtle)]"}`}
                            >
                              <div className="flex items-start gap-1.5">
                                {isBlocked && <Lock className="h-3 w-3 text-[var(--danger)] shrink-0 mt-0.5" />}
                                <p className="font-medium text-[11px] text-[var(--text-primary)] leading-tight">
                                  {task.title}
                                </p>
                              </div>
                              {!assignee ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                  <span className="text-[10px] font-medium text-amber-600">
                                    Unassigned — Reassign
                                  </span>
                                </div>
                              ) : (
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                  {assignee.name ?? assignee.email}{task.duration ? ` · ${task.duration}` : ""}
                                </p>
                              )}
                              {(() => {
                                const rawNext = status === "pending" ? "in-progress" : status === "in-progress" ? "review" : "done";
                                const canMoveDone = isAdmin;
                                const next = rawNext === "done" && !canMoveDone ? null : rawNext;
                                if (!next || status === "done" || isBlocked) return null;
                                if (!isAdmin && task.assigneeId !== user?._id) return null;
                                return (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); updateTaskStatus({ taskId: task._id, newStatus: next as "pending" | "in-progress" | "review" | "done" }); }}
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
                    <Card key={task._id} className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${isBlocked ? "opacity-60 border-[var(--danger)]" : !assignee ? "border-amber-400" : ""}`} onClick={() => setSelectedTaskId(task._id)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {isBlocked && <Lock className="h-3 w-3 text-[var(--danger)] shrink-0" />}
                            <p className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                              {task.title}
                            </p>
                          </div>
                          {!assignee ? (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="text-[11px] font-medium text-amber-600">
                                Unassigned — Click to reassign
                              </span>
                            </div>
                          ) : (
                            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                              {assignee.name ?? assignee.email}{task.duration ? ` · ${task.duration}` : ""}
                            </p>
                          )}
                          {(() => {
                            const rawNext = task.status === "pending" ? "in-progress" : task.status === "in-progress" ? "review" : "done";
                            const canMoveDone = isAdmin;
                            const next = rawNext === "done" && !canMoveDone ? null : rawNext;
                            if (!next || task.status === "done" || isBlocked) return null;
                            if (!isAdmin && task.assigneeId !== user?._id) return null;
                            const label = next === "in-progress" ? "In Progress" : next === "review" ? "Review" : "Done";
                            return (
                              <button
                                onClick={(e) => { e.stopPropagation(); updateTaskStatus({ taskId: task._id, newStatus: next as "pending" | "in-progress" | "review" | "done" }); }}
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
                            {t.deadlineExtended && (
                              <span className="px-1 py-0.5 rounded text-[8px] font-semibold bg-yellow-50 text-yellow-700 shrink-0">EXT</span>
                            )}
                            {t.deadline && (
                              <span className="text-[var(--text-muted)] shrink-0 text-[10px]">
                                {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            )}
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
      )}

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


      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
