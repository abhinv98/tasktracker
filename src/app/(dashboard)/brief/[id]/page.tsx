"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, Textarea, useToast } from "@/components/ui";
import { AttachmentList } from "@/components/ui/AttachmentList";
import { TaskDetailModal } from "@/components/ui/TaskDetailModal";
import { Trash2, Calendar, Lock, FileDown, MessageCircle, ArrowLeft, AlertTriangle, User, Clock, ClipboardList, FileText, Paperclip, UserPlus, Loader2, Pencil, Plus, X } from "lucide-react";
import { ContentCalendarView } from "@/components/ContentCalendarView";
import { CommentThread } from "@/components/comments/CommentThread";
import { briefUsesCreativeSlots, creativesSlotTarget } from "@/lib/briefCreatives";
import { BriefFlowCanvas } from "@/components/BriefFlowCanvas";

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

  // Task connections
  const taskConnections = useQuery(api.briefs.listTaskConnections, { briefId });

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskTeamFilter, setTaskTeamFilter] = useState<string>("");
  const [taskAssignee, setTaskAssignee] = useState<Id<"users"> | "">("");
  const [taskDeadline, setTaskDeadline] = useState<number | undefined>(undefined);
  const [taskDeadlineTime, setTaskDeadlineTime] = useState("");
  const [taskClientFacing, setTaskClientFacing] = useState(false);
  const [taskHandoffTeam, setTaskHandoffTeam] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [autoEditTask, setAutoEditTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);

  // Flowchart panel state
  const [panelMode, setPanelMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [panelTeamId, setPanelTeamId] = useState<string>("");
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  const { toast } = useToast();
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);

  const briefTeamsList = graphData?.teams ?? [];
  const employeesInBriefTeams =
    briefTeamsList.flatMap((t) => t.members.map((m) => m.user)) ?? [];
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
        {/* ── FLOW CANVAS (React Flow) ─────────────────────── */}
        <div className={`flex-1 overflow-hidden transition-all duration-300 ${panelMode !== "hidden" ? "mr-[420px]" : ""}`}>
          {/* Top toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-white z-10 relative">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Progress</span>
              <div className="w-24 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent-employee)]" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[11px] font-semibold text-[var(--accent-admin)] tabular-nums">{progressPct}%</span>
              <span className="text-[10px] text-[var(--text-muted)]">({doneTasks}/{totalTasks})</span>
            </div>

            {/* Team pills */}
            {isAdmin && brief.status !== "archived" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {(teamsForBrief ?? []).filter(Boolean).map((team: any, idx: number) => (
                  <span
                    key={team._id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-white border border-[var(--border)]"
                    style={{ borderLeftWidth: 3, borderLeftColor: team.color }}
                  >
                    {team.name}
                    <button
                      type="button"
                      onClick={() => removeTeamFromBrief({ briefId, teamId: team._id })}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTeamPicker(!showTeamPicker)}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium rounded-full bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] hover:bg-[var(--accent-admin)] hover:text-white transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" /> Team
                  </button>
                  {showTeamPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowTeamPicker(false)} />
                      <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-lg shadow-xl border border-[var(--border)] py-1 min-w-[140px]">
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
                              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                              {team.name}
                            </button>
                          ))}
                        {(allTeams ?? []).filter((t) => !teamsForBrief?.some((tb) => tb?._id === t._id)).length === 0 && (
                          <p className="px-3 py-1.5 text-[10px] text-[var(--text-muted)]">All teams added</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* React Flow canvas */}
          <div className="flex-1" style={{ height: "calc(100% - 42px)" }}>
            {(teamsForBrief?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <ClipboardList className="h-10 w-10 text-[var(--text-disabled)] mx-auto mb-3" />
                  <p className="text-[14px] font-medium text-[var(--text-secondary)]">No teams assigned</p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">Add teams above to build the task flow.</p>
                </div>
              </div>
            ) : (
              <BriefFlowCanvas
                briefId={briefId}
                teams={(graphData?.teams ?? []).map(({ team, members }) => ({
                  teamId: team._id,
                  teamName: team.name,
                  teamColor: team.color,
                  tasks: allTasks
                    .filter((t) => members.some((m) => m.user._id === t.assigneeId))
                    .map((t) => {
                      const assignee = members.find((m) => m.user._id === t.assigneeId)?.user;
                      return {
                        _id: t._id,
                        title: t.title,
                        status: t.status,
                        assigneeName: (assignee?.name ?? assignee?.email ?? "Unassigned") as string,
                        flowX: t.flowX,
                        flowY: t.flowY,
                        deadline: t.deadline,
                      };
                    }),
                }))}
                connections={(taskConnections ?? []).map((c) => ({
                  _id: c._id,
                  sourceTaskId: c.sourceTaskId,
                  targetTaskId: c.targetTaskId,
                }))}
                isAdmin={!!isAdmin}
                onCreateTask={(teamId) => {
                  setPanelMode("create");
                  setPanelTeamId(teamId);
                  setTaskTeamFilter(teamId);
                  setTaskTitle("");
                  setTaskDesc("");
                  setTaskAssignee("");
                  setTaskDeadline(undefined);
                  setTaskDeadlineTime("");
                  setTaskClientFacing(false);
                  setTaskHandoffTeam("");
                }}
                onEditTask={(taskId) => {
                  setAutoEditTask(true);
                  setSelectedTaskId(taskId);
                }}
                onOpenTaskDetail={(taskId) => setSelectedTaskId(taskId)}
              />
            )}
          </div>
        </div>

        {/* ── RIGHT: Sliding Task Panel ─────────────────── */}
        <div
          className={`absolute top-0 right-0 h-full w-[420px] bg-white border-l border-[var(--border)] shadow-xl transition-transform duration-300 ease-in-out z-20 flex flex-col ${
            panelMode !== "hidden" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
              {panelMode === "create" ? "Create Task" : "Edit Task"}
            </h3>
            <button
              onClick={() => { setPanelMode("hidden"); }}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
                  } catch (err) {
                    toast("error", err instanceof Error ? err.message : "Failed to create task");
                  }
                }}
                className="flex flex-col gap-3"
              >
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
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">On approval, deliverable handed off to this team</p>
                </div>
                <Button type="submit" variant="primary" className="mt-2">
                  Create Task
                </Button>
              </form>
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
