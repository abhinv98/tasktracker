"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AttachmentList } from "./AttachmentList";
import { CommentThread } from "../comments/CommentThread";
import { DatePicker } from "./DatePicker";
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
  AlertTriangle,
  UserPlus,
} from "lucide-react";
import { FilePreviewModal } from "./FilePreviewModal";

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
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: {
    label: "To Do",
    color: "var(--text-muted)",
    bg: "var(--bg-hover)",
  },
  "in-progress": {
    label: "In Progress",
    color: "#3B82F6",
    bg: "#EFF6FF",
  },
  review: {
    label: "In Review",
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  done: {
    label: "Done",
    color: "var(--accent-employee)",
    bg: "var(--accent-employee-dim)",
  },
};

const STATUS_FLOW: Record<string, string> = {
  pending: "in-progress",
  "in-progress": "review",
  review: "done",
};

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const detail = useQuery(api.tasks.getTaskDetail, {
    taskId: taskId as Id<"tasks">,
  });
  const user = useQuery(api.users.getCurrentUser);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const submitDeliverable = useMutation(api.approvals.submitDeliverable);
  const deliverables = useQuery(api.approvals.listDeliverables, {
    taskId: taskId as Id<"tasks">,
  });

  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const updateTask = useMutation(api.tasks.updateTask);
  const reassignTaskMutation = useMutation(api.tasks.reassignTask);
  const deleteTaskMutation = useMutation(api.tasks.deleteTask);
  const deleteDeliverable = useMutation(api.approvals.deleteDeliverable);

  const subTasks = useQuery(api.tasks.getSubTasks, { parentTaskId: taskId as Id<"tasks"> });
  const createSubTask = useMutation(api.tasks.createSubTask);
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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
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
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [summaryDate, setSummaryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summaryText, setSummaryText] = useState("");
  const [isAddingSummary, setIsAddingSummary] = useState(false);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editingSummaryText, setEditingSummaryText] = useState("");

  // Escape to close
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
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      </>
    );
  }

  const { task, brief, assignee, assignedBy } = detail;
  if (!task) return null;

  const status = task.status;
  const statusInfo = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const isAssignee = user._id === task.assigneeId;
  const isAdmin = user.role === "admin";
  const canUpdateStatus = isAssignee || isAdmin;
  const rawNext = STATUS_FLOW[status];
  const nextStatus = (rawNext === "done" && !isAdmin) ? null : rawNext;

  async function handleStatusUpdate() {
    if (!nextStatus || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await updateTaskStatus({
        taskId: taskId as Id<"tasks">,
        newStatus: nextStatus as "pending" | "in-progress" | "review" | "done",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handleDeleteTask() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteTaskMutation({ taskId: taskId as Id<"tasks"> });
      onClose();
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleSubmitDeliverable(e: React.FormEvent) {
    e.preventDefault();
    if (!deliverableMessage.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let fileIds: Id<"_storage">[] = [];
      let fileNames: string[] = [];

      if (deliverableFiles.length > 0) {
        for (const file of deliverableFiles) {
          const url = await generateUploadUrl();
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
          const { storageId } = await res.json();
          fileIds.push(storageId);
          fileNames.push(file.name);
        }
      }

      await submitDeliverable({
        taskId: taskId as Id<"tasks">,
        message: deliverableMessage.trim(),
        link: deliverableLink.trim() || undefined,
        ...(fileIds.length > 0 ? { fileIds, fileNames } : {}),
      });
      setDeliverableMessage("");
      setDeliverableLink("");
      setDeliverableFiles([]);
      setShowDeliverableForm(false);
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
        description: editDesc || undefined,
        assigneeId: editAssignee as Id<"users">,
        ...(finalDeadline !== undefined ? { deadline: finalDeadline } : { clearDeadline: true }),
      });
      setShowEditForm(false);
    } finally {
      setIsSavingEdit(false);
    }
  }

  const DELIVERABLE_STATUS: Record<
    string,
    { label: string; color: string; bg: string }
  > = {
    pending: {
      label: "Pending Review",
      color: "var(--accent-admin)",
      bg: "var(--accent-admin-dim)",
    },
    approved: {
      label: "Approved",
      color: "var(--accent-employee)",
      bg: "var(--accent-employee-dim)",
    },
    rejected: {
      label: "Changes Requested",
      color: "var(--danger)",
      bg: "var(--danger-dim)",
    },
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
            <h2 className="font-bold text-[16px] text-[var(--text-primary)] leading-snug">
              {task.title}
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              {brief?.title ?? "Unknown brief"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                onClick={openEditForm}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
                title="Edit task"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-50 transition-colors"
                title="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between gap-3">
              <p className="text-[13px] text-[var(--danger)] font-medium">
                Delete this task permanently?
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDeleteTask}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--danger)] hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-white hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Reassign banner for unassigned tasks */}
          {!assignee && isAdmin && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
              {!showReassign ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-[13px] text-amber-700 font-medium">
                      This task&apos;s assignee has been removed. Please reassign.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowReassign(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors shrink-0"
                  >
                    <UserPlus className="h-3 w-3" />
                    Reassign
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-[13px] text-amber-700 font-medium">Select a new assignee</p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">Select employee</option>
                      {editAllMembers.map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {(emp.name ?? emp.email ?? "Unknown") as string}
                        </option>
                      ))}
                    </select>
                    <button
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50"
                    >
                      {isReassigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {isReassigning ? "Saving..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => { setShowReassign(false); setReassignTarget(""); }}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status & Meta */}
          <div className="p-5 space-y-4">
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-semibold"
                style={{ color: statusInfo.color, backgroundColor: statusInfo.bg }}
              >
                {statusInfo.label}
              </span>
              {canUpdateStatus && nextStatus && status !== "done" && (
                <button
                  onClick={handleStatusUpdate}
                  disabled={isUpdatingStatus}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors disabled:opacity-60"
                >
                  {isUpdatingStatus ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Move to {STATUS_CONFIG[nextStatus]?.label}
                </button>
              )}
              {isAssignee && !isAdmin && status === "review" && (
                <span className="text-[11px] text-[var(--text-muted)] italic">
                  Submit a deliverable for approval
                </span>
              )}
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>
                  {assignee?.name ?? assignee?.email ?? "Unassigned"}
                </span>
              </div>
              {task.duration && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>{task.duration}</span>
                </div>
              )}
              {task.deadline && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
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
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-50 text-yellow-700">
                      EXTENDED
                    </span>
                  )}
                </div>
              )}
              {task.deadlineExtended && task.originalDeadline && (
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>Original deadline: {new Date(task.originalDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(task.originalDeadline).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </div>
              )}
              {assignedBy && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="truncate">
                    Assigned by {assignedBy.name ?? assignedBy.email}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <h4 className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Description
                </h4>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {task.description}
                </p>
              </div>
            )}
          </div>

          {/* Daily Summaries Section */}
          <div className="p-5 space-y-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide">
                Daily Summaries ({dailySummaries?.length ?? 0})
              </h4>
              {isAssignee && task.status !== "done" && (
                <button
                  onClick={() => { setShowSummaryForm(!showSummaryForm); setSummaryDate(new Date().toISOString().slice(0, 10)); setSummaryText(""); }}
                  className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  {showSummaryForm ? "Cancel" : "Add Daily Update"}
                </button>
              )}
            </div>

            {showSummaryForm && (
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)] space-y-2">
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">Date</label>
                  <input
                    type="date"
                    value={summaryDate}
                    onChange={(e) => setSummaryDate(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">Summary</label>
                  <textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    placeholder="What did you work on today?"
                    rows={3}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!summaryText.trim()) return;
                    setIsAddingSummary(true);
                    try {
                      await addDailySummary({ taskId: taskId as Id<"tasks">, date: summaryDate, summary: summaryText.trim() });
                      setShowSummaryForm(false);
                      setSummaryText("");
                    } catch (err: any) {
                      alert(err.message ?? "Failed to add summary");
                    } finally { setIsAddingSummary(false); }
                  }}
                  disabled={isAddingSummary || !summaryText.trim()}
                  className="px-3 py-1.5 bg-[var(--accent-admin)] text-white rounded-lg text-[11px] font-semibold disabled:opacity-50"
                >
                  {isAddingSummary ? "Saving..." : "Save"}
                </button>
              </div>
            )}

            {(dailySummaries ?? []).length > 0 ? (
              <div className="space-y-2">
                {(dailySummaries ?? []).map((s: any, idx: number) => (
                  <div key={s._id} className="bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-[var(--accent-admin)]">
                        Day {idx + 1} — {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      {isAssignee && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditingSummaryId(s._id); setEditingSummaryText(s.summary); }}
                            className="text-[var(--text-muted)] hover:text-[var(--accent-admin)]"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={async () => { await deleteDailySummary({ summaryId: s._id }); }}
                            className="text-[var(--text-muted)] hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
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
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={async () => {
                              await updateDailySummary({ summaryId: s._id as Id<"taskDailySummaries">, summary: editingSummaryText.trim() });
                              setEditingSummaryId(null);
                            }}
                            className="px-2.5 py-1 bg-[var(--accent-admin)] text-white rounded text-[10px] font-semibold"
                          >Save</button>
                          <button
                            onClick={() => setEditingSummaryId(null)}
                            className="px-2.5 py-1 bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded text-[10px] font-semibold"
                          >Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12px] text-[var(--text-primary)] whitespace-pre-wrap">{s.summary}</p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">— {s.authorName}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-muted)]">No daily summaries yet.</p>
            )}
          </div>

          {/* Sub-Tasks Section */}
          {((subTasks ?? []).length > 0 || isAdmin) && (
            <div className="p-5 space-y-3 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide">
                  Sub-Tasks ({subTasks?.length ?? 0})
                </h4>
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
                    if (!helperAssignee || !helperDesc.trim() || isCreatingSubTask) return;
                    setIsCreatingSubTask(true);
                    try {
                      await createSubTask({
                        parentTaskId: taskId as Id<"tasks">,
                        assigneeId: helperAssignee as Id<"users">,
                        description: helperDesc.trim(),
                      });
                      setHelperAssignee("");
                      setHelperDesc("");
                      setShowAddHelper(false);
                    } finally {
                      setIsCreatingSubTask(false);
                    }
                  }}
                  className="space-y-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                >
                  <select
                    value={helperAssignee}
                    onChange={(e) => setHelperAssignee(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
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
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] min-h-[50px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                    required
                  />
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

              <div className="space-y-1.5">
                {(subTasks ?? []).map((st: any) => {
                  const stStatus = STATUS_CONFIG[st.status] ?? STATUS_CONFIG.pending;
                  return (
                    <div key={st._id} className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stStatus.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[var(--text-primary)] leading-snug">
                          {st.description ?? st.title}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          {st.assigneeName} &middot; {st.duration}
                        </p>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0"
                        style={{ color: stStatus.color, backgroundColor: stStatus.bg }}
                      >
                        {stStatus.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-[var(--border)]" />

          {/* Deliverables section */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide">
                Deliverables ({deliverables?.length ?? 0})
              </h4>
              {isAssignee && status !== "done" && (
                <button
                  onClick={() => setShowDeliverableForm(!showDeliverableForm)}
                  className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
                >
                  <Send className="h-3 w-3" />
                  Submit deliverable
                </button>
              )}
            </div>

            {/* Submit form */}
            {showDeliverableForm && (
              <form
                onSubmit={handleSubmitDeliverable}
                className="space-y-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                <textarea
                  value={deliverableMessage}
                  onChange={(e) => setDeliverableMessage(e.target.value)}
                  placeholder="Describe what you're delivering..."
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] min-h-[70px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                  required
                />
                <div className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  <input
                    value={deliverableLink}
                    onChange={(e) => setDeliverableLink(e.target.value)}
                    placeholder="Link (optional) — Figma, Drive, etc."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                  />
                </div>
                <div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                    <Paperclip className="h-3 w-3" />
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
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[11px] text-[var(--text-secondary)]">
                          {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                          <span className="max-w-[120px] truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setDeliverableFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!deliverableMessage.trim() || isSubmitting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeliverableForm(false)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Deliverables list */}
            <div className="space-y-2">
              {deliverables?.map((d) => {
                const ds =
                  DELIVERABLE_STATUS[d.status ?? "pending"] ??
                  DELIVERABLE_STATUS.pending;
                return (
                  <div
                    key={d._id}
                    className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-[12px] text-[var(--text-secondary)]">
                        {d.submitterName} &middot;{" "}
                        {new Date(d.submittedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                          style={{ backgroundColor: ds.bg, color: ds.color }}
                        >
                          {ds.label}
                        </span>
                        {user?.role === "admin" && (
                          <button
                            onClick={() => setConfirmDeleteDeliverableId(d._id)}
                            className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-50 transition-colors"
                            title="Delete deliverable"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">
                      {d.message}
                    </p>
                    {d.link && (
                      <a
                        href={d.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[var(--accent-admin)] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {d.link}
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
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-admin)] transition-colors"
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
                      <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-white border border-[var(--border-subtle)]">
                        <MessageSquare className="h-3 w-3 text-[var(--text-muted)] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium text-[var(--text-secondary)]">
                            {d.reviewerName ?? "Reviewer"}:
                          </p>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            {d.reviewNote}
                          </p>
                        </div>
                      </div>
                    )}
                    {confirmDeleteDeliverableId === d._id && (
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-red-200">
                        <p className="text-[11px] text-[var(--danger)] font-medium">Delete this deliverable?</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={async () => {
                              setIsDeletingDeliverable(true);
                              await deleteDeliverable({ deliverableId: d._id });
                              setIsDeletingDeliverable(false);
                              setConfirmDeleteDeliverableId(null);
                            }}
                            disabled={isDeletingDeliverable}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-white bg-[var(--danger)] hover:bg-red-700 transition-colors disabled:opacity-60"
                          >
                            {isDeletingDeliverable ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            {isDeletingDeliverable ? "Deleting..." : "Delete"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteDeliverableId(null)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(!deliverables || deliverables.length === 0) && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  No deliverables submitted yet.
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)]" />

          {/* Attachments */}
          <div className="p-5">
            <AttachmentList parentType="task" parentId={taskId} />
          </div>

          <div className="border-t border-[var(--border)]" />

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
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">Edit Task</h3>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
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
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Team</label>
                  <select
                    value={editTeamFilter}
                    onChange={(e) => { setEditTeamFilter(e.target.value); setEditAssignee(""); }}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
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
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
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
                      className="w-28 px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors disabled:opacity-60"
                  >
                    {isSavingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Cancel
                  </button>
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
