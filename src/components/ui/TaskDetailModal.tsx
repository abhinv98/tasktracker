"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { useUpdateTaskStatus } from "@/lib/useUpdateTaskStatus";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AttachmentList } from "./AttachmentList";
import { CommentThread } from "../comments/CommentThread";
import { DatePicker } from "./DatePicker";
import { useToast } from "./Toast";
import { Badge, StatusBadge } from "./Badge";
import { Button } from "./Button";
import { SectionHeader } from "./StatTile";
import {
  X,
  Clock,
  Calendar,
  User,
  ChevronRight,
  Send,
  ExternalLink,
  Link2,
  MessageSquare,
  Loader2,
  Check,
  XCircle,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Eye,
  Pencil,
  Trash2,
  Tag as TagIcon,
  AlertTriangle,
  UserPlus,
  Play,
  RotateCcw,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { FilePreviewModal } from "./FilePreviewModal";
import { ConfirmModal } from "./ConfirmModal";
import { TaskTimeSection } from "./TaskTimeSection";
import { isTaskOverdue, taskStatusMeta } from "@/lib/status";
import { BRIEF_STATUS_COLORS } from "@/lib/statusColors";
import { taskUsesCreativeSlots, taskCreativesTarget } from "@/lib/briefCreatives";
import { fieldBaseClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { useConfirm } from "./ConfirmModal";

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

interface TaskDetailModalProps {
  taskId: string;
  onClose: () => void;
  autoEdit?: boolean;
}

// One look for every icon-only button and every boxed field in this dialog.
const ICON_BTN = iconButtonClass;
const ICON_BTN_DANGER = iconButtonDangerClass;
const FIELD = fieldBaseClass; // also on textareas, so no fixed height
const FIELD_LABEL = "text-[12px] font-medium text-[var(--text-secondary)] block mb-1";
const SECTION = "p-5 space-y-3 border-t border-[var(--border-subtle)]";

const STATUS_FLOW: Record<string, string> = {
  pending: "in-progress",
  "in-progress": "review",
  review: "done",
};

export function TaskDetailModal({ taskId, onClose, autoEdit }: TaskDetailModalProps) {
  const authToken = useAuthToken();
  const detail = useQuery(api.tasks.getTaskDetail, {
    taskId: taskId as Id<"tasks">,
  });
  const user = useQuery(api.users.getCurrentUser);
  const updateTaskStatus = useUpdateTaskStatus();
  const submitDeliverable = useMutation(api.approvals.submitDeliverable);
  const submitDirectToManager = useMutation(api.approvals.submitDeliverableDirectToManager);
  const submitDirectToAssignor = useMutation(api.approvals.submitDeliverableDirectToAssignor);
  const deliverables = useQuery(api.approvals.listDeliverables, {
    taskId: taskId as Id<"tasks">,
  });

  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const updateTask = useMutation(api.tasks.updateTask);
  const setTaskTagMut = useMutation(api.tasks.setTaskTag);
  const reassignTaskMutation = useMutation(api.tasks.reassignTask);
  const deleteTaskMutation = useMutation(api.tasks.deleteTask);
  const deleteDeliverable = useMutation(api.approvals.deleteDeliverable);

  const subTasks = useQuery(api.tasks.getSubTasks, { parentTaskId: taskId as Id<"tasks"> });
  const myTeams = useQuery(api.teams.getTeamsForUser, user ? { userId: user._id } : "skip");
  const createSubTask = useMutation(api.tasks.createSubTask);
  const removeHelper = useMutation(api.tasks.removeHelper);
  const [helperToRemove, setHelperToRemove] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const requestTaskRedo = useMutation(api.tasks.requestTaskRedo);
  const canRedo =
    useQuery(
      api.tasks.canRequestRedo,
      taskId ? { taskId: taskId as Id<"tasks"> } : "skip"
    ) ?? false;
  const [showRedoForm, setShowRedoForm] = useState(false);
  const [redoNote, setRedoNote] = useState("");
  const [redoDeadline, setRedoDeadline] = useState("");
  const [editingTag, setEditingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [isSubmittingRedo, setIsSubmittingRedo] = useState(false);
  const briefId = detail?.task?.briefId;
  const graphData = useQuery(
    api.briefs.getBriefGraphData,
    briefId ? { briefId } : "skip"
  );

  const editBriefTeams = graphData?.teams ?? [];
  const editAllMembers = [
    ...new Map(
      editBriefTeams.flatMap((t) => t.members.map((m) => [m.user._id, m.user]))
    ).values(),
  ];

  const [showEditForm, setShowEditForm] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTeamFilter, setEditTeamFilter] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDeadline, setEditDeadline] = useState<number | undefined>(undefined);
  const [editDeadlineTime, setEditDeadlineTime] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const editFilteredEmployees = editTeamFilter
    ? editBriefTeams
        .find((t) => t.team._id === editTeamFilter)
        ?.members.map((m) => m.user) ?? []
    : editAllMembers;

  const [showDeliverableForm, setShowDeliverableForm] = useState(false);
  const [deliverableMessage, setDeliverableMessage] = useState("");
  const [deliverableLink, setDeliverableLink] = useState("");
  const [deliverableFiles, setDeliverableFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteDeliverableId, setConfirmDeleteDeliverableId] = useState<string | null>(null);
  const [isDeletingDeliverable, setIsDeletingDeliverable] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);
  const [showReassign, setShowReassign] = useState(false);
  const [reassignTarget, setReassignTarget] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);

  const [showAddHelper, setShowAddHelper] = useState(false);
  const [helperAssignee, setHelperAssignee] = useState("");
  const [helperDesc, setHelperDesc] = useState("");
  const [isCreatingSubTask, setIsCreatingSubTask] = useState(false);

  const dailySummaries = useQuery(api.taskDailySummaries.listSummaries, { taskId: taskId as Id<"tasks"> });
  const addDailySummary = useMutation(api.taskDailySummaries.addSummary);
  const updateDailySummary = useMutation(api.taskDailySummaries.updateSummary);
  const deleteDailySummary = useMutation(api.taskDailySummaries.deleteSummary);
  const askConfirm = useConfirm();
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [summaryDate, setSummaryDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [summaryText, setSummaryText] = useState("");
  const [isAddingSummary, setIsAddingSummary] = useState(false);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editingSummaryText, setEditingSummaryText] = useState("");

  const [autoEditTriggered, setAutoEditTriggered] = useState(false);

  useEffect(() => {
    if (autoEdit && detail?.task && !autoEditTriggered && !showEditForm) {
      const task = detail.task;
      setEditTitle(task.title);
      setEditDesc(task.description ?? "");
      setEditTeamFilter("");
      setEditAssignee(task.assigneeId);
      setEditDeadline(task.deadline);
      if (task.deadline) {
        const d = new Date(task.deadline);
        setEditDeadlineTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      } else {
        setEditDeadlineTime("");
      }
      setShowEditForm(true);
      setAutoEditTriggered(true);
    }
  }, [autoEdit, detail, autoEditTriggered, showEditForm]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!detail || !user) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/40 z-50 animate-fadeIn"
          onClick={onClose}
        />
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] bg-white shadow-2xl border-l border-[var(--border)] flex items-center justify-center animate-slidePanelIn">
          {detail === null ? (
            <p className="p-6 text-[13px] text-[var(--text-secondary)]">This task no longer exists.</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          )}
        </div>
      </>
    );
  }

  const { task, brief, assignee, assignedBy } = detail;
  if (!task) return null;

  const status = task.status;
  const statusInfo = taskStatusMeta(status);
  const isAssignee = user._id === task.assigneeId;
  const isAdmin = user.role === "admin";
  // Team leads can add helpers from their own team (server enforces which).
  const canAddHelper = isAdmin || (myTeams ?? []).some((t: any) => t?.leadId === user._id);
  // Tasks already in "review" have been submitted by the assignee — the ball
  // is in the reviewer's court, so the overdue flag should clear.
  const isOverdue =
    task.deadline != null &&
    task.deadline < Date.now() &&
    task.status !== "done" &&
    task.status !== "review";
  const isDelivered = task.status === "done";
  const isBriefOnHold = brief?.status === "on_hold";
  const isEditLocked = isDelivered || isOverdue;
  const canUpdateStatus = (isAssignee || isAdmin) && !isDelivered && !isBriefOnHold;
  const canReassignTask =
    isAdmin ||
    brief?.assignedManagerId === user._id ||
    (task.assignedBy === user._id && brief?.briefType === "single_task");
  const showReassignBanner =
    canReassignTask &&
    ((!assignee && isAdmin) || (assignee && showReassign));
  // Handoff tasks should NOT show creative slots — they reference the original deliverables
  const isHandoffTask = !!task.handoffSourceTaskId;
  const showCreativeSlots = !isHandoffTask ? taskUsesCreativeSlots(task, brief) : false;
  const creativesRequired = taskCreativesTarget(task, brief);
  const rawNext = STATUS_FLOW[status];
  const nextStatus = isDelivered ? null : (rawNext === "done" && !isAdmin) ? null : rawNext;

  // The status is patched locally (useUpdateTaskStatus), so don't hold the
  // button behind a spinner while the server catches up; a failure rolls the
  // status back and says why.
  function setStatus(newStatus: "pending" | "in-progress" | "review" | "done") {
    updateTaskStatus({ taskId: taskId as Id<"tasks">, newStatus }).catch((err) =>
      toast("error", err instanceof Error ? err.message : "Couldn't update the status")
    );
  }

  function handleStatusUpdate() {
    if (!nextStatus) return;
    setStatus(nextStatus as "pending" | "in-progress" | "review" | "done");
  }

  async function handleDeleteTask() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteTaskMutation({ taskId: taskId as Id<"tasks"> });
      onClose();
    } catch (err) {
      setIsDeleting(false);
      setConfirmDelete(false);
      toast("error", err instanceof Error ? err.message : "The task could not be deleted");
    }
  }

  async function handleSubmitDeliverable(
    e: React.FormEvent | null,
    routeTo: "tl" | "bm" | "as" = "tl"
  ) {
    if (e) e.preventDefault();
    if (!deliverableMessage.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let r2FileKeys: string[] = [];
      let r2FileNames: string[] = [];

      if (deliverableFiles.length > 0) {
        for (const file of deliverableFiles) {
          // Get presigned upload URL from our R2 API
          const presignRes = await fetch("/api/r2-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ fileName: file.name, contentType: file.type }),
          });
          if (!presignRes.ok) throw new Error("Could not prepare upload");
          const { uploadUrl, fileKey } = await presignRes.json();
          // PUT file directly to R2
          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
          r2FileKeys.push(fileKey);
          r2FileNames.push(file.name);
        }
      }

      const payload = {
        taskId: taskId as Id<"tasks">,
        message: deliverableMessage.trim(),
        link: deliverableLink.trim() || undefined,
        ...(r2FileKeys.length > 0 ? { r2FileKeys, r2FileNames } : {}),
      };

      if (routeTo === "bm") {
        await submitDirectToManager(payload);
      } else if (routeTo === "as") {
        await submitDirectToAssignor(payload);
      } else {
        await submitDeliverable(payload);
      }
      setDeliverableMessage("");
      setDeliverableLink("");
      setDeliverableFiles([]);
      setShowDeliverableForm(false);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEditForm() {
    if (!task) return;
    setEditTitle(task.title);
    setEditDesc(task.description ?? "");
    setEditTeamFilter("");
    setEditAssignee(task.assigneeId);
    setEditDeadline(task.deadline);
    if (task.deadline) {
      const d = new Date(task.deadline);
      setEditDeadlineTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setEditDeadlineTime("");
    }
    setShowEditForm(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (isSavingEdit || !task) return;
    if (!editAssignee) {
      toast("error", "Select an assignee");
      return;
    }
    setIsSavingEdit(true);
    try {
      let finalDeadline = editDeadline;
      if (editDeadline !== undefined && editDeadlineTime) {
        const [hh, mm] = editDeadlineTime.split(":").map(Number);
        const d = new Date(editDeadline);
        d.setHours(hh, mm, 0, 0);
        finalDeadline = d.getTime();
      }
      await updateTask({
        taskId: taskId as Id<"tasks">,
        title: editTitle,
        description: editDesc,
        assigneeId: editAssignee as Id<"users">,
        ...(finalDeadline !== undefined ? { deadline: finalDeadline } : { clearDeadline: true }),
      });
      setShowEditForm(false);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setIsSavingEdit(false);
    }
  }

  const sortedDeliverables = [...(deliverables ?? [])].sort(
    (a, b) => a.submittedAt - b.submittedAt
  );
  const emptySlots = showCreativeSlots
    ? Math.max(0, creativesRequired - sortedDeliverables.length)
    : 0;

  const DELIVERABLE_STATUS: Record<
    string,
    { label: string; variant: "neutral" | "employee" | "danger" }
  > = {
    pending: { label: "Pending review", variant: "neutral" },
    approved: { label: "Approved", variant: "employee" },
    rejected: { label: "Changes requested", variant: "danger" },
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50 animate-fadeIn"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] bg-white shadow-2xl border-l border-[var(--border)] flex flex-col animate-slidePanelIn">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-[18px] tracking-tight text-[var(--text-primary)] leading-snug">
              {task.title}
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              {brief?.title ?? "Unknown brief"}
            </p>
            {/* At a glance: status, due date, who has it */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-2.5">
              <StatusBadge color={statusInfo.dot} label={statusInfo.label} />
              {task.deadline && (
                <Badge variant={isTaskOverdue(task) ? "danger" : "neutral"} className="gap-1">
                  <Calendar className="h-3 w-3" />
                  {isTaskOverdue(task) ? "Overdue · " : "Due "}
                  {new Date(task.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </Badge>
              )}
              {assignee && (
                <Badge className="gap-1">
                  <User className="h-3 w-3" />
                  {assignee.name ?? assignee.email}
                </Badge>
              )}
            </div>
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              {editingTag ? (
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void setTaskTagMut({ taskId: task._id, tag: tagDraft.trim() || undefined }).catch(() => {});
                      setEditingTag(false);
                    }
                    if (e.key === "Escape") setEditingTag(false);
                  }}
                  onBlur={() => {
                    void setTaskTagMut({ taskId: task._id, tag: tagDraft.trim() || undefined }).catch(() => {});
                    setEditingTag(false);
                  }}
                  placeholder="Tag name"
                  className={`w-32 ${FIELD}`}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTag(true);
                    setTagDraft((task as { tag?: string }).tag ?? "");
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                    (task as { tag?: string }).tag
                      ? "text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] border border-dashed border-[var(--border-strong)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
                  title="Edit category tag"
                >
                  <TagIcon className="h-3 w-3" />
                  {(task as { tag?: string }).tag ?? "Add tag"}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center">
            {isAdmin && !isEditLocked && (
              <button
                onClick={openEditForm}
                className={ICON_BTN}
                title="Edit task"
                aria-label="Edit task"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setConfirmDelete(true)}
                className={ICON_BTN_DANGER}
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className={ICON_BTN}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Brief-status notice — explains why this task can show in
              Worklog / My Tasks / Oversight but not on the Briefs page. */}
          {!brief && (
            <div className="px-5 py-3 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                The brief this task belonged to was deleted.
              </p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                The task still appears in Worklog / My Tasks / Oversight
                because the task record itself still exists, but it is
                gone from the Briefs page because its brief no longer
                exists.
              </p>
            </div>
          )}
          {brief && brief.status === "archived" && (
            <div className="px-5 py-3 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                This task&apos;s brief is archived.
              </p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Archived briefs are hidden from the Briefs page, so this
                task still shows in Worklog / My Tasks / Oversight but not
                under Briefs. Restore the brief from Archive to bring it
                back.
              </p>
            </div>
          )}
          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="px-5 py-3 bg-[var(--danger-dim)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <p className="text-[13px] text-[var(--danger)] font-medium">
                Delete this task permanently?
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="destructive" onClick={handleDeleteTask} loading={isDeleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Reassign: unassigned (admin) or assignee handoff */}
          {showReassignBanner && (
            <div className={`px-5 py-3 border-b border-[var(--border-subtle)] ${!assignee ? "bg-[var(--warning-dim)]" : "bg-[var(--bg-primary)]"}`}>
              {!showReassign && !assignee ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[var(--warning)] shrink-0" />
                    <p className="text-[13px] text-[var(--warning)] font-medium">
                      This task&apos;s assignee has been removed. Please reassign.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setShowReassign(true)} className="shrink-0">
                    <UserPlus className="h-3.5 w-3.5" />
                    Reassign
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <UserPlus className={`h-4 w-4 shrink-0 ${!assignee ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`} />
                    <p className={`text-[13px] font-medium ${!assignee ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>
                      Select a new assignee
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      className={`flex-1 min-w-0 ${FIELD}`}
                    >
                      <option value="">Select employee</option>
                      {editAllMembers.map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {(emp.name ?? emp.email ?? "Unknown") as string}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={async () => {
                        if (!reassignTarget || isReassigning) return;
                        setIsReassigning(true);
                        try {
                          await reassignTaskMutation({
                            taskId: taskId as Id<"tasks">,
                            newAssigneeId: reassignTarget as Id<"users">,
                          });
                          setShowReassign(false);
                          setReassignTarget("");
                        } finally {
                          setIsReassigning(false);
                        }
                      }}
                      disabled={!reassignTarget || isReassigning}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowReassign(false);
                        setReassignTarget("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status: where the task is, and the one step that moves it on */}
          <div className="p-5 space-y-3">
            {/* Status bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge color={statusInfo.dot} label={statusInfo.label} />
              {isDelivered && (
                <Badge className="gap-1">
                  <Lock className="h-3 w-3" />
                  Task done by employee
                </Badge>
              )}
              {isDelivered && canRedo && !showRedoForm && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowRedoForm(true)}
                  title="Send this task back for changes"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Request Redo
                </Button>
              )}
              {isBriefOnHold && (
                <StatusBadge color={BRIEF_STATUS_COLORS.on_hold} label="Brief on hold" />
              )}
              {/* Employees: only show a "Start" button when task is pending */}
              {canUpdateStatus && isAssignee && !isAdmin && status === "pending" && (
                <Button onClick={() => setStatus("in-progress")}>
                  <Play className="h-3.5 w-3.5" />
                  Start Task
                </Button>
              )}
              {/* Admins: keep full status flow control */}
              {canUpdateStatus && isAdmin && nextStatus && status !== "done" && (
                <Button onClick={handleStatusUpdate}>
                  <ChevronRight className="h-3.5 w-3.5" />
                  Move to {taskStatusMeta(nextStatus).label}
                </Button>
              )}
              {/* Super admins can close a task outright, from any status. */}
              {user?.isSuperAdmin && status !== "done" && nextStatus !== "done" && (
                <Button variant="secondary" onClick={() => setStatus("done")}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Close task
                </Button>
              )}
              {isAssignee && !isAdmin && status === "in-progress" && (
                <span className="text-[12px] text-[var(--text-muted)]">
                  Submit a deliverable when ready
                </span>
              )}
              {isAssignee && !isAdmin && status === "review" && (
                <span className="text-[12px] text-[var(--text-muted)]">
                  Submit a deliverable for approval
                </span>
              )}
            </div>

            {/* Redo prompt: visible only when admin clicked Request Redo on a done task */}
            {showRedoForm && isDelivered && isAdmin && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 space-y-2">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                  Request a redo for this task
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  This reopens the task (status returns to In Progress) and pushes the latest deliverable back through the approval flow. The brief will move out of Completed automatically.
                </p>
                <textarea
                  value={redoNote}
                  onChange={(e) => setRedoNote(e.target.value)}
                  placeholder="Why does this need to be redone? (required)"
                  rows={2}
                  className={`w-full py-1.5 ${FIELD}`}
                  autoFocus
                />
                {(() => {
                  const deadlinePast =
                    !!task.deadline && task.deadline < Date.now();
                  return (
                    <div>
                      <label className={FIELD_LABEL}>
                        New deadline{deadlinePast ? " (required, old deadline has passed)" : " (optional)"}
                      </label>
                      <input
                        type="date"
                        value={redoDeadline}
                        onChange={(e) => setRedoDeadline(e.target.value)}
                        className={`w-full ${FIELD}`}
                      />
                      {deadlinePast && !redoDeadline && (
                        <p className="text-[12px] text-[var(--warning)] mt-1">
                          This task&apos;s deadline already passed. Set a new one so the assignee isn&apos;t flagged overdue immediately.
                        </p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    disabled={
                      isSubmittingRedo ||
                      !redoNote.trim() ||
                      (!!task.deadline &&
                        task.deadline < Date.now() &&
                        !redoDeadline)
                    }
                    onClick={async () => {
                      if (!redoNote.trim()) return;
                      const deadlinePast =
                        !!task.deadline && task.deadline < Date.now();
                      if (deadlinePast && !redoDeadline) {
                        toast(
                          "error",
                          "Set a new deadline. The old one has passed."
                        );
                        return;
                      }
                      setIsSubmittingRedo(true);
                      try {
                        await requestTaskRedo({
                          taskId: taskId as Id<"tasks">,
                          note: redoNote.trim(),
                          ...(redoDeadline
                            ? {
                                newDeadline: new Date(
                                  redoDeadline + "T23:59:59"
                                ).getTime(),
                              }
                            : {}),
                        });
                        setShowRedoForm(false);
                        setRedoNote("");
                        setRedoDeadline("");
                        toast("success", "Redo requested");
                      } catch (err) {
                        toast(
                          "error",
                          err instanceof Error
                            ? err.message
                            : "Could not request redo"
                        );
                      } finally {
                        setIsSubmittingRedo(false);
                      }
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Send Back for Redo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowRedoForm(false);
                      setRedoNote("");
                      setRedoDeadline("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

          </div>

          {/* Details: who, when, and what was asked for */}
          <div className={SECTION}>
            <SectionHeader title="Details" className="" />
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] flex-wrap">
                <User className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                <span>
                  {assignee?.name ?? assignee?.email ?? "Unassigned"}
                </span>
                {assignee && canReassignTask && !showReassign && (
                  <button
                    type="button"
                    onClick={() => setShowReassign(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-[var(--text-secondary)] bg-white border border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <UserPlus className="h-3 w-3" />
                    Reassign
                  </button>
                )}
              </div>
              {task.duration && (
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>{task.duration}</span>
                </div>
              )}
              {task.deadline && (
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>
                    {new Date(task.deadline).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    {new Date(task.deadline).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                  {task.deadlineExtended && (
                    <Badge>Extended</Badge>
                  )}
                </div>
              )}
              {task.deadlineExtended && task.originalDeadline && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                  <span>Original deadline: {new Date(task.originalDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(task.originalDeadline).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </div>
              )}
              {assignedBy && (
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] min-w-0">
                  <User className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  <span className="truncate">
                    Assigned by {assignedBy.name ?? assignedBy.email}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {(task.description || brief?.description) && (
              <div>
                <h4 className="font-medium text-[12px] text-[var(--text-muted)] mb-1.5">
                  Description
                </h4>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {task.description || brief?.description}
                </p>
              </div>
            )}

            {/* Creative Copy & Caption (content calendar tasks) */}
            {task.creativeCopy && (
              <div>
                <h4 className="font-medium text-[12px] text-[var(--text-muted)] mb-1.5">
                  Creative copy
                </h4>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {task.creativeCopy}
                </p>
              </div>
            )}
            {task.caption && (
              <div>
                <h4 className="font-medium text-[12px] text-[var(--text-muted)] mb-1.5">
                  Caption
                </h4>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {task.caption}
                </p>
              </div>
            )}
          </div>

          {/* Daily Summaries Section */}
          <div className={SECTION}>
            <div className="flex items-center justify-between gap-3">
              <SectionHeader title="Daily summaries" count={dailySummaries?.length} className="" />
              {isAssignee && task.status !== "done" && (
                <Button
                  variant="secondary"
                  onClick={() => { setShowSummaryForm(!showSummaryForm); setSummaryDate(new Date().toLocaleDateString("en-CA")); setSummaryText(""); }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {showSummaryForm ? "Cancel" : "Add Daily Update"}
                </Button>
              )}
            </div>

            {showSummaryForm && (
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)] space-y-2">
                <div>
                  <label className={FIELD_LABEL}>Date</label>
                  <input
                    type="date"
                    value={summaryDate}
                    onChange={(e) => setSummaryDate(e.target.value)}
                    className={`w-full ${FIELD}`}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Summary</label>
                  <textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    placeholder="What did you work on today?"
                    rows={3}
                    className={`w-full py-1.5 resize-none ${FIELD}`}
                  />
                </div>
                <Button
                  onClick={async () => {
                    if (!summaryText.trim()) return;
                    setIsAddingSummary(true);
                    try {
                      await addDailySummary({ taskId: taskId as Id<"tasks">, date: summaryDate, summary: summaryText.trim() });
                      setShowSummaryForm(false);
                      setSummaryText("");
                      toast("success", "Summary added");
                    } catch (err: any) {
                      toast("error", err.message ?? "Failed to add summary");
                    } finally { setIsAddingSummary(false); }
                  }}
                  disabled={isAddingSummary || !summaryText.trim()}
                >
                  Save
                </Button>
              </div>
            )}

            {(dailySummaries ?? []).length > 0 ? (
              <div className="space-y-2">
                {(dailySummaries ?? []).map((s: any, idx: number) => (
                  <div key={s._id} className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[12px] font-medium text-[var(--text-muted)]">
                        Day {idx + 1} - {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      {isAssignee && (
                        <div className="flex items-center">
                          <button
                            onClick={() => { setEditingSummaryId(s._id); setEditingSummaryText(s.summary); }}
                            className={ICON_BTN}
                            aria-label="Edit summary"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              askConfirm({
                                title: "Delete this daily summary?",
                                message: "The summary is removed for everyone on this task. This cannot be undone.",
                                onConfirm: () => deleteDailySummary({ summaryId: s._id }),
                              })
                            }
                            className={ICON_BTN_DANGER}
                            aria-label="Delete summary"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingSummaryId === s._id ? (
                      <div className="space-y-2 mt-1">
                        <textarea
                          value={editingSummaryText}
                          onChange={(e) => setEditingSummaryText(e.target.value)}
                          rows={2}
                          className={`w-full py-1.5 resize-none ${FIELD}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              await updateDailySummary({ summaryId: s._id as Id<"taskDailySummaries">, summary: editingSummaryText.trim() });
                              setEditingSummaryId(null);
                            }}
                          >Save</Button>
                          <Button
                            variant="ghost"
                            onClick={() => setEditingSummaryId(null)}
                          >Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">{s.summary}</p>
                    )}
                    <p className="text-[12px] text-[var(--text-muted)] mt-1">- {s.authorName}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-muted)]">No daily summaries yet.</p>
            )}
          </div>

          <TaskTimeSection
            taskId={taskId as Id<"tasks">}
            canLog={isAssignee || isAdmin}
            taskDone={task.status === "done"}
          />

          {/* Sub-Tasks Section */}
          {((subTasks ?? []).length > 0 || canAddHelper) && (
            <div className={SECTION}>
              <div className="flex items-center justify-between gap-3">
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
                    if (!helperAssignee || !helperDesc.trim() || isCreatingSubTask) return;
                    setIsCreatingSubTask(true);
                    try {
                      await createSubTask({
                        parentTaskId: taskId as Id<"tasks">,
                        assigneeId: helperAssignee as Id<"users">,
                        description: helperDesc.trim(),
                        // Inherit the parent's deadline so reminders/overdue alerts fire.
                        deadline: task.deadline ?? undefined,
                      });
                      setHelperAssignee("");
                      setHelperDesc("");
                      setShowAddHelper(false);
                      toast("success", "Helper added");
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Couldn't add helper");
                    } finally {
                      setIsCreatingSubTask(false);
                    }
                  }}
                  className="space-y-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                >
                  <select
                    value={helperAssignee}
                    onChange={(e) => setHelperAssignee(e.target.value)}
                    className={`w-full ${FIELD}`}
                    required
                  >
                    <option value="">Select team member...</option>
                    {editAllMembers
                      .filter((u) => u._id !== task.assigneeId)
                      .map((u) => (
                        <option key={u._id} value={u._id}>
                          {(u.name ?? u.email ?? "Unknown") as string}
                        </option>
                      ))}
                  </select>
                  <textarea
                    value={helperDesc}
                    onChange={(e) => setHelperDesc(e.target.value)}
                    placeholder="Describe the sub-task..."
                    className={`w-full py-1.5 min-h-[50px] ${FIELD}`}
                    required
                  />
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

              <div className="space-y-1.5">
                {(subTasks ?? []).map((st: any) => {
                  const stStatus = taskStatusMeta(st.status);
                  return (
                    <div key={st._id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[var(--text-primary)] leading-snug">
                          {st.description ?? st.title}
                        </p>
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                          {st.assigneeName}{st.duration ? ` · ${st.duration}` : ""}
                        </p>
                      </div>
                      <StatusBadge color={stStatus.dot} label={stStatus.label} className="shrink-0" />
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
                  );
                })}
              </div>
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
          )}

          {/* Upstream resources from connected tasks */}
          {task.referenceLinks && task.referenceLinks.length > 0 && (
            <>
              <div className="border-t border-[var(--border-subtle)]" />
              <div className="p-5 space-y-3">
                <SectionHeader title="Resources from upstream tasks" className="" />
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {task.referenceLinks.length} resource{task.referenceLinks.length !== 1 ? "s" : ""} passed from connected tasks
                </p>
                <div className="space-y-2 mt-2">
                  {task.referenceLinks.map((url: string, i: number) => {
                    const isFile = url.includes("/storage/") || url.includes("convex.cloud") || url.includes("/api/r2-file");
                    const label = isFile
                      ? `File ${i + 1}`
                      : (() => {
                          try { return new URL(url).hostname; } catch { return url; }
                        })();
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] transition-colors group"
                      >
                        {isFile ? (
                          <FileText className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                        ) : (
                          <ExternalLink className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                        )}
                        <span className="text-[13px] text-[var(--accent-admin-text)] group-hover:underline truncate">
                          {label}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="border-t border-[var(--border-subtle)]" />

          {/* Deliverables section */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <SectionHeader title="Deliverables" className="" />
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {showCreativeSlots
                    ? `${deliverables?.length ?? 0} / ${creativesRequired} creative${creativesRequired !== 1 ? "s" : ""} submitted`
                    : `${deliverables?.length ?? 0} deliverable${(deliverables?.length ?? 0) !== 1 ? "s" : ""} submitted`}
                </p>
              </div>
              {isAssignee && status !== "done" && (
                <Button variant="secondary" onClick={() => setShowDeliverableForm(!showDeliverableForm)}>
                  <Send className="h-3.5 w-3.5" />
                  Submit deliverable
                </Button>
              )}
            </div>

            {/* Submit form */}
            {showDeliverableForm && (
              <form
                onSubmit={(e) => handleSubmitDeliverable(e, "tl")}
                className="space-y-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                <div>
                  <label className={FIELD_LABEL}>
                    Description <span className="text-[var(--danger)]">*</span>
                  </label>
                  <textarea
                    value={deliverableMessage}
                    onChange={(e) => setDeliverableMessage(e.target.value)}
                    placeholder="Describe what you're delivering..."
                    className={`w-full py-1.5 min-h-[70px] ${FIELD}`}
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  <input
                    value={deliverableLink}
                    onChange={(e) => setDeliverableLink(e.target.value)}
                    placeholder="Link (optional): Figma, Drive, etc."
                    className={`flex-1 min-w-0 ${FIELD}`}
                  />
                </div>
                <div>
                  <label className="inline-flex items-center gap-1.5 h-control px-3 rounded-control border border-dashed border-[var(--border-strong)] bg-white text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach files
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          setDeliverableFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                        }
                      }}
                    />
                  </label>
                  {deliverableFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {deliverableFiles.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[12px] text-[var(--text-secondary)]">
                          {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                          <span className="max-w-[120px] truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setDeliverableFiles((prev) => prev.filter((_, j) => j !== i))}
                            aria-label={`Remove ${f.name}`}
                            className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] text-[var(--text-muted)]">Route to</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={!deliverableMessage.trim() || isSubmitting}
                      loading={isSubmitting}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Team Lead
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!deliverableMessage.trim() || isSubmitting}
                      onClick={() => handleSubmitDeliverable(null, "bm")}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Brand Manager
                    </Button>
                    {task?.assignedBy && task.assignedBy !== user?._id && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!deliverableMessage.trim() || isSubmitting}
                        onClick={() => handleSubmitDeliverable(null, "as")}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Assignor
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowDeliverableForm(false)}
                    className="self-start mt-1"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {/* Deliverables list */}
            <div className="space-y-2">
              {sortedDeliverables.map((d, idx) => {
                const ds =
                  DELIVERABLE_STATUS[d.status ?? "pending"] ??
                  DELIVERABLE_STATUS.pending;
                return (
                  <div
                    key={d._id}
                    className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                  >
                    <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">
                      {showCreativeSlots ? `Creative ${idx + 1}` : `Deliverable ${idx + 1}`}
                    </p>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[12px] text-[var(--text-secondary)]">
                        {d.submitterName} &middot;{" "}
                        {new Date(d.submittedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={ds.variant}>{ds.label}</Badge>
                        {user?.role === "admin" && (
                          <button
                            onClick={() => setConfirmDeleteDeliverableId(d._id)}
                            className={ICON_BTN_DANGER}
                            title="Delete deliverable"
                            aria-label="Delete deliverable"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] text-[var(--text-primary)] leading-relaxed break-words">
                      {d.message}
                    </p>
                    {d.link && (
                      <a
                        href={d.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-1 mt-1.5 text-[12px] text-[var(--accent-admin-text)] hover:underline min-w-0"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="min-w-0 break-all">{d.link}</span>
                      </a>
                    )}
                    {(d as any).files?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(d as any).files.map((file: { name: string; url: string }, idx: number) => {
                          const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              {isImage ? <ImageIcon className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
                              <span className="max-w-[120px] truncate">{file.name}</span>
                              <Eye className="h-3 w-3 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {d.reviewNote && (
                      <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-md bg-white border border-[var(--border-subtle)]">
                        <MessageSquare className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[12px] font-medium text-[var(--text-secondary)]">
                            {d.reviewerName ?? "Reviewer"}:
                          </p>
                          <p className="text-[12px] text-[var(--text-secondary)]">
                            {d.reviewNote}
                          </p>
                        </div>
                      </div>
                    )}
                    {confirmDeleteDeliverableId === d._id && (
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                        <p className="text-[12px] text-[var(--danger)] font-medium">Delete this deliverable?</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="destructive"
                            onClick={async () => {
                              setIsDeletingDeliverable(true);
                              await deleteDeliverable({ deliverableId: d._id });
                              setIsDeletingDeliverable(false);
                              setConfirmDeleteDeliverableId(null);
                            }}
                            disabled={isDeletingDeliverable}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmDeleteDeliverableId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {showCreativeSlots &&
                Array.from({ length: emptySlots }).map((_, j) => {
                const n = sortedDeliverables.length + j + 1;
                return (
                  <div
                    key={`empty-creative-${n}`}
                    className="p-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-primary)]"
                  >
                    <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">
                      Creative {n}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)]">Not submitted yet</p>
                  </div>
                );
              })}
              {sortedDeliverables.length === 0 && emptySlots === 0 && (
                <p className="text-[12px] text-[var(--text-muted)]">
                  No deliverables submitted yet.
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)]" />

          {/* Attachments */}
          <div className="p-5">
            <AttachmentList parentType="task" parentId={taskId} />
          </div>

          <div className="border-t border-[var(--border-subtle)]" />

          {/* Comments / Chat */}
          <div className="p-5">
            <CommentThread parentType="task" parentId={taskId} />
          </div>
        </div>
      </div>

      {/* Edit Task Modal */}
      {showEditForm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setShowEditForm(false)}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl border border-[var(--border)] shadow-2xl">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
                <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">Edit task</h3>
                <button
                  onClick={() => setShowEditForm(false)}
                  className={ICON_BTN}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSaveEdit} className="p-5 flex flex-col gap-4">
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Title</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    className={`w-full ${FIELD}`}
                  />
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className={`w-full py-1.5 ${FIELD}`}
                  />
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Team</label>
                  <select
                    value={editTeamFilter}
                    onChange={(e) => { setEditTeamFilter(e.target.value); setEditAssignee(""); }}
                    className={`w-full ${FIELD}`}
                  >
                    <option value="">All teams</option>
                    {editBriefTeams.map((t) => (
                      <option key={t.team._id} value={t.team._id}>{t.team.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Assignee</label>
                  <select
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className={`w-full ${FIELD}`}
                  >
                    <option value="">Select employee</option>
                    {editFilteredEmployees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {(emp.name ?? emp.email ?? "Unknown") as string}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Deadline</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <DatePicker
                        value={editDeadline}
                        onChange={setEditDeadline}
                        placeholder="Set task deadline"
                      />
                    </div>
                    <input
                      type="time"
                      value={editDeadlineTime}
                      onChange={(e) => setEditDeadlineTime(e.target.value)}
                      className={`w-28 ${FIELD}`}
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" loading={isSavingEdit}>
                    <Check className="h-3.5 w-3.5" />
                    Save Changes
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowEditForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </>
  );
}
