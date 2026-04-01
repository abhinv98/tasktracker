"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, Textarea, useToast } from "@/components/ui";
import { AttachmentList } from "@/components/ui/AttachmentList";
import { TaskDetailModal } from "@/components/ui/TaskDetailModal";
import { Trash2, Calendar, Columns3, List, Lock, FileDown, MessageCircle, ArrowLeft, AlertTriangle, User, Clock, ClipboardList, FileText, Paperclip, UserPlus, Loader2, Pencil, Plus, X, ChevronRight, ChevronUp, ChevronDown, ArrowRight, GripVertical, Link2 } from "lucide-react";
import { ContentCalendarView } from "@/components/ContentCalendarView";
import { CommentThread } from "@/components/comments/CommentThread";
import { briefUsesCreativeSlots, creativesSlotTarget } from "@/lib/briefCreatives";

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
  // Handoff tasks should NOT show creative slots — they reference the original deliverables
  const isHandoffTask = !!task?.handoffSourceTaskId;
  const showCreativeSlots = !isHandoffTask && briefUsesCreativeSlots(brief);
  const creativesRequired = creativesSlotTarget(brief);
  const sortedDeliverables = useMemo(
    () => [...(deliverables ?? [])].sort((a: any, b: any) => a.submittedAt - b.submittedAt),
    [deliverables]
  );
  const emptyDeliverableSlots = showCreativeSlots
    ? Math.max(0, creativesRequired - sortedDeliverables.length)
    : 0;
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
          <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Deliverables
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mb-2">
            {showCreativeSlots
              ? `${sortedDeliverables.length} / ${creativesRequired} creative${creativesRequired !== 1 ? "s" : ""} submitted`
              : `${sortedDeliverables.length} deliverable${sortedDeliverables.length !== 1 ? "s" : ""} submitted`}
          </p>
          <div className="space-y-2">
            {sortedDeliverables.map((d: any, idx: number) => {
              const badgeColor =
                d.status === "approved" ? "var(--accent-employee)" :
                d.status === "rejected" ? "#dc2626" :
                d.status === "changes_requested" ? "#f59e0b" :
                "var(--text-secondary)";
              return (
                <Card key={d._id} className="!p-3">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                    {showCreativeSlots ? `Creative ${idx + 1}` : `Deliverable ${idx + 1}`}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="truncate mr-2">
                      <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{d.message ?? d.fileName ?? "Deliverable"}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        by {d.submitterName ?? "Unknown"} · {new Date(d.submittedAt ?? d._creationTime).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center px-2 py-0.5 font-medium text-[10px] rounded-full"
                      style={{ color: badgeColor, backgroundColor: `color-mix(in srgb, ${badgeColor} 12%, transparent)` }}
                    >{d.status}</span>
                  </div>
                  {(d.note || d.reviewNote) && (
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">{d.note ?? d.reviewNote}</p>
                  )}
                </Card>
              );
            })}
            {showCreativeSlots &&
              Array.from({ length: emptyDeliverableSlots }).map((_, j) => {
              const n = sortedDeliverables.length + j + 1;
              return (
                <div
                  key={`slot-${n}`}
                  className="rounded-lg border border-dashed border-[var(--border)] p-3 bg-[var(--bg-hover)]/40"
                >
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
                    Creative {n}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] italic">Not submitted yet</p>
                </div>
              );
            })}
            {sortedDeliverables.length === 0 && emptyDeliverableSlots === 0 && (
              <p className="text-[12px] text-[var(--text-muted)]">No deliverables submitted yet.</p>
            )}
          </div>
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

  // Task connections & team ordering
  const taskConnections = useQuery(api.briefs.listTaskConnections, { briefId });
  const addTaskConnection = useMutation(api.briefs.addTaskConnection);
  const removeTaskConnection = useMutation(api.briefs.removeTaskConnection);
  const updateTeamOrder = useMutation(api.briefs.updateTeamOrder);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskTeamFilter, setTaskTeamFilter] = useState<string>("");
  const [taskAssignee, setTaskAssignee] = useState<Id<"users"> | "">("");
  const [taskDeadline, setTaskDeadline] = useState<number | undefined>(undefined);
  const [taskDeadlineTime, setTaskDeadlineTime] = useState("");
  const [taskClientFacing, setTaskClientFacing] = useState(false);
  const [taskHandoffTeam, setTaskHandoffTeam] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [autoEditTask, setAutoEditTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);

  // Flowchart panel state
  const [panelMode, setPanelMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [panelTeamId, setPanelTeamId] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showTeamPicker, setShowTeamPicker] = useState(false);

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
        ...(taskHandoffTeam ? { handoffTargetTeamId: taskHandoffTeam as Id<"teams"> } : {}),
      });
      setTaskTitle("");
      setTaskDesc("");
      setTaskTeamFilter("");
      setTaskAssignee("");
      setTaskDeadline(undefined);
      setTaskDeadlineTime("");
      setTaskClientFacing(false);
      setTaskHandoffTeam("");
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
            <div className="relative">
              <button
                onClick={() => setShowEditMenu(!showEditMenu)}
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-all no-print"
                title="Edit brief"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {showEditMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowEditMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-xl border border-[var(--border)] py-1 min-w-[240px] max-w-[320px] max-h-[400px] overflow-auto animate-scaleIn">
                    {/* Brief fields */}
                    <div className="px-3 py-1.5">
                      <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Brief</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowEditMenu(false);
                        const titleInput = document.querySelector<HTMLInputElement>('header input[class*="font-semibold"]');
                        if (titleInput) { titleInput.focus(); titleInput.select(); }
                      }}
                      className="w-full text-left px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
                    >
                      <Pencil className="h-3 w-3 text-[var(--text-muted)]" />
                      Edit Brief Title & Description
                    </button>

                    {/* Tasks / Events */}
                    {allTasks.length > 0 && (
                      <>
                        <div className="border-t border-[var(--border-subtle)] mt-1" />
                        <div className="px-3 py-1.5">
                          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                            {brief.briefType === "content_calendar" ? "Calendar Events" : "Tasks"}
                          </p>
                        </div>
                        {allTasks.map((task) => {
                          const sc = task.status === "done" ? "#10b981" : task.status === "in-progress" ? "#f59e0b" : task.status === "review" ? "#8b5cf6" : "#6b7280";
                          return (
                            <button
                              key={task._id}
                              onClick={() => {
                                setShowEditMenu(false);
                                setAutoEditTask(true);
                                setSelectedTaskId(task._id);
                              }}
                              className="w-full text-left px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sc }} />
                              <span className="truncate flex-1">{task.title}</span>
                              <span className="text-[10px] text-[var(--text-muted)] shrink-0 capitalize">{task.status}</span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
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
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── LEFT: Flowchart Canvas ───────────────────────── */}
        <div className={`flex-1 overflow-auto bg-[var(--bg-primary)] transition-all duration-300 ${panelMode !== "hidden" ? "mr-[420px]" : ""}`}>
          <div className="p-6">
            {/* Brief description (editable) */}
            <div className="mb-5">
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
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{brief.description}</p>
              ) : null}
            </div>

            {/* Progress summary row */}
            <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-white border border-[var(--border-subtle)]">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">Progress</span>
                  <span className="text-[12px] font-semibold text-[var(--accent-admin)]">{progressPct}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--accent-employee)] transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              {(Object.entries(STATUS_LABELS) as [string, { label: string; color: string }][]).map(([status, { label, color }]) => (
                <div key={status} className="text-center min-w-[48px]">
                  <p className="font-bold text-[16px] tabular-nums" style={{ color }}>
                    {tasksByStatus[status as keyof typeof tasksByStatus]?.length ?? 0}
                  </p>
                  <p className="text-[9px] font-medium text-[var(--text-muted)]">{label}</p>
                </div>
              ))}
            </div>

            {/* Team picker */}
            {isAdmin && brief.status !== "archived" && (
              <div className="mb-6 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">Teams:</span>
                {(teamsForBrief ?? []).filter((t): t is NonNullable<typeof t> => !!t).map((team, idx) => (
                  <span
                    key={team._id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-white border border-[var(--border)]"
                    style={{ borderLeftWidth: 3, borderLeftColor: team.color }}
                  >
                    <span className="text-[9px] text-[var(--text-muted)] mr-0.5">{idx + 1}.</span>
                    {team.name}
                    {/* Move up/down */}
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const teams = (teamsForBrief ?? []).filter(Boolean) as any[];
                          const orders = teams.map((t: any, i: number) => ({ teamId: t._id as Id<"teams">, order: i }));
                          // Swap this and previous
                          const prev = orders[idx - 1];
                          orders[idx - 1] = { ...orders[idx - 1], order: idx - 1, teamId: orders[idx].teamId };
                          orders[idx] = { ...orders[idx], order: idx, teamId: prev.teamId };
                          updateTeamOrder({ briefId, teamOrders: orders });
                        }}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Move up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                    )}
                    {idx < (teamsForBrief?.length ?? 0) - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const teams = (teamsForBrief ?? []).filter(Boolean) as any[];
                          const orders = teams.map((t: any, i: number) => ({ teamId: t._id as Id<"teams">, order: i }));
                          const next = orders[idx + 1];
                          orders[idx + 1] = { ...orders[idx + 1], order: idx + 1, teamId: orders[idx].teamId };
                          orders[idx] = { ...orders[idx], order: idx, teamId: next.teamId };
                          updateTeamOrder({ briefId, teamOrders: orders });
                        }}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Move down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTeamFromBrief({ briefId, teamId: team._id })}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] ml-0.5"
                      title="Remove team"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTeamPicker(!showTeamPicker)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] hover:bg-[var(--accent-admin)] hover:text-white transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Team
                  </button>
                  {showTeamPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowTeamPicker(false)} />
                      <div className="absolute left-0 top-full mt-1 z-40 bg-white rounded-lg shadow-xl border border-[var(--border)] py-1 min-w-[160px]">
                        {(allTeams ?? [])
                          .filter((t) => !teamsForBrief?.some((tb) => tb?._id === t._id))
                          .map((team) => (
                            <button
                              key={team._id}
                              onClick={() => {
                                assignTeamsToBrief({
                                  briefId,
                                  teamIds: [
                                    ...(teamsForBrief ?? []).map((t) => t?._id).filter((id): id is Id<"teams"> => !!id),
                                    team._id,
                                  ],
                                });
                                setShowTeamPicker(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                              {team.name}
                            </button>
                          ))}
                        {(allTeams ?? []).filter((t) => !teamsForBrief?.some((tb) => tb?._id === t._id)).length === 0 && (
                          <p className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">All teams assigned</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Sequential Flowchart ─────────────────────── */}
            {(teamsForBrief?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-center">
                <div>
                  <ClipboardList className="h-10 w-10 text-[var(--text-disabled)] mx-auto mb-3" />
                  <p className="text-[14px] font-medium text-[var(--text-secondary)]">No teams assigned</p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">Add teams above to start building the task flow.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                {(teamsForBrief ?? []).filter(Boolean).map((team: any, teamIdx: number) => {
                  const teamTasks = allTasks.filter((t) => {
                    // Find which team the assignee belongs to
                    const memberTeam = briefTeamsList.find((bt) =>
                      bt.members.some((m) => m.user._id === t.assigneeId)
                    );
                    return memberTeam?.team._id === team._id;
                  });

                  return (
                    <div key={team._id} className="relative">
                      {/* Team connector arrow (between team sections) */}
                      {teamIdx > 0 && (
                        <div className="flex justify-center py-2">
                          <div className="w-px h-6 bg-[var(--border)]" />
                        </div>
                      )}

                      {/* Team section */}
                      <div
                        className="rounded-xl border-2 bg-white overflow-hidden"
                        style={{ borderColor: `color-mix(in srgb, ${team.color} 40%, transparent)` }}
                      >
                        {/* Team header */}
                        <div
                          className="px-4 py-2.5 flex items-center justify-between"
                          style={{ backgroundColor: `color-mix(in srgb, ${team.color} 8%, transparent)` }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                            <h3 className="font-semibold text-[13px] text-[var(--text-primary)]">
                              {team.name}
                            </h3>
                            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                              {teamTasks.length} task{teamTasks.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {isAdmin && brief.status !== "archived" && (
                            <button
                              onClick={() => {
                                setPanelMode("create");
                                setPanelTeamId(team._id);
                                setTaskTeamFilter(team._id);
                                setTaskTitle("");
                                setTaskDesc("");
                                setTaskAssignee("");
                                setTaskDeadline(undefined);
                                setTaskDeadlineTime("");
                                setTaskClientFacing(false);
                                setTaskHandoffTeam("");
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-[var(--accent-admin)] hover:bg-white transition-colors"
                            >
                              <Plus className="h-3 w-3" /> Add Task
                            </button>
                          )}
                        </div>

                        {/* Task chips */}
                        <div className="p-3">
                          {teamTasks.length === 0 ? (
                            <p className="text-[11px] text-[var(--text-muted)] text-center py-4">
                              No tasks yet. Click &ldquo;Add Task&rdquo; to create one.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {teamTasks.map((task) => {
                                const statusInfo = STATUS_LABELS[task.status] ?? { label: task.status, color: "#6b7280" };
                                const assignee = tasksData?.byTeam
                                  ? Object.values(tasksData.byTeam).flat().find((t) => t.task._id === task._id)?.assignee
                                  : null;
                                const outgoing = (taskConnections ?? []).filter((c) => c.sourceTaskId === task._id);
                                const incoming = (taskConnections ?? []).filter((c) => c.targetTaskId === task._id);
                                const isConnecting = connectingFrom === task._id;

                                return (
                                  <div key={task._id} className="relative group">
                                    <div
                                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                                        isConnecting
                                          ? "border-[var(--accent-admin)] ring-2 ring-[var(--accent-admin)] ring-opacity-30 bg-[var(--accent-admin-dim)]"
                                          : connectingFrom && connectingFrom !== task._id
                                            ? "border-blue-300 bg-blue-50 hover:border-blue-500"
                                            : "border-[var(--border)] bg-white hover:border-[var(--text-muted)]"
                                      }`}
                                      onClick={() => {
                                        if (connectingFrom && connectingFrom !== task._id) {
                                          // Complete the connection
                                          addTaskConnection({
                                            briefId,
                                            sourceTaskId: connectingFrom as Id<"tasks">,
                                            targetTaskId: task._id,
                                          });
                                          setConnectingFrom(null);
                                        } else if (connectingFrom === task._id) {
                                          setConnectingFrom(null);
                                        } else {
                                          // Open task detail
                                          setSelectedTaskId(task._id);
                                        }
                                      }}
                                    >
                                      {/* Status dot */}
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: statusInfo.color }}
                                      />
                                      {/* Task info */}
                                      <div className="min-w-0">
                                        <p className="text-[12px] font-medium text-[var(--text-primary)] leading-tight truncate max-w-[160px]">
                                          {task.title}
                                        </p>
                                        <p className="text-[10px] text-[var(--text-muted)] truncate">
                                          {assignee ? (assignee.name ?? assignee.email) : "Unassigned"}
                                          {task.deadline ? ` · ${new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                                        </p>
                                      </div>
                                      {/* Connection indicators */}
                                      {(outgoing.length > 0 || incoming.length > 0) && (
                                        <span className="text-[8px] font-semibold text-[var(--accent-admin)] bg-[var(--accent-admin-dim)] px-1 py-0.5 rounded">
                                          {incoming.length > 0 && `${incoming.length}→`}{outgoing.length > 0 && `→${outgoing.length}`}
                                        </span>
                                      )}
                                    </div>

                                    {/* Hover actions */}
                                    {isAdmin && brief.status !== "archived" && !connectingFrom && (
                                      <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConnectingFrom(task._id);
                                          }}
                                          className="p-1 rounded-full bg-[var(--accent-admin)] text-white shadow-sm hover:bg-[var(--accent-admin-hover)] transition-colors"
                                          title="Connect to another task"
                                        >
                                          <Link2 className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setAutoEditTask(true);
                                            setSelectedTaskId(task._id);
                                          }}
                                          className="p-1 rounded-full bg-white border border-[var(--border)] text-[var(--text-muted)] shadow-sm hover:text-[var(--text-primary)] transition-colors"
                                          title="Edit task"
                                        >
                                          <Pencil className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Connection mode banner */}
            {connectingFrom && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[var(--accent-admin)] text-white shadow-lg flex items-center gap-3 text-[12px] font-medium">
                <Link2 className="h-4 w-4" />
                <span>Click a target task to create a connection</span>
                <button
                  onClick={() => setConnectingFrom(null)}
                  className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Connections list */}
            {(taskConnections ?? []).length > 0 && (
              <div className="mt-6">
                <h3 className="text-[12px] font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" /> Task Connections
                </h3>
                <div className="space-y-1.5">
                  {(taskConnections ?? []).map((conn) => {
                    const srcTask = allTasks.find((t) => t._id === conn.sourceTaskId);
                    const tgtTask = allTasks.find((t) => t._id === conn.targetTaskId);
                    if (!srcTask || !tgtTask) return null;
                    return (
                      <div
                        key={conn._id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[var(--border-subtle)] text-[11px]"
                      >
                        <span className="font-medium text-[var(--text-primary)] truncate max-w-[200px]">{srcTask.title}</span>
                        <ArrowRight className="h-3 w-3 text-[var(--accent-admin)] shrink-0" />
                        <span className="font-medium text-[var(--text-primary)] truncate max-w-[200px]">{tgtTask.title}</span>
                        {isAdmin && (
                          <button
                            onClick={() => removeTaskConnection({ connectionId: conn._id })}
                            className="ml-auto text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0"
                            title="Remove connection"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attachments & discussions */}
            <div className="mt-6 space-y-6">
              <AttachmentList parentType="brief" parentId={briefId} />
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]">
                <MessageCircle className="h-4 w-4 text-[var(--accent-admin)]" />
                <span className="text-[12px] text-[var(--text-secondary)]">Discussions have moved!</span>
                <a href="/discussions" className="text-[12px] font-medium text-[var(--accent-admin)] hover:underline ml-auto">
                  Open Discussions &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Sliding Task Panel ─────────────────── */}
        <div
          className={`absolute top-0 right-0 h-full w-[420px] bg-white border-l border-[var(--border)] shadow-xl transition-transform duration-300 ease-in-out z-20 flex flex-col ${
            panelMode !== "hidden" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
              {panelMode === "create" ? "Create Task" : "Edit Task"}
            </h3>
            <button
              onClick={() => {
                setPanelMode("hidden");
                setEditingTaskId(null);
              }}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Panel body - create form */}
          <div className="flex-1 overflow-auto p-4">
            {panelMode === "create" && isAdmin && (
              <form
                onSubmit={async (e) => {
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
                      ...(taskHandoffTeam ? { handoffTargetTeamId: taskHandoffTeam as Id<"teams"> } : {}),
                    });
                    setTaskTitle("");
                    setTaskDesc("");
                    setTaskAssignee("");
                    setTaskDeadline(undefined);
                    setTaskDeadlineTime("");
                    setTaskClientFacing(false);
                    setTaskHandoffTeam("");
                    toast("success", "Task created");
                    // Keep panel open for adding more tasks to same team
                  } catch (err) {
                    toast("error", err instanceof Error ? err.message : "Failed to create task");
                  }
                }}
                className="flex flex-col gap-3"
              >
                {/* Team indicator */}
                {panelTeamId && (() => {
                  const team = (teamsForBrief ?? []).find((t) => t?._id === panelTeamId);
                  return team ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">{team.name}</span>
                    </div>
                  ) : null;
                })()}

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
                  className="min-h-[64px]"
                />
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value as Id<"users">)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">Select employee</option>
                    {(panelTeamId
                      ? briefTeamsList.find((t) => t.team._id === panelTeamId)?.members.map((m) => m.user) ?? []
                      : uniqueEmployees
                    ).map((e) => (
                      <option key={e._id} value={e._id}>{(e.name ?? e.email ?? "Unknown") as string}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Deadline</label>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <DatePicker value={taskDeadline} onChange={setTaskDeadline} placeholder="Set date" />
                    </div>
                    <input
                      type="time"
                      value={taskDeadlineTime}
                      onChange={(e) => setTaskDeadlineTime(e.target.value)}
                      className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={taskClientFacing}
                    onChange={(e) => setTaskClientFacing(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--accent-admin)]"
                  />
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">Client-facing task</span>
                </label>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Handoff Team (optional)</label>
                  <select
                    value={taskHandoffTeam}
                    onChange={(e) => setTaskHandoffTeam(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">No handoff</option>
                    {(allTeams ?? []).map((t) => (
                      <option key={t._id} value={t._id}>{t.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    On approval, deliverable will be handed off to this team
                  </p>
                </div>
                <Button type="submit" variant="primary" className="mt-2">
                  Create Task
                </Button>
              </form>
            )}
            {panelMode !== "create" && panelMode !== "hidden" && editingTaskId && (
              <div className="text-[13px] text-[var(--text-secondary)]">
                <p>Use the task detail modal to edit task details.</p>
              </div>
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
          onClose={() => { setSelectedTaskId(null); setAutoEditTask(false); }}
          autoEdit={autoEditTask}
        />
      )}
    </div>
  );
}
