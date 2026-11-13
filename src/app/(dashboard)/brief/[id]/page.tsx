"use client";

import { useMutation, useQuery } from "convex/react";
import { useUpdateTaskStatus } from "@/lib/useUpdateTaskStatus";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, EmptyState, Input, SectionHeader, SegmentedTabs, StatusBadge, Textarea, useToast, useCelebrate } from "@/components/ui";
import { isTaskOverdue, taskStatusMeta } from "@/lib/status";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";
import { AttachmentList } from "@/components/ui/AttachmentList";
import { TaskDetailModal } from "@/components/ui/TaskDetailModal";
import { Trash2, Calendar, Lock, FileDown, ArrowLeft, AlertTriangle, User, Clock, ClipboardList, UserPlus, Pencil, Plus, X, Filter, Wand2, Palette } from "lucide-react";
import { ContentCalendarView } from "@/components/ContentCalendarView";
import { CommentThread } from "@/components/comments/CommentThread";
import { briefUsesCreativeSlots, creativesSlotTarget } from "@/lib/briefCreatives";
import { useSmartBack } from "@/lib/useSmartBack";
import { BriefFlowCanvas } from "@/components/BriefFlowCanvas";
import { fieldBaseClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";

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

/** Next default position on the flow canvas for a team row (matches BriefFlowCanvas TEAM_GAP / TASK_GAP). */
function computeSequentialFlowSlot(
  graphData: { teams: { team: { _id: string }; members: { user: { _id: string } }[] }[] } | null | undefined,
  allTasks: { assigneeId: string; flowX?: number; flowY?: number }[],
  teamId: string
): { x: number; y: number } | null {
  if (!graphData?.teams?.length) return null;
  const teamIdx = graphData.teams.findIndex((g) => g.team._id === teamId);
  if (teamIdx < 0) return null;
  const memberIds = new Set(graphData.teams[teamIdx].members.map((m) => m.user._id));
  const teamTasks = allTasks.filter((t) => memberIds.has(t.assigneeId));
  const TEAM_GAP_Y = 200;
  const TASK_GAP_X = 240;
  const TASK_START_X = 60;
  const TASK_START_Y_OFFSET = 32;
  const teamBaseY = teamIdx * TEAM_GAP_Y + 40;
  const taskIdx = teamTasks.length;
  const nextX = TASK_START_X + taskIdx * TASK_GAP_X;
  const nextY = teamBaseY + TASK_START_Y_OFFSET;
  return { x: nextX, y: nextY };
}

// One look for every icon-only button, dropdown menu, add-chip and boxed
// field on this page.
const ICON_BTN = iconButtonClass;
const ICON_BTN_DANGER = iconButtonDangerClass;
const MENU = "bg-white rounded-lg border border-[var(--border)] shadow-lg py-1";
const MENU_HEADING = "px-3 pt-1.5 pb-1 text-[12px] font-medium text-[var(--text-muted)]";
const MENU_ITEM =
  "w-full text-left px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2";
const ADD_CHIP =
  "inline-flex items-center gap-1 h-6 px-2 text-[12px] font-medium rounded-full border border-dashed border-[var(--border-strong)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:pointer-events-none";
const FIELD = fieldBaseClass; // also on textareas, so no fixed height
const FIELD_LABEL = "font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5";

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
  const removeHelper = useMutation(api.tasks.removeHelper);
  const [helperToRemove, setHelperToRemove] = useState<{ id: string; name: string } | null>(null);

  const [showAddHelper, setShowAddHelper] = useState(false);
  const [helperAssignee, setHelperAssignee] = useState("");
  const [helperDesc, setHelperDesc] = useState("");
  const [helperDeadline, setHelperDeadline] = useState<number | undefined>(undefined);
  const [helperDeadlineTime, setHelperDeadlineTime] = useState("");
  const [isCreatingSubTask, setIsCreatingSubTask] = useState(false);

  // People can sit on several of the brief's teams; list each once, and
  // never offer the main assignee as their own helper.
  const teamMembers = useMemo(() => {
    if (!graphData?.teams) return [];
    const all = graphData.teams.flatMap((t: any) =>
      t.members.map((m: any) => m.user).filter(Boolean)
    );
    return [...new Map(all.map((u: any) => [u._id, u])).values()].filter(
      (u: any) => u._id !== task?.assigneeId
    );
  }, [graphData, task?.assigneeId]);
  const { toast } = useToast();
  const myTeams = useQuery(api.teams.getTeamsForUser, user?._id ? { userId: user._id } : "skip");
  const canAddHelper = isAdmin || (myTeams ?? []).some((t: any) => t?.leadId === user?._id);

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
    if (!task?.assignedBy || !tasksData?.users) return "-";
    const u = tasksData.users.find((u: any) => u._id === task.assignedBy);
    return u?.name ?? u?.email ?? "-";
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

  const statusStyle = taskStatusMeta(task.status);
  const isDelivered = task.status === "done";

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
      {/* Left: Task Details + Daily Summaries */}
      <div className="border-r border-[var(--border)] overflow-auto p-5 space-y-5">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">{task.title}</h2>
            {isAdmin && !isDelivered && (
              <button
                onClick={() => onOpenTask(task._id)}
                className={ICON_BTN}
                title="Edit task"
                aria-label="Edit task"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge color={statusStyle.dot} label={statusStyle.label} />
            {isDelivered && (
              <Badge className="gap-1">
                <Lock className="h-3 w-3" />
                Task done by employee
              </Badge>
            )}
            {!isDelivered && task.status !== "done" && (() => {
              const nextMap: Record<string, { status: "in-progress" | "review" | "done"; label: string }> = {
                pending: { status: "in-progress", label: "In Progress" },
                "in-progress": { status: "review", label: "Review" },
                review: { status: "done", label: "Done" },
              };
              const next = nextMap[task.status];
              if (!next) return null;
              // Non-admins may only start their own task; Review comes from
              // submitting a deliverable.
              if (!isAdmin && (next.status !== "in-progress" || task.assigneeId !== user?._id)) return null;
              return (
                <Button onClick={() => onUpdateStatus(task._id, next.status)}>
                  Move to {next.label} &rarr;
                </Button>
              );
            })()}
          </div>
        </div>

        {(task.description || brief.description) && (
          <div>
            <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">Description</p>
            <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">{task.description || brief.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--bg-primary)] rounded-md p-3 border border-[var(--border-subtle)]">
            <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">Assignee</p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              {assigneeName}
            </p>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-md p-3 border border-[var(--border-subtle)]">
            <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">Assigned by</p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              {assignerName}
            </p>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-md p-3 border border-[var(--border-subtle)]">
            <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">Duration</p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              {task.duration ?? "-"}
            </p>
          </div>
          {task.deadline && (
            <div className="bg-[var(--bg-primary)] rounded-md p-3 border border-[var(--border-subtle)]">
              <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">Deadline</p>
              <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {new Date(task.deadline).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Sub-tasks / Helpers */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <SectionHeader title="Sub-tasks" count={subTasks?.length} className="" />
            {canAddHelper && task.status !== "done" && (
              <Button variant="secondary" onClick={() => setShowAddHelper(!showAddHelper)}>
                <UserPlus className="h-3.5 w-3.5" />
                Add Helper
              </Button>
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
                  toast("success", "Helper added");
                } catch (err) {
                  toast("error", err instanceof Error ? err.message : "Couldn't add helper");
                } finally {
                  setIsCreatingSubTask(false);
                }
              }}
              className="space-y-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] mb-3"
            >
              <select
                value={helperAssignee}
                onChange={(e) => setHelperAssignee(e.target.value)}
                className={`w-full ${FIELD} bg-white`}
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
                className={`w-full py-1.5 min-h-[50px] ${FIELD} bg-white`}
                required
              />
              <div>
                <label className="text-[12px] font-medium text-[var(--text-secondary)] block mb-1">Deadline</label>
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <DatePicker value={helperDeadline} onChange={setHelperDeadline} placeholder="Set date" />
                  </div>
                  <input
                    type="time"
                    value={helperDeadlineTime}
                    onChange={(e) => setHelperDeadlineTime(e.target.value)}
                    className={`w-24 ${FIELD} bg-white`}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={() => setShowAddHelper(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={isCreatingSubTask}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Helper
                </Button>
              </div>
            </form>
          )}

          {subTasks && subTasks.length > 0 ? (
            <div className="space-y-1.5">
              {subTasks.map((st: any) => (
                <div key={st._id} className="flex items-center justify-between gap-2 bg-[var(--bg-primary)] rounded-md px-3 py-1.5 border border-[var(--border-subtle)]">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{st.description || st.title}</p>
                    <p className="text-[12px] text-[var(--text-muted)]">{st.assigneeName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge color={taskStatusMeta(st.status).dot} label={taskStatusMeta(st.status).label} />
                    {canAddHelper && st.status !== "done" && (
                      <button
                        type="button"
                        onClick={() => setHelperToRemove({ id: st._id, name: st.assigneeName })}
                        className={ICON_BTN_DANGER}
                        aria-label={`Remove helper ${st.assigneeName}`}
                        title="Remove helper"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <ConfirmModal
                open={!!helperToRemove}
                title="Remove helper?"
                message={`${helperToRemove?.name ?? "This person"} will be removed from this task, along with any work they submitted on it.`}
                confirmLabel="Remove"
                confirmingLabel="Removing…"
                variant="danger"
                onConfirm={async () => {
                  if (!helperToRemove) return;
                  try {
                    await removeHelper({ taskId: helperToRemove.id as Id<"tasks"> });
                    toast("success", "Helper removed");
                  } catch (err) {
                    toast("error", err instanceof Error ? err.message : "Couldn't remove helper");
                  }
                  setHelperToRemove(null);
                }}
                onCancel={() => setHelperToRemove(null)}
              />
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">No helpers added yet.</p>
          )}
        </div>

        {/* Daily Summaries */}
        <div>
          <SectionHeader title="Daily summaries" className="mb-2" />
          {dailySummaries && dailySummaries.length > 0 ? (
            <div className="space-y-2">
              {dailySummaries.map((s: any, idx: number) => (
                <div key={s._id} className="bg-[var(--bg-primary)] rounded-md p-3 border border-[var(--border-subtle)]">
                  <p className="text-[12px] font-medium text-[var(--text-muted)]">
                    Day {idx + 1} - {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
          <SectionHeader title="Deliverables" className="mb-0.5" />
          <p className="text-[12px] text-[var(--text-muted)] mb-2">
            {showCreativeSlots
              ? `${sortedDeliverables.length} / ${creativesRequired} creative${creativesRequired !== 1 ? "s" : ""} submitted`
              : `${sortedDeliverables.length} deliverable${sortedDeliverables.length !== 1 ? "s" : ""} submitted`}
          </p>
          <div className="space-y-2">
            {sortedDeliverables.map((d: any, idx: number) => {
              return (
                <Card key={d._id} className="!p-3">
                  <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">
                    {showCreativeSlots ? `Creative ${idx + 1}` : `Deliverable ${idx + 1}`}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="truncate mr-2">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{d.message ?? d.fileName ?? "Deliverable"}</p>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        by {d.submitterName ?? "Unknown"} · {new Date(d.submittedAt ?? d._creationTime).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        d.status === "approved" ? "employee" :
                        d.status === "rejected" ? "danger" :
                        d.status === "changes_requested" ? "warning" :
                        "neutral"
                      }
                      className="capitalize"
                    >
                      {String(d.status).replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {(d.note || d.reviewNote) && (
                    <p className="text-[12px] text-[var(--text-secondary)] mt-1">{d.note ?? d.reviewNote}</p>
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
                  className="rounded-lg border border-dashed border-[var(--border)] p-3 bg-[var(--bg-primary)]"
                >
                  <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">
                    Creative {n}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">Not submitted yet</p>
                </div>
              );
            })}
            {sortedDeliverables.length === 0 && emptyDeliverableSlots === 0 && (
              <p className="text-[12px] text-[var(--text-muted)]">No deliverables submitted yet.</p>
            )}
          </div>
        </div>

        {/* Attachments (AttachmentList brings its own "Files" heading) */}
        <AttachmentList parentType="brief" parentId={brief._id} />

        {/* Comments (CommentThread brings its own "Discussion" heading) */}
        <CommentThread parentType="brief" parentId={brief._id} />
      </div>
    </div>
  );
}

function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* ignore */
  }
  return null;
}

export default function BriefPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const briefId = params.id as Id<"briefs">;
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const backHref = returnTo ?? "/briefs";
  const backLabel = returnTo?.includes("/brands/") ? "Brand" : "Briefs";
  const goBack = useSmartBack(backHref);
  // Deep link from Team Load / task navigation: open the calendar on the month
  // that actually holds the task, not the first sheet ever created.
  const initialMonth = searchParams.get("month");

  const brief = useQuery(api.briefs.getBrief, { briefId });
  const tasksData = useQuery(api.tasks.listTasksForBrief, { briefId });
  const graphData = useQuery(api.briefs.getBriefGraphData, { briefId });
  const teamsForBrief = useQuery(api.briefs.getTeamsForBrief, { briefId });
  const employees = useQuery(api.users.listEmployees);
  const user = useQuery(api.users.getCurrentUser);
  // Brands whose content calendar the viewer may edit (admins: all).
  const calendarBrandIds = useQuery(
    api.contentCalendar.getMyAccessibleCalendarBrandIds
  );

  const createTask = useMutation(api.tasks.createTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateBrief = useMutation(api.briefs.updateBrief);
  const archiveBrief = useMutation(api.briefs.archiveBrief);
  const closeBrief = useMutation(api.briefs.closeBrief);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const deleteBrief = useMutation(api.briefs.deleteBrief);
  const assignTeamsToBrief = useMutation(api.briefs.assignTeamsToBrief);
  const removeTeamFromBrief = useMutation(api.briefs.removeTeamFromBrief);
  const allTeams = useQuery(api.teams.listTeams, {});

  // Task connections
  const taskConnections = useQuery(api.briefs.listTaskConnections, { briefId });
  const addTaskConnection = useMutation(api.briefs.addTaskConnection);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskTeamFilter, setTaskTeamFilter] = useState<string>("");
  const [taskAssignee, setTaskAssignee] = useState<Id<"users"> | "">("");
  const [taskDeadline, setTaskDeadline] = useState<number | undefined>(undefined);
  const [taskDeadlineTime, setTaskDeadlineTime] = useState("");
  const [taskClientFacing, setTaskClientFacing] = useState(false);
  const [taskHandoffTeam, setTaskHandoffTeam] = useState<string>("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  // ?task=<id> opens that task (links from Review, My Tasks, Work Log…).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(searchParams.get("task"));
  const [autoEditTask, setAutoEditTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);

  // Flowchart panel state
  const [panelMode, setPanelMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [panelTeamId, setPanelTeamId] = useState<string>("");
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showAddTaskTeamPicker, setShowAddTaskTeamPicker] = useState(false);

  // Team-wise filter for task visibility
  const [viewTeamFilter, setViewTeamFilter] = useState<string>("");
  const [showViewTeamFilter, setShowViewTeamFilter] = useState(false);

  const openCreateTaskPanel = useCallback((teamId: string) => {
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
    setPendingConnectionSource(null);
    setPendingFlowPosition(null);
    setShowAddTaskTeamPicker(false);
  }, []);

  // Drag-to-create: store pending connection source + position for new node
  const [pendingConnectionSource, setPendingConnectionSource] = useState<string | null>(null);
  const [pendingFlowPosition, setPendingFlowPosition] = useState<{ x: number; y: number } | null>(null);
  /** Which handle was dragged (bottom | right) for edge styling */
  const [pendingSourceHandle, setPendingSourceHandle] = useState<string | null>(null);

  const focusCreateTaskPanel = useCallback(() => {
    const el = document.getElementById("create-task-team-select");
    el?.focus();
  }, []);

  const { toast } = useToast();
  const { celebrate } = useCelebrate();
  const updateTaskStatus = useUpdateTaskStatus();
  const setFlowPositions = useMutation(api.tasks.updateTaskFlowPositions);

  // Canvas ↔ List toggle for the flow-canvas brief types.
  const [briefView, setBriefView] = useState<"canvas" | "list">("canvas");
  const [showAddPillPicker, setShowAddPillPicker] = useState(false);

  const briefTeamsList = graphData?.teams ?? [];

  const allTasks = tasksData?.tasks ?? [];
  const overdueTaskCount = allTasks.filter((t) => !t.parentTaskId && isTaskOverdue(t)).length;
  const reviewTaskCount = allTasks.filter((t) => !t.parentTaskId && t.status === "review").length;

  // Apply team-wise filter: find which user IDs belong to the selected team
  const filteredTasks = useMemo(() => {
    if (!viewTeamFilter) return allTasks;
    const teamMembers = graphData?.teams?.find(
      (t) => t.team._id === viewTeamFilter
    )?.members;
    if (!teamMembers) return allTasks;
    const memberIds = new Set(teamMembers.map((m) => m.user._id));
    return allTasks.filter((t) => memberIds.has(t.assigneeId));
  }, [allTasks, viewTeamFilter, graphData?.teams]);

  const tasksByStatus = {
    todo: filteredTasks.filter((t) => t.status === "pending"),
    "in-progress": filteredTasks.filter((t) => t.status === "in-progress"),
    review: filteredTasks.filter((t) => t.status === "review"),
    done: filteredTasks.filter((t) => t.status === "done"),
  };
  const totalTasks = filteredTasks.length;
  const doneTasks = tasksByStatus.done.length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  /** Auto-layout: topological layering (Kahn) of the connection graph into
   *  columns; unconnected tasks fill the first column. Persists positions. */
  async function handleAutoLayout() {
    const conns = taskConnections ?? [];
    const ids = filteredTasks.map((t) => t._id as string);
    const idSet = new Set(ids);
    const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
    const outgoing = new Map<string, string[]>();
    for (const c of conns) {
      const s = c.sourceTaskId as string;
      const t = c.targetTaskId as string;
      if (!idSet.has(s) || !idSet.has(t)) continue;
      indegree.set(t, (indegree.get(t) ?? 0) + 1);
      outgoing.set(s, [...(outgoing.get(s) ?? []), t]);
    }
    // Layer assignment
    const layer = new Map<string, number>();
    let queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
    queue.forEach((id) => layer.set(id, 0));
    const indeg = new Map(indegree);
    while (queue.length > 0) {
      const next: string[] = [];
      for (const id of queue) {
        for (const t of outgoing.get(id) ?? []) {
          layer.set(t, Math.max(layer.get(t) ?? 0, (layer.get(id) ?? 0) + 1));
          indeg.set(t, (indeg.get(t) ?? 1) - 1);
          if ((indeg.get(t) ?? 0) === 0) next.push(t);
        }
      }
      queue = next;
    }
    // Cycle leftovers → last layer + 1
    const maxLayer = Math.max(0, ...[...layer.values()]);
    for (const id of ids) if (!layer.has(id)) layer.set(id, maxLayer + 1);

    const rows = new Map<number, number>();
    const positions = ids
      .sort((a, b) => (layer.get(a) ?? 0) - (layer.get(b) ?? 0))
      .map((id) => {
        const col = layer.get(id) ?? 0;
        const row = rows.get(col) ?? 0;
        rows.set(col, row + 1);
        return {
          taskId: id as Id<"tasks">,
          flowX: 80 + col * 320,
          flowY: 80 + row * 170,
        };
      });
    if (positions.length === 0) return;
    try {
      await setFlowPositions({ positions });
      toast("success", "Canvas re-arranged by task flow");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Auto-layout failed");
    }
  }

  async function handleArchive() {
    try {
      await archiveBrief({ briefId });
      toast("success", "Brief archived");
      router.push(backHref);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to archive");
    }
  }

  async function handleDelete() {
    try {
      await deleteBrief({ briefId });
      toast("success", "Brief deleted");
      router.push(backHref);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete brief");
    }
  }

  if (brief === undefined || brief === null) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[var(--text-muted)]">Loading...</p>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Brief Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--border)] bg-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button type="button" variant="ghost" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </Button>
          <div className="h-4 w-px bg-[var(--border)] hidden sm:block" aria-hidden />
          {isAdmin && brief.status !== "archived" ? (
            <input
              className="font-semibold text-[17px] sm:text-[20px] tracking-tight text-[var(--text-primary)] truncate bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent-admin)] focus:outline-none px-1 -ml-1 min-w-0"
              defaultValue={brief.title}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val && val !== brief.title) updateBrief({ briefId, title: val });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <h1 className="font-semibold text-[17px] sm:text-[20px] tracking-tight text-[var(--text-primary)] truncate">
              {brief.title}
            </h1>
          )}
          <StatusBadge
            className="shrink-0"
            color={BRIEF_STATUS_COLORS[brief.status] ?? "var(--text-muted)"}
            label={BRIEF_STATUS_LABELS[brief.status] ?? brief.status.replace(/[-_]/g, " ")}
          />
          {brief.briefType && (
            <Badge variant="neutral">
              {brief.briefType === "content_calendar" ? "Content Calendar" :
               brief.briefType === "video_editing" ? "Video Editing" :
               brief.briefType === "production" ? "Production" :
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
              {/* Deadline picker — for 1-task non-content_calendar briefs,
                  edit the lone task's deadline directly so dashboard / Work
                  Log views (which read task.deadline) stay in sync. For
                  multi-task briefs, edit the brief's overall deadline. */}
              <DatePicker
                value={brief.deadline}
                onChange={(deadline) => {
                  const tasks = tasksData?.tasks ?? [];
                  if (
                    brief.briefType !== "content_calendar" &&
                    !brief.deadlineIsManual &&
                    tasks.length === 1
                  ) {
                    updateTask(
                      deadline !== undefined
                        ? { taskId: tasks[0]._id, deadline }
                        : { taskId: tasks[0]._id, clearDeadline: true }
                    );
                  } else {
                    updateBrief(
                      deadline !== undefined ? { briefId, deadline } : { briefId, clearDeadline: true }
                    );
                  }
                }}
                placeholder="Set deadline"
                className="w-[140px]"
              />
              <select
                value={brief.status}
                onChange={async (e) => {
                  const status = e.target.value;
                  await updateBrief({ briefId, status });
                  // Closing a brief out is the second of the three earned
                  // moments — it's the end of a whole body of work.
                  if (status === "completed") {
                    celebrate("Brief completed", `${brief.title} is closed out`);
                  }
                }}
                aria-label="Brief status"
                className={`${FIELD} bg-[var(--bg-input)] font-medium`}
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
              {user?.isSuperAdmin && brief.status !== "completed" && (
                <Button variant="secondary" onClick={() => setShowCloseConfirm(true)}>
                  Close brief
                </Button>
              )}
              <Button variant="secondary" onClick={handleArchive}>
                Archive
              </Button>
            </>
          )}
          {/* PDF Export */}
          <button
            onClick={() => window.print()}
            className={`${ICON_BTN} no-print`}
            title="Export PDF"
            aria-label="Export PDF"
          >
            <FileDown className="h-4 w-4" />
          </button>
          {/* Edit brief */}
          {isAdmin && brief.status !== "archived" && (
            <div className="relative">
              <button
                onClick={() => setShowEditMenu(!showEditMenu)}
                className={`${ICON_BTN} no-print`}
                title="Edit brief"
                aria-label="Edit brief"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {showEditMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowEditMenu(false)} />
                  <div className={`absolute right-0 top-full mt-1 z-40 ${MENU} min-w-[240px] max-w-[320px] max-h-[400px] overflow-auto animate-scaleIn`}>
                    {/* Brief fields */}
                    <p className={MENU_HEADING}>Brief</p>
                    <button
                      onClick={() => {
                        setShowEditMenu(false);
                        const titleInput = document.querySelector<HTMLInputElement>('header input[class*="font-semibold"]');
                        if (titleInput) { titleInput.focus(); titleInput.select(); }
                      }}
                      className={MENU_ITEM}
                    >
                      <Pencil className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      Edit brief title & description
                    </button>

                    {/* Creatives required — designing briefs that already carry a count */}
                    {brief.briefType === "designing" &&
                      brief.creativesRequired != null &&
                      brief.creativesRequired >= 1 && (
                        <div className="px-3 py-1.5 flex items-center gap-2">
                          <Palette className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                          <span className="text-[13px] text-[var(--text-primary)] flex-1">
                            Creatives required
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            defaultValue={brief.creativesRequired}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            onBlur={async (e) => {
                              const prev = brief.creativesRequired as number;
                              const n = Math.floor(Number(e.target.value));
                              if (!Number.isFinite(n) || n < 1 || n > 99 || n === prev) {
                                e.target.value = String(prev);
                                return;
                              }
                              try {
                                await updateBrief({ briefId, creativesRequired: n });
                                toast("success", `Now ${n} creative${n !== 1 ? "s" : ""} required`);
                              } catch (err) {
                                e.target.value = String(prev);
                                toast("error", err instanceof Error ? err.message : "Failed to update");
                              }
                            }}
                            aria-label="Creatives required"
                            className="w-14 bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-2 text-[13px] text-[var(--text-primary)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                          />
                        </div>
                      )}

                    {/* Tasks / Events */}
                    {allTasks.length > 0 && (
                      <>
                        <div className="border-t border-[var(--border-subtle)] mt-1" />
                        <p className={MENU_HEADING}>
                          {brief.briefType === "content_calendar" ? "Calendar events" : "Tasks"}
                        </p>
                        {allTasks.map((task) => {
                          const sm = taskStatusMeta(task.status);
                          return (
                            <button
                              key={task._id}
                              onClick={() => {
                                setShowEditMenu(false);
                                setAutoEditTask(true);
                                setSelectedTaskId(task._id);
                              }}
                              className={MENU_ITEM}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sm.dot }} />
                              <span className="truncate flex-1">{task.title}</span>
                              <span className="text-[12px] text-[var(--text-muted)] shrink-0">{sm.label}</span>
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
              className={ICON_BTN_DANGER}
              title="Delete brief permanently"
              aria-label="Delete brief permanently"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Content Calendar briefs get a full-width spreadsheet layout */}
      {brief.briefType === "content_calendar" ? (
        <div className="flex-1 overflow-hidden">
          <ContentCalendarView
            briefId={briefId}
            isEditable={
              !!isAdmin ||
              (!!brief?.brandId && !!calendarBrandIds?.includes(brief.brandId))
            }
            brandId={brief?.brandId}
            initialMonth={initialMonth}
          />
        </div>
      ) : brief.briefType === "single_task" &&
        allTasks.filter((t) => !t.parentTaskId).length <= 1 ? (
        // Multi-step individual tasks (one "Step N" per team) fall through
        // to the canvas so steps 2..N stay visible.
        <SingleTaskBriefView
          brief={brief}
          tasks={allTasks.filter((t) => !t.parentTaskId)}
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
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-white z-20 relative">
            <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 min-w-0">
              <span className="text-[12px] font-medium text-[var(--text-muted)]">Progress</span>
              <div className="w-24 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent-employee)]" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">{progressPct}%</span>
              <span className="text-[12px] text-[var(--text-muted)] tabular-nums">({doneTasks}/{totalTasks})</span>
              {overdueTaskCount > 0 && (
                <Badge variant="danger" className="ml-1 gap-1">
                  <AlertTriangle className="h-3 w-3" /> {overdueTaskCount} overdue
                </Badge>
              )}
              {reviewTaskCount > 0 && (
                <StatusBadge color={taskStatusMeta("review").dot} label={`${reviewTaskCount} in review`} />
              )}
            </div>

            {/* Canvas | List toggle */}
            <SegmentedTabs
              className="shrink-0"
              value={briefView}
              onChange={setBriefView}
              options={[
                { value: "canvas", label: "Canvas" },
                { value: "list", label: "List" },
              ]}
            />
            {isAdmin && briefView === "canvas" && totalTasks > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleAutoLayout}
                title="Re-arrange nodes into columns following the task flow"
                className="shrink-0"
              >
                <Wand2 className="h-3.5 w-3.5" /> Auto-layout
              </Button>
            )}

            {/* Team filter dropdown */}
            {(teamsForBrief ?? []).filter(Boolean).length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewTeamFilter(!showViewTeamFilter);
                    setShowTeamPicker(false);
                    setShowAddTaskTeamPicker(false);
                  }}
                  aria-expanded={showViewTeamFilter}
                  className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium border transition-colors ${
                    viewTeamFilter
                      ? "border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {viewTeamFilter
                    ? (teamsForBrief ?? []).find((t) => t?._id === viewTeamFilter)?.name ?? "Team"
                    : "All teams"}
                </button>
                {showViewTeamFilter && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowViewTeamFilter(false)} />
                    <div className={`absolute left-0 top-full mt-1 z-40 ${MENU} min-w-[160px]`}>
                      <button
                        onClick={() => { setViewTeamFilter(""); setShowViewTeamFilter(false); }}
                        className={`${MENU_ITEM} ${!viewTeamFilter ? "bg-[var(--bg-hover)] font-medium" : ""}`}
                      >
                        All teams
                      </button>
                      {(teamsForBrief ?? []).filter(Boolean).map((team: { _id: Id<"teams">; name?: string; color?: string }) => (
                        <button
                          key={team._id}
                          onClick={() => { setViewTeamFilter(team._id); setShowViewTeamFilter(false); }}
                          className={`${MENU_ITEM} ${viewTeamFilter === team._id ? "bg-[var(--bg-hover)] font-medium" : ""}`}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                          {team.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Team pills */}
            {isAdmin && brief.status !== "archived" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {(teamsForBrief ?? []).filter(Boolean).map((team: any, idx: number) => (
                  <span
                    key={team._id}
                    className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1.5 text-[12px] font-medium rounded-full bg-white border border-[var(--border)] text-[var(--text-secondary)]"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                    {team.name}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove ${team.name} from this brief? Its tasks will be hidden from the canvas.`)) {
                          removeTeamFromBrief({ briefId, teamId: team._id });
                        }
                      }}
                      aria-label={`Remove ${team.name} from this brief`}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTeamPicker(!showTeamPicker);
                      setShowAddTaskTeamPicker(false);
                    }}
                    className={ADD_CHIP}
                  >
                    <Plus className="h-3 w-3" /> Team
                  </button>
                  {showTeamPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowTeamPicker(false)} />
                      <div className={`absolute right-0 top-full mt-1 z-40 ${MENU} min-w-[180px]`}>
                        <p className={MENU_HEADING}>Add team</p>
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
                              className={MENU_ITEM}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                              {team.name}
                            </button>
                          ))}
                        {(allTeams ?? []).filter((t) => !teamsForBrief?.some((tb) => tb?._id === t._id)).length === 0 && (
                          <p className="px-3 py-1.5 text-[13px] text-[var(--text-muted)]">All teams added</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTaskTeamPicker(!showAddTaskTeamPicker);
                      setShowTeamPicker(false);
                    }}
                    disabled={(teamsForBrief ?? []).filter(Boolean).length === 0}
                    title={
                      (teamsForBrief ?? []).filter(Boolean).length === 0
                        ? "Add a team first, then add tasks"
                        : "Add a task"
                    }
                    className={ADD_CHIP}
                  >
                    <Plus className="h-3 w-3" /> Task
                  </button>
                  {showAddTaskTeamPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowAddTaskTeamPicker(false)} />
                      <div className={`absolute right-0 top-full mt-1 z-40 ${MENU} min-w-[180px]`}>
                        <p className={MENU_HEADING}>Add task for</p>
                        {(teamsForBrief ?? []).filter(Boolean).map((team: { _id: Id<"teams">; name?: string; color?: string }) => (
                          <button
                            key={team._id}
                            type="button"
                            onClick={() => openCreateTaskPanel(team._id)}
                            className={MENU_ITEM}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                            {team.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* React Flow canvas / List view */}
          <div className="flex-1 relative" style={{ height: "calc(100% - 42px)" }}>
            {(teamsForBrief?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center h-full p-4">
                <EmptyState
                  icon={ClipboardList}
                  title="No teams assigned"
                  description="A brief runs as a flow between teams. Add the first team to get started."
                  action={
                    isAdmin && brief.status !== "archived" ? (
                      <Button type="button" onClick={() => setShowTeamPicker(true)}>
                        <Plus className="h-3.5 w-3.5" /> Add a team
                      </Button>
                    ) : undefined
                  }
                  className="w-full max-w-md"
                />
              </div>
            ) : briefView === "list" ? (
              <div className="h-full overflow-y-auto p-4">
                {filteredTasks.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No tasks yet"
                    description={isAdmin ? "Add a task to get this brief moving." : undefined}
                  />
                ) : (
                  <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)] text-left text-[12px] text-[var(--text-muted)]">
                        <th className="px-4 py-2 font-medium">Task</th>
                        <th className="px-4 py-2 font-medium">Assignee</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Deadline</th>
                        {isAdmin && <th className="px-4 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredTasks]
                        .sort((a, b) => {
                          const order: Record<string, number> = { pending: 0, "in-progress": 1, review: 2, "on-hold": 3, done: 4 };
                          const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
                          if (d !== 0) return d;
                          return (a.deadline ?? Infinity) - (b.deadline ?? Infinity);
                        })
                        .map((t) => {
                          const assignee = briefTeamsList
                            .flatMap((g) => g.members)
                            .find((m) => m.user._id === t.assigneeId)?.user;
                          const sm = taskStatusMeta(t.status);
                          const overdue = t.deadline && t.deadline < Date.now() && t.status !== "done" && t.status !== "review";
                          return (
                            <tr
                              key={t._id}
                              onClick={() => setSelectedTaskId(t._id)}
                              className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-1.5 text-[14px] font-medium text-[var(--text-primary)]">{t.title}</td>
                              <td className="px-4 py-1.5 text-[13px] text-[var(--text-secondary)]">
                                {assignee?.name ?? assignee?.email ?? "-"}
                              </td>
                              <td className="px-4 py-1.5">
                                <StatusBadge color={sm.dot} label={sm.label} />
                              </td>
                              <td className={`px-4 py-1.5 text-[13px] tabular-nums ${overdue ? "text-[var(--danger)] font-medium" : "text-[var(--text-muted)]"}`}>
                                {t.deadline
                                  ? new Date(t.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                                  : "-"}
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-1.5 text-right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAutoEditTask(true);
                                      setSelectedTaskId(t._id);
                                    }}
                                    className={ICON_BTN}
                                    title="Edit task"
                                    aria-label="Edit task"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            ) : (
              <BriefFlowCanvas
                briefId={briefId}
                teams={[...(graphData?.teams ?? []).map(({ team, members }, teamIdx, allTeamsInGraph) => ({
                  teamId: team._id,
                  teamName: team.name,
                  teamColor: team.color,
                  // Someone on two of the brief's teams would otherwise get
                  // their task drawn in both lanes; the first team wins.
                  tasks: filteredTasks
                    .filter((t) => members.some((m) => m.user._id === t.assigneeId))
                    .filter(
                      (t) =>
                        !allTeamsInGraph
                          .slice(0, teamIdx)
                          .some((g) => g.members.some((m) => m.user._id === t.assigneeId))
                    )
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
                })),
                // Tasks whose assignee is on none of the brief's teams still
                // count toward progress, so draw them in their own lane.
                ...(() => {
                  const others = filteredTasks.filter(
                    (t) => !(graphData?.teams ?? []).some(({ members }) => members.some((m) => m.user._id === t.assigneeId))
                  );
                  if (!graphData || others.length === 0) return [];
                  return [{
                    teamId: "other",
                    teamName: "Other",
                    teamColor: "#9ca3af",
                    tasks: others.map((t) => {
                      const assignee = tasksData?.users.find((u) => u._id === t.assigneeId);
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
                  }];
                })()]}
                connections={(taskConnections ?? []).map((c) => ({
                  _id: c._id,
                  sourceTaskId: c.sourceTaskId,
                  targetTaskId: c.targetTaskId,
                  sourceHandle: c.sourceHandle,
                }))}
                isAdmin={!!isAdmin}
                onCreateTask={openCreateTaskPanel}
                onEditTask={(taskId) => {
                  setAutoEditTask(true);
                  setSelectedTaskId(taskId);
                }}
                onOpenTaskDetail={(taskId) => setSelectedTaskId(taskId)}
                onDragToCreate={(sourceTaskId, position, sourceHandleId) => {
                  setPanelMode("create");
                  setPanelTeamId("");
                  setTaskTeamFilter("");
                  setTaskTitle("");
                  setTaskDesc("");
                  setTaskAssignee("");
                  setTaskDeadline(undefined);
                  setTaskDeadlineTime("");
                  setTaskClientFacing(false);
                  setTaskHandoffTeam("");
                  setPendingConnectionSource(sourceTaskId);
                  setPendingFlowPosition(position);
                  setPendingSourceHandle(sourceHandleId ?? null);
                }}
                pendingDraft={
                  panelMode === "create" && pendingFlowPosition ? { x: pendingFlowPosition.x, y: pendingFlowPosition.y } : null
                }
                pendingConnectionSource={pendingConnectionSource}
                pendingConnectionSourceHandle={pendingSourceHandle}
                onDraftNodeClick={focusCreateTaskPanel}
                onRequestAddTeam={() => setShowTeamPicker(true)}
              />
            )}

            {/* Guided empty state — teams exist, no tasks yet */}
            {briefView === "canvas" &&
              (teamsForBrief?.length ?? 0) > 0 &&
              totalTasks === 0 &&
              panelMode === "hidden" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="pointer-events-auto bg-white rounded-lg border border-[var(--border)] px-8 py-6 text-center max-w-sm">
                    <ClipboardList className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2.5" />
                    <p className="text-[14px] font-medium text-[var(--text-primary)]">No tasks yet</p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
                      Each task is a step in the flow. Connect them by dragging
                      between node handles. The next step starts when the
                      previous one is approved.
                    </p>
                    {isAdmin && brief.status !== "archived" && (
                      <Button
                        type="button"
                        onClick={() => {
                          const first = (teamsForBrief ?? []).filter(Boolean)[0];
                          if (first) openCreateTaskPanel(first._id);
                        }}
                        className="mt-4"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add the first task
                      </Button>
                    )}
                  </div>
                </div>
              )}

            {/* Floating add-task pill */}
            {briefView === "canvas" &&
              isAdmin &&
              brief.status !== "archived" &&
              (teamsForBrief?.length ?? 0) > 0 &&
              totalTasks > 0 &&
              panelMode === "hidden" && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
                  {showAddPillPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowAddPillPicker(false)} />
                      <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 ${MENU} min-w-[180px]`}>
                        <p className={MENU_HEADING}>Add task for</p>
                        {(teamsForBrief ?? []).filter(Boolean).map((team: any) => (
                          <button
                            key={team._id}
                            type="button"
                            onClick={() => {
                              setShowAddPillPicker(false);
                              openCreateTaskPanel(team._id);
                            }}
                            className={MENU_ITEM}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                            {team.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      const teams = (teamsForBrief ?? []).filter(Boolean);
                      if (teams.length === 1) openCreateTaskPanel(teams[0]._id);
                      else setShowAddPillPicker((v) => !v);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </Button>
                </div>
              )}
          </div>
        </div>

        {/* ── RIGHT: Sliding Task Panel ─────────────────── */}
        <div
          className={`absolute top-0 right-0 h-full w-[420px] bg-white border-l border-[var(--border)] transition-transform duration-300 ease-in-out z-20 flex flex-col ${
            panelMode !== "hidden" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
              {panelMode === "create" ? "Create task" : "Edit task"}
            </h3>
            <button
              onClick={() => {
                setPanelMode("hidden");
                setPendingConnectionSource(null);
                setPendingFlowPosition(null);
                setPendingSourceHandle(null);
              }}
              aria-label="Close panel"
              className={ICON_BTN}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {panelMode === "create" && isAdmin && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!panelTeamId) {
                    toast("error", "Select a team");
                    return;
                  }
                  if (!taskAssignee || isCreatingTask) return;
                  setIsCreatingTask(true);
                  let finalDeadline = taskDeadline;
                  if (taskDeadline !== undefined && taskDeadlineTime) {
                    const [hh, mm] = taskDeadlineTime.split(":").map(Number);
                    const d = new Date(taskDeadline);
                    d.setHours(hh, mm, 0, 0);
                    finalDeadline = d.getTime();
                  }
                  try {
                    const flowSlot =
                      pendingFlowPosition ??
                      (panelTeamId ? computeSequentialFlowSlot(graphData, allTasks, panelTeamId) : null);

                    const newTaskId = await createTask({
                      briefId,
                      title: taskTitle,
                      description: taskDesc || undefined,
                      assigneeId: taskAssignee as Id<"users">,
                      ...(finalDeadline !== undefined ? { deadline: finalDeadline } : {}),
                      ...(taskClientFacing ? { clientFacing: true } : {}),
                      ...(taskHandoffTeam ? { handoffTargetTeamId: taskHandoffTeam as Id<"teams"> } : {}),
                      ...(flowSlot ? { flowX: flowSlot.x, flowY: flowSlot.y } : {}),
                    });

                    // Auto-connect if created via drag-to-create
                    if (pendingConnectionSource && newTaskId) {
                      try {
                        const sh = pendingSourceHandle;
                        await addTaskConnection({
                          briefId,
                          sourceTaskId: pendingConnectionSource as Id<"tasks">,
                          targetTaskId: newTaskId,
                          ...(sh === "right" || sh === "bottom" ? { sourceHandle: sh } : {}),
                        });
                      } catch {
                        // Connection failed silently — task was still created
                      }
                    }

                    setTaskTitle("");
                    setTaskDesc("");
                    setTaskAssignee("");
                    setTaskDeadline(undefined);
                    setTaskDeadlineTime("");
                    setTaskClientFacing(false);
                    setTaskHandoffTeam("");
                    setPendingConnectionSource(null);
                    setPendingFlowPosition(null);
                    setPendingSourceHandle(null);
                    toast("success", "Task created");
                  } catch (err) {
                    toast("error", err instanceof Error ? err.message : "Failed to create task");
                  } finally {
                    setIsCreatingTask(false);
                  }
                }}
                className="flex flex-col gap-3"
              >
                <div>
                  <label htmlFor="create-task-team-select" className={FIELD_LABEL}>Team</label>
                  <select
                    id="create-task-team-select"
                    value={panelTeamId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPanelTeamId(v);
                      setTaskTeamFilter(v);
                      setTaskAssignee("");
                    }}
                    className={`w-full ${FIELD} bg-[var(--bg-input)]`}
                    required
                  >
                    <option value="">Select team...</option>
                    {(teamsForBrief ?? []).filter(Boolean).map((team: { _id: Id<"teams">; color?: string; name?: string }) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowTeamPicker(true)}
                    className="mt-1.5 text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
                  >
                    + Add another team to this brief
                  </button>
                </div>

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
                  <label className={FIELD_LABEL}>Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value as Id<"users">)}
                    className={`w-full ${FIELD} bg-[var(--bg-input)]`}
                  >
                    <option value="">{panelTeamId ? "Select employee" : "Select team first"}</option>
                    {(panelTeamId
                      ? briefTeamsList.find((t) => t.team._id === panelTeamId)?.members.map((m) => m.user) ?? []
                      : []
                    ).map((e) => (
                      <option key={e._id} value={e._id}>{(e.name ?? e.email ?? "Unknown") as string}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Deadline</label>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <DatePicker value={taskDeadline} onChange={setTaskDeadline} placeholder="Set date" />
                    </div>
                    <input
                      type="time"
                      value={taskDeadlineTime}
                      onChange={(e) => setTaskDeadlineTime(e.target.value)}
                      className={`w-24 ${FIELD} bg-[var(--bg-input)]`}
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
                  <span className="text-[13px] font-medium text-[var(--text-secondary)]">Client-facing task</span>
                </label>
                <div>
                  <label className={FIELD_LABEL}>Handoff team (optional)</label>
                  <select
                    value={taskHandoffTeam}
                    onChange={(e) => setTaskHandoffTeam(e.target.value)}
                    className={`w-full ${FIELD} bg-[var(--bg-input)]`}
                  >
                    <option value="">No handoff</option>
                    {(allTeams ?? []).map((t) => (
                      <option key={t._id} value={t._id}>{t.name}</option>
                    ))}
                  </select>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">On approval, deliverable handed off to this team</p>
                </div>
                <Button type="submit" variant="primary" className="mt-2" loading={isCreatingTask}>
                  Create task
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Close Brief (super admins): finishes every open task, then the brief. */}
      <ConfirmModal
        open={showCloseConfirm}
        title="Close brief"
        message={`Mark every open task in "${brief?.title ?? "this brief"}" as done and complete the brief? Open deliverables are approved and running timers stop.`}
        confirmLabel="Close brief"
        confirmingLabel="Closing..."
        onConfirm={async () => {
          try {
            const n = await closeBrief({ briefId });
            toast("success", n > 0 ? `Brief closed. ${n} open task${n === 1 ? "" : "s"} marked done.` : "Brief closed");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Couldn't close the brief");
          }
          setShowCloseConfirm(false);
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />

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
