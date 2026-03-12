"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Button, ConfirmModal } from "@/components/ui";
import {
  Check, X, MessageSquare, ExternalLink, Paperclip, FileText,
  Image as ImageIcon, Eye, Trash2, ArrowRight, ShieldCheck, Users, UserCheck, Send
} from "lucide-react";
import { FilePreviewModal } from "@/components/ui/FilePreviewModal";
import type { Id } from "@/convex/_generated/dataModel";

type TabType = "my" | "helper_reviews" | "team_approvals" | "brand_deliverables";

export default function DeliverablesPage() {
  const user = useQuery(api.users.getCurrentUser);
  const deliverables = useQuery(api.approvals.listDeliverables, {});
  const teamLeadPending = useQuery(api.approvals.listTeamLeadPendingApprovals);
  const managerDeliverables = useQuery(api.approvals.listManagerDeliverables);
  const myBrandIds = useQuery(api.brands.getMyManagedBrandIds);
  const mainAssigneePending = useQuery(api.approvals.listMainAssigneePendingReviews);

  const approveDeliverable = useMutation(api.approvals.approveDeliverable);
  const rejectDeliverable = useMutation(api.approvals.rejectDeliverable);
  const submitDeliverable = useMutation(api.approvals.submitDeliverable);
  const deleteDeliverableMutation = useMutation(api.approvals.deleteDeliverable);
  const teamLeadApproveMut = useMutation(api.approvals.teamLeadApprove);
  const teamLeadRejectMut = useMutation(api.approvals.teamLeadReject);
  const passToManagerMut = useMutation(api.approvals.passToManager);
  const mainAssigneeApproveMut = useMutation(api.approvals.mainAssigneeApprove);
  const mainAssigneeRejectMut = useMutation(api.approvals.mainAssigneeReject);
  const passSubTaskToTeamLeadMut = useMutation(api.approvals.passSubTaskToTeamLead);
  const sendToClientMut = useMutation(api.jsr.sendToClient);
  const reassignAfterClientFeedback = useMutation(api.approvals.reassignAfterClientFeedback);

  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);
  const [deletingDeliverableId, setDeletingDeliverableId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const [reassignNote, setReassignNote] = useState<Record<string, string>>({});

  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);

  const [showSubmit, setShowSubmit] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitLink, setSubmitLink] = useState("");
  const [submitFiles, setSubmitFiles] = useState<File[]>([]);

  const allTeams = useQuery(api.teams.listTeams, {});
  const haltedUserIds = useQuery(api.tasks.getHaltedUserIds) ?? [];
  const role = user?.role ?? "employee";
  const isAdmin = role === "admin";
  const isActualTeamLead = (allTeams ?? []).some((t: any) => t.leadId === user?._id);
  const isBrandManager = (myBrandIds ?? []).length > 0;

  const hasHelperReviews = (mainAssigneePending ?? []).length > 0;

  const availableTabs: { id: TabType; label: string; count?: number }[] = [
    { id: "my", label: "My Deliverables" },
  ];

  if (hasHelperReviews) {
    availableTabs.push({
      id: "helper_reviews",
      label: "Helper Reviews",
      count: (mainAssigneePending ?? []).length,
    });
  }

  if (isActualTeamLead) {
    availableTabs.push({
      id: "team_approvals",
      label: "Team Approvals",
      count: (teamLeadPending ?? []).length,
    });
  }

  if (isBrandManager) {
    availableTabs.push({
      id: "brand_deliverables",
      label: "Brand Deliverables",
      count: (managerDeliverables ?? []).length,
    });
  }

  const [activeTab, setActiveTab] = useState<TabType>("my");

  const myTasks = useQuery(
    api.tasks.listTasksForUser,
    user ? { userId: user._id } : "skip"
  );

  const filteredDeliverables = deliverables?.filter((d) => {
    if (role === "employee") return d.submittedBy === user?._id;
    return true;
  }) ?? [];

  async function handleApprove(deliverableId: string) {
    await approveDeliverable({ deliverableId: deliverableId as any });
  }

  async function handleReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) return;
    await rejectDeliverable({ deliverableId: deliverableId as any, note: note.trim() });
    setShowRejectForm(null);
    setRejectNote({});
  }

  async function handleTeamLeadApprove(deliverableId: string) {
    await teamLeadApproveMut({ deliverableId: deliverableId as any });
  }

  async function handleTeamLeadReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) return;
    await teamLeadRejectMut({ deliverableId: deliverableId as any, note: note.trim() });
    setShowRejectForm(null);
    setRejectNote({});
  }

  async function handlePassToManager(deliverableId: string) {
    await passToManagerMut({ deliverableId: deliverableId as any });
  }

  async function handleMainAssigneeApprove(deliverableId: string) {
    await mainAssigneeApproveMut({ deliverableId: deliverableId as any });
  }

  async function handleMainAssigneeReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) return;
    await mainAssigneeRejectMut({ deliverableId: deliverableId as any, note: note.trim() });
    setShowRejectForm(null);
    setRejectNote({});
  }

  async function handlePassSubTaskToTeamLead(deliverableId: string) {
    await passSubTaskToTeamLeadMut({ deliverableId: deliverableId as any });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitTaskId || !submitMessage.trim()) return;

    let fileIds: Id<"_storage">[] = [];
    let fileNames: string[] = [];
    if (submitFiles.length > 0) {
      for (const file of submitFiles) {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        const { storageId } = await res.json();
        fileIds.push(storageId);
        fileNames.push(file.name);
      }
    }

    await submitDeliverable({
      taskId: submitTaskId as any,
      message: submitMessage.trim(),
      link: submitLink || undefined,
      ...(fileIds.length > 0 ? { fileIds, fileNames } : {}),
    });
    setShowSubmit(false);
    setSubmitTaskId("");
    setSubmitMessage("");
    setSubmitLink("");
    setSubmitFiles([]);
  }

  const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "var(--accent-admin-dim)", text: "var(--accent-admin)", label: "Pending Review" },
    approved: { bg: "var(--accent-employee-dim)", text: "var(--accent-employee)", label: "Approved" },
    rejected: { bg: "var(--danger-dim)", text: "var(--danger)", label: "Changes Requested" },
  };

  const TL_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "#FEF3C7", text: "#D97706", label: "TL Review Pending" },
    approved: { bg: "#D1FAE5", text: "#059669", label: "TL Approved" },
    changes_requested: { bg: "var(--danger-dim)", text: "var(--danger)", label: "TL Requested Changes" },
    rejected: { bg: "var(--danger-dim)", text: "var(--danger)", label: "TL Rejected" },
  };

  const MA_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "#EDE9FE", text: "#7C3AED", label: "Assignee Review Pending" },
    approved: { bg: "#D1FAE5", text: "#059669", label: "Assignee Approved" },
    changes_requested: { bg: "var(--danger-dim)", text: "var(--danger)", label: "Assignee Requested Changes" },
  };

  function renderFiles(files: { name: string; url: string }[]) {
    if (!files?.length) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {files.map((file, idx) => {
          const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setPreviewFile(file)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-admin)] transition-colors"
            >
              {isImage ? <ImageIcon className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
              <span className="max-w-[150px] truncate">{file.name}</span>
              <Eye className="h-3 w-3 shrink-0" />
            </button>
          );
        })}
      </div>
    );
  }

  function renderRejectForm(id: string, onReject: (id: string) => Promise<void>) {
    if (showRejectForm !== id) return null;
    return (
      <div className="flex items-center gap-2 flex-1">
        <input
          value={rejectNote[id] ?? ""}
          onChange={(e) => setRejectNote({ ...rejectNote, [id]: e.target.value })}
          placeholder="Reason for changes..."
          className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--danger)]"
          autoFocus
        />
        <button
          onClick={() => onReject(id)}
          className="px-3 py-1.5 rounded-lg bg-[var(--danger)] text-white text-[12px] font-medium hover:opacity-90"
        >
          Send
        </button>
        <button
          onClick={() => setShowRejectForm(null)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-[20px] text-[var(--text-primary)] tracking-tight">
          Deliverables
        </h1>
        {role === "employee" && (
          <Button variant="primary" onClick={() => setShowSubmit(!showSubmit)}>
            Submit Deliverable
          </Button>
        )}
      </div>

      {/* Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-hover)]">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent-admin)] text-white text-[10px] font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Submit form for employees */}
      {showSubmit && (
        <Card className="p-4">
          <h3 className="font-semibold text-[13px] text-[var(--text-primary)] mb-3">
            Submit a Deliverable
          </h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <select
              value={submitTaskId}
              onChange={(e) => setSubmitTaskId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
            >
              <option value="">Select task...</option>
              {myTasks?.filter((t) => t.status !== "done").map((t) => (
                <option key={t._id} value={t._id}>{t.title} ({t.briefName})</option>
              ))}
            </select>
            <textarea
              value={submitMessage}
              onChange={(e) => setSubmitMessage(e.target.value)}
              placeholder="Describe your deliverable..."
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] min-h-[60px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
              required
            />
            <input
              value={submitLink}
              onChange={(e) => setSubmitLink(e.target.value)}
              placeholder="Link (optional)"
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[13px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
            />
            <div>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                <Paperclip className="h-3.5 w-3.5" />
                Attach files (images, PDFs, etc.)
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setSubmitFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
              </label>
              {submitFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {submitFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[12px] text-[var(--text-secondary)]">
                      {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      <span className="max-w-[150px] truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setSubmitFiles((prev) => prev.filter((_, j) => j !== i))}
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
              <Button type="submit" variant="primary">Submit</Button>
              <Button type="button" variant="secondary" onClick={() => setShowSubmit(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab: My Deliverables */}
      {activeTab === "my" && (
        <div className="space-y-3">
          {filteredDeliverables.map((d) => {
            const status = d.status ?? "pending";
            const style = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
            const tlStatus = (d as any).teamLeadStatus as string | undefined;
            const tlStyle = tlStatus ? (TL_STATUS_STYLE[tlStatus] ?? null) : null;
            const maStatus = (d as any).mainAssigneeStatus as string | undefined;
            const maStyle = maStatus ? (MA_STATUS_STYLE[maStatus] ?? null) : null;
            const isSubTask = !!(d as any).isSubTask;

            return (
              <Card key={d._id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isSubTask && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                          HELPER
                        </span>
                      )}
                      <p className="font-medium text-[13px] text-[var(--text-primary)]">
                        {d.taskTitle}
                      </p>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {isSubTask && (d as any).parentTaskTitle && (
                        <>Parent: <span className="font-semibold">{(d as any).parentTaskTitle}</span> &middot; </>
                      )}
                      {d.briefTitle} &middot; by {d.submitterName} &middot;{" "}
                      {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {maStyle && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                        style={{ backgroundColor: maStyle.bg, color: maStyle.text }}
                      >
                        {maStyle.label}
                      </span>
                    )}
                    {tlStyle && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                        style={{ backgroundColor: tlStyle.bg, color: tlStyle.text }}
                      >
                        {tlStyle.label}
                      </span>
                    )}
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                      style={{ backgroundColor: style.bg, color: style.text }}
                    >
                      {style.label}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => setDeletingDeliverableId(d._id)}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-50 transition-colors"
                        title="Delete deliverable"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[12px] text-[var(--text-secondary)] mb-2">{d.message}</p>

                {d.link && (
                  <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-2">
                    <ExternalLink className="h-3 w-3" />
                    {d.link}
                  </a>
                )}

                {renderFiles((d as any).files ?? [])}

                {d.reviewNote && (
                  <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                    <MessageSquare className="h-3 w-3 text-[var(--text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                        {d.reviewerName ?? "Reviewer"}:
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{d.reviewNote}</p>
                    </div>
                  </div>
                )}

                {(d as any).mainAssigneeReviewNote && (d as any).mainAssigneeReviewerName && (
                  <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-purple-50 border border-purple-200">
                    <UserCheck className="h-3 w-3 text-purple-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-purple-700">
                        {(d as any).mainAssigneeReviewerName} (Main Assignee):
                      </p>
                      <p className="text-[11px] text-purple-700">{(d as any).mainAssigneeReviewNote}</p>
                    </div>
                  </div>
                )}

                {(d as any).teamLeadReviewNote && (d as any).teamLeadReviewerName && (
                  <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <ShieldCheck className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-amber-700">
                        {(d as any).teamLeadReviewerName} (Team Lead):
                      </p>
                      <p className="text-[11px] text-amber-700">{(d as any).teamLeadReviewNote}</p>
                    </div>
                  </div>
                )}

                {/* Admin actions: final approve/reject for pending deliverables */}
                {isAdmin && status === "pending" && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => handleApprove(d._id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    {showRejectForm === d._id ? (
                      renderRejectForm(d._id, handleReject)
                    ) : (
                      <button
                        onClick={() => setShowRejectForm(d._id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-medium hover:bg-[var(--danger-dim)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Request Changes
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {filteredDeliverables.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No deliverables yet.</p>
            </Card>
          )}
        </div>
      )}

      {/* Tab: Helper Reviews (Main Assignee) */}
      {activeTab === "helper_reviews" && (
        <div className="space-y-3">
          {(mainAssigneePending ?? []).length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No pending helper deliverables to review.</p>
            </Card>
          )}
          {(mainAssigneePending ?? []).map((d: any) => (
            <Card key={d._id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                      HELPER
                    </span>
                    <p className="font-medium text-[13px] text-[var(--text-primary)]">
                      {d.subTaskTitle}
                    </p>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Parent task: <span className="font-semibold">{d.parentTaskTitle}</span> &middot; {d.briefTitle} &middot; by{" "}
                    <span className="font-semibold">{d.submitterName}</span> &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 shrink-0">
                  Awaiting Your Review
                </span>
              </div>

              {d.subTaskDescription && (
                <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-blue-50/50 border border-blue-100">
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    <span className="font-medium text-blue-700">Sub-task:</span>{" "}{d.subTaskDescription}
                  </p>
                </div>
              )}

              <p className="text-[12px] text-[var(--text-secondary)] mb-2">{d.message}</p>

              {d.link && (
                <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-2">
                  <ExternalLink className="h-3 w-3" />
                  {d.link}
                </a>
              )}

              {renderFiles(d.files ?? [])}

              <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                {d.mainAssigneeStatus === "pending" && (
                  <>
                    <button
                      onClick={() => handleMainAssigneeApprove(d._id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    {showRejectForm === d._id ? (
                      renderRejectForm(d._id, handleMainAssigneeReject)
                    ) : (
                      <button
                        onClick={() => setShowRejectForm(d._id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-medium hover:bg-[var(--danger-dim)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Request Changes
                      </button>
                    )}
                  </>
                )}

                {d.mainAssigneeStatus === "approved" && !d.teamLeadStatus && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--accent-employee)] font-medium flex items-center gap-1">
                      <UserCheck className="h-3 w-3" />
                      Approved by you
                    </span>
                    <button
                      onClick={() => handlePassSubTaskToTeamLead(d._id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Pass to Team Lead
                    </button>
                  </div>
                )}

                {d.teamLeadStatus && (
                  <span className="text-[11px] text-[var(--text-muted)] font-medium">
                    Passed to team lead
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab: Team Approvals (Team Lead) */}
      {activeTab === "team_approvals" && (
        <div className="space-y-3">
          {(teamLeadPending ?? []).length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No pending approvals from your team.</p>
            </Card>
          )}
          {(teamLeadPending ?? []).map((d: any) => (
            <Card key={d._id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {d.isSubTask && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                        HELPER
                      </span>
                    )}
                    <p className="font-medium text-[13px] text-[var(--text-primary)]">
                      {d.taskTitle}
                    </p>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {d.isSubTask && d.parentTaskTitle && (
                      <>Parent: <span className="font-semibold">{d.parentTaskTitle}</span> &middot; </>
                    )}
                    {d.briefTitle} &middot; {d.brandName} &middot; by{" "}
                    <span className="font-semibold">{d.submitterName}</span> &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 shrink-0">
                  Awaiting Review
                </span>
              </div>

              {d.isSubTask && d.mainAssigneeApproved && d.mainAssigneeReviewerName && (
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-green-50 border border-green-200 w-fit">
                  <UserCheck className="h-3 w-3 text-green-600" />
                  <span className="text-[11px] text-green-700 font-medium">
                    Approved by main assignee: {d.mainAssigneeReviewerName}
                    {d.mainAssigneeName && d.mainAssigneeName !== d.mainAssigneeReviewerName
                      ? ` (${d.mainAssigneeName})`
                      : ""}
                  </span>
                </div>
              )}

              <p className="text-[12px] text-[var(--text-secondary)] mb-2">{d.message}</p>

              {d.link && (
                <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-2">
                  <ExternalLink className="h-3 w-3" />
                  {d.link}
                </a>
              )}

              {renderFiles(d.files ?? [])}

              <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                {d.teamLeadStatus === "pending" && (
                  <>
                    <button
                      onClick={() => handleTeamLeadApprove(d._id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    {showRejectForm === d._id ? (
                      renderRejectForm(d._id, handleTeamLeadReject)
                    ) : (
                      <button
                        onClick={() => setShowRejectForm(d._id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-medium hover:bg-[var(--danger-dim)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Request Changes
                      </button>
                    )}
                  </>
                )}

                {d.teamLeadStatus === "approved" && !d.passedToManagerAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--accent-employee)] font-medium">Approved by you</span>
                    {(d.brandManagers ?? []).map((mgr: any) => (
                      <button
                        key={mgr._id}
                        onClick={() => handlePassToManager(d._id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Pass to {mgr.name}
                      </button>
                    ))}
                    {(d.brandManagers ?? []).length === 0 && (
                      <span className="text-[11px] text-[var(--text-muted)]">No brand manager assigned</span>
                    )}
                  </div>
                )}

                {d.passedToManagerAt && (
                  <span className="text-[11px] text-[var(--text-muted)] font-medium">
                    Passed to brand manager
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab: Brand Deliverables (Manager) */}
      {activeTab === "brand_deliverables" && (
        <div className="space-y-3">
          {(managerDeliverables ?? []).length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No deliverables pending your review.</p>
            </Card>
          )}
          {(managerDeliverables ?? []).map((d: any) => (
            <Card key={d._id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[13px] text-[var(--text-primary)]">
                      {d.taskTitle}
                    </p>
                    {d.taskClientFacing && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">Client-facing</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {d.briefTitle} &middot; {d.brandName} &middot; by{" "}
                    <span className="font-semibold">{d.submitterName}</span> &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                {d._sendToClient ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-50 text-purple-700 shrink-0">
                    Ready to Send to Client
                  </span>
                ) : d.clientStatus === "client_approved" ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-50 text-green-700 shrink-0">
                    Client Approved
                  </span>
                ) : d.clientStatus === "client_changes_requested" ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 shrink-0">
                    Client Wants Changes
                  </span>
                ) : d.clientStatus === "client_denied" ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-50 text-red-700 shrink-0">
                    Client Denied
                  </span>
                ) : d.clientStatus === "pending_client" ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700 shrink-0">
                    Pending Client Review
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 shrink-0">
                    Awaiting Your Approval
                  </span>
                )}
              </div>

              {d.teamLeadReviewerName && (
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-green-50 border border-green-200 w-fit">
                  <ShieldCheck className="h-3 w-3 text-green-600" />
                  <span className="text-[11px] text-green-700 font-medium">
                    Approved by {d.teamLeadReviewerName}{d.teamName ? ` of ${d.teamName}` : ""}
                  </span>
                </div>
              )}

              <p className="text-[12px] text-[var(--text-secondary)] mb-2">{d.message}</p>

              {/* Client note for feedback deliverables */}
              {d.clientNote && (d.clientStatus === "client_changes_requested" || d.clientStatus === "client_denied") && (
                <div className={`mb-2 p-2 rounded-md border text-[11px] ${d.clientStatus === "client_denied" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  <span className="font-semibold">Client remarks:</span> {d.clientNote}
                </div>
              )}

              {d.link && (
                <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-2">
                  <ExternalLink className="h-3 w-3" />
                  {d.link}
                </a>
              )}

              {renderFiles(d.files ?? [])}

              <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                {d._clientFeedback ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={reassignTarget[d._id] ?? ""}
                        onChange={(e) => setReassignTarget((prev) => ({ ...prev, [d._id]: e.target.value }))}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                      >
                        <option value="">Select team member to reassign...</option>
                        {(d.teamMembers ?? []).map((m: any) => (
                          <option key={m._id} value={m._id}>{m.name}{haltedUserIds.includes(m._id) ? " ⚠ HALTED" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={reassignNote[d._id] ?? ""}
                      onChange={(e) => setReassignNote((prev) => ({ ...prev, [d._id]: e.target.value }))}
                      placeholder="Add notes for the assignee (optional)..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] min-h-[40px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                    />
                    <button
                      disabled={!reassignTarget[d._id]}
                      onClick={async () => {
                        const target = reassignTarget[d._id];
                        if (!target) return;
                        try {
                          const taskId = (d as any).taskId;
                          await reassignAfterClientFeedback({
                            taskId: taskId as Id<"tasks">,
                            newAssigneeId: target as Id<"users">,
                            note: reassignNote[d._id] || undefined,
                          });
                          setReassignTarget((prev) => { const n = { ...prev }; delete n[d._id]; return n; });
                          setReassignNote((prev) => { const n = { ...prev }; delete n[d._id]; return n; });
                        } catch {}
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 w-fit"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send Back to Team Member
                    </button>
                  </div>
                ) : d._sendToClient ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await sendToClientMut({ deliverableId: d._id as Id<"deliverables"> });
                        } catch {}
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send to Client
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(d._id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve (Final)
                    </button>
                    {showRejectForm === d._id ? (
                      renderRejectForm(d._id, handleReject)
                    ) : (
                      <button
                        onClick={() => setShowRejectForm(d._id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-medium hover:bg-[var(--danger-dim)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Request Changes
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      <ConfirmModal
        open={!!deletingDeliverableId}
        title="Delete Deliverable"
        message="Are you sure you want to permanently delete this deliverable and its attached files?"
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingDeliverableId) {
            await deleteDeliverableMutation({ deliverableId: deletingDeliverableId as Id<"deliverables"> });
          }
          setDeletingDeliverableId(null);
        }}
        onCancel={() => setDeletingDeliverableId(null)}
      />
    </div>
  );
}
