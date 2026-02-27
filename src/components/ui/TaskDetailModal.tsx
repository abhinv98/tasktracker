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
  const [editDurationValue, setEditDurationValue] = useState("");
  const [editDurationUnit, setEditDurationUnit] = useState<"m" | "h" | "d">("h");
  const [editDeadline, setEditDeadline] = useState<number | undefined>(undefined);
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
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);

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
  const isAdminOrManager = user.role === "admin" || user.role === "manager";
  const canUpdateStatus = isAssignee || isAdminOrManager;
  const rawNext = STATUS_FLOW[status];
  const nextStatus = (rawNext === "done" && !isAdminOrManager) ? null : rawNext;

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
    const durMatch = task.duration.match(/^(\d+)(m|h|d)$/i);
    setEditDurationValue(durMatch ? durMatch[1] : "2");
    setEditDurationUnit((durMatch ? durMatch[2].toLowerCase() : "h") as "m" | "h" | "d");
    setEditDeadline(task.deadline);
    setShowEditForm(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (isSavingEdit || !task) return;
    const numVal = parseInt(editDurationValue, 10);
    if (!numVal || numVal <= 0) return;
    setIsSavingEdit(true);
    try {
      const duration = `${numVal}${editDurationUnit}`;
      const durationMinutes = parseDuration(duration);
      await updateTask({
        taskId: taskId as Id<"tasks">,
        title: editTitle,
        description: editDesc || undefined,
        assigneeId: editAssignee as Id<"users">,
        duration,
        durationMinutes,
        ...(editDeadline !== undefined ? { deadline: editDeadline } : { clearDeadline: true }),
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
            {isAdminOrManager && (
              <button
                onClick={openEditForm}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
                title="Edit task"
              >
                <Pencil className="h-4 w-4" />
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
              {isAssignee && !isAdminOrManager && status === "review" && (
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
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{task.duration}</span>
              </div>
              {task.deadline && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>
                    {new Date(task.deadline).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
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
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium"
                        style={{ backgroundColor: ds.bg, color: ds.color }}
                      >
                        {ds.label}
                      </span>
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
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Estimated Duration</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={editDurationValue}
                      onChange={(e) => setEditDurationValue(e.target.value)}
                      required
                      className="w-20 px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                    <select
                      value={editDurationUnit}
                      onChange={(e) => setEditDurationUnit(e.target.value as "m" | "h" | "d")}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    >
                      <option value="m">Minutes</option>
                      <option value="h">Hours</option>
                      <option value="d">Days</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-1.5">Deadline</label>
                  <DatePicker
                    value={editDeadline}
                    onChange={setEditDeadline}
                    placeholder="Set task deadline"
                  />
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
