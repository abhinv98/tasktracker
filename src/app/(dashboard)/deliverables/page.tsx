"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Button, ConfirmModal, useToast } from "@/components/ui";
import {
  Check, X, MessageSquare, ExternalLink, Paperclip, FileText,
  Image as ImageIcon, Eye, Trash2, ArrowRight, ShieldCheck, Users, UserCheck, Send, GitBranch, Loader2
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
  const submitDirectToManager = useMutation(api.approvals.submitDeliverableDirectToManager);
  const submitDirectToAssignor = useMutation(api.approvals.submitDeliverableDirectToAssignor);
  const editDeliverableMut = useMutation(api.approvals.editDeliverable);
  const deleteDeliverableMutation = useMutation(api.approvals.deleteDeliverable);
  const teamLeadApproveMut = useMutation(api.approvals.teamLeadApprove);
  const teamLeadRejectMut = useMutation(api.approvals.teamLeadReject);
  const passToManagerMut = useMutation(api.approvals.passToManager);
  const teamLeadAndManagerApproveMut = useMutation(api.approvals.teamLeadAndManagerApprove);
  const managerApproveFromTeamLeadMut = useMutation(api.approvals.managerApproveFromTeamLead);
  const mainAssigneeApproveMut = useMutation(api.approvals.mainAssigneeApprove);
  const mainAssigneeRejectMut = useMutation(api.approvals.mainAssigneeReject);
  const passSubTaskToTeamLeadMut = useMutation(api.approvals.passSubTaskToTeamLead);
  const sendToClientMut = useMutation(api.jsr.sendToClient);
  const reassignAfterClientFeedback = useMutation(api.approvals.reassignAfterClientFeedback);
  const forwardToTeamMemberMut = useMutation(api.approvals.forwardToTeamMember);
  const handoffDeliverableMut = useMutation(api.approvals.handoffDeliverable);

  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);
  const [deletingDeliverableId, setDeletingDeliverableId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const [reassignNote, setReassignNote] = useState<Record<string, string>>({});
  const [forwardingDeliverableId, setForwardingDeliverableId] = useState<string | null>(null);
  const [forwardTargetUser, setForwardTargetUser] = useState<Record<string, string>>({});
  const [forwardNote, setForwardNote] = useState<Record<string, string>>({});
  const [handoffDeliverableId, setHandoffDeliverableId] = useState<string | null>(null);
  const [handoffTaskId, setHandoffTaskId] = useState<string | null>(null); // task-level handoff for grouped view
  const [handoffTeam, setHandoffTeam] = useState<Record<string, string>>({});
  const [handoffAssignee, setHandoffAssignee] = useState<Record<string, string>>({});
  const [handoffDeadline, setHandoffDeadline] = useState<Record<string, string>>({});
  const [handoffNote, setHandoffNote] = useState<Record<string, string>>({});
  /** "__new__" or an existing task id (master briefs only) */
  const [handoffTargetChoice, setHandoffTargetChoice] = useState<Record<string, string>>({});
  const [handoffNewTitle, setHandoffNewTitle] = useState<Record<string, string>>({});
  const [handoffNewDesc, setHandoffNewDesc] = useState<Record<string, string>>({});

  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);

  const [showSubmit, setShowSubmit] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitLink, setSubmitLink] = useState("");
  const [submitFiles, setSubmitFiles] = useState<File[]>([]);
  const [editingDeliverableId, setEditingDeliverableId] = useState<string | null>(null);
  const [editKeptFiles, setEditKeptFiles] = useState<{ name: string; url: string }[]>([]);

  const allTeams = useQuery(api.teams.listTeams, {});
  const allUsers = useQuery(api.users.listAllUsers, {});

  // Group manager deliverables by taskId for creative-slot task grouping (Bugs 6-7)
  const managerGroupedByTask = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const d of managerDeliverables ?? []) {
      const key = d.taskId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    return Object.entries(groups).map(([taskId, deliverables]) => ({
      taskId,
      deliverables,
      first: deliverables[0], // use first deliverable for shared task/brief info
    }));
  }, [managerDeliverables]);

  // Group TL pending approvals by taskId
  const tlGroupedByTask = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const d of teamLeadPending ?? []) {
      const key = d.taskId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    return Object.entries(groups).map(([taskId, deliverables]) => ({
      taskId,
      deliverables,
      first: deliverables[0],
    }));
  }, [teamLeadPending]);
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

  // Resolve master-brief connectivity for every visible task in one query.
  // Used to decide per-card whether to hide / alert+show / show the handoff button.
  const allHandoffTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of filteredDeliverables) ids.add(d.taskId as string);
    for (const d of (managerDeliverables ?? []) as any[]) ids.add(d.taskId as string);
    return Array.from(ids);
  }, [filteredDeliverables, managerDeliverables]);

  const handoffContexts = useQuery(
    api.approvals.listHandoffContextsForTasks,
    allHandoffTaskIds.length > 0 ? { taskIds: allHandoffTaskIds as Id<"tasks">[] } : "skip"
  );

  const deliverableHandoffContext = useMemo(() => {
    if (!handoffDeliverableId) return null;
    const pool = [...filteredDeliverables, ...((managerDeliverables ?? []) as any[])];
    const row = pool.find((x: any) => x._id === handoffDeliverableId);
    if (!row?.taskId) return null;
    const tid = handoffTeam[handoffDeliverableId];
    const aid = handoffAssignee[handoffDeliverableId];
    if (!tid || !aid) return null;
    return { taskId: row.taskId as Id<"tasks">, assigneeId: aid as Id<"users"> };
  }, [handoffDeliverableId, handoffTeam, handoffAssignee, filteredDeliverables, managerDeliverables]);

  const deliverableHandoffCandidates = useQuery(
    api.approvals.listHandoffCandidateTasks,
    deliverableHandoffContext ?? "skip"
  );

  const taskHandoffContext = useMemo(() => {
    if (!handoffTaskId) return null;
    const g = managerGroupedByTask.find((x) => x.taskId === handoffTaskId);
    const row = g?.first;
    if (!row?.taskId) return null;
    const tid = handoffTeam[handoffTaskId];
    const aid = handoffAssignee[handoffTaskId];
    if (!tid || !aid) return null;
    return { taskId: row.taskId as Id<"tasks">, assigneeId: aid as Id<"users"> };
  }, [handoffTaskId, handoffTeam, handoffAssignee, managerGroupedByTask]);

  const taskHandoffCandidates = useQuery(
    api.approvals.listHandoffCandidateTasks,
    taskHandoffContext ?? "skip"
  );

  const { toast } = useToast();

  async function handleApprove(deliverableId: string) {
    try {
      await approveDeliverable({ deliverableId: deliverableId as any });
      toast("success", "Deliverable approved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function handleReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) {
      toast("error", "Add a reason before requesting changes");
      return;
    }
    try {
      await rejectDeliverable({ deliverableId: deliverableId as any, note: note.trim() });
      toast("success", "Changes requested — sent back to the submitter");
      setShowRejectForm(null);
      setRejectNote({});
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not request changes");
    }
  }

  async function handleTeamLeadApprove(deliverableId: string) {
    try {
      await teamLeadApproveMut({ deliverableId: deliverableId as any });
      toast("success", "Approved by team lead");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function handleTeamLeadReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) {
      toast("error", "Add a reason before requesting changes");
      return;
    }
    try {
      await teamLeadRejectMut({ deliverableId: deliverableId as any, note: note.trim() });
      toast("success", "Changes requested");
      setShowRejectForm(null);
      setRejectNote({});
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not request changes");
    }
  }

  async function handlePassToManager(deliverableId: string) {
    try {
      await passToManagerMut({ deliverableId: deliverableId as any });
      toast("success", "Passed to brand manager");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleTeamLeadAndManagerApprove(deliverableId: string) {
    try {
      await teamLeadAndManagerApproveMut({ deliverableId: deliverableId as any });
      toast("success", "Approved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function handleManagerApproveFromTeamLead(deliverableId: string) {
    try {
      await managerApproveFromTeamLeadMut({ deliverableId: deliverableId as any });
      toast("success", "Approved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function handleMainAssigneeApprove(deliverableId: string) {
    try {
      await mainAssigneeApproveMut({ deliverableId: deliverableId as any });
      toast("success", "Approved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function handleMainAssigneeReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) {
      toast("error", "Add a reason before requesting changes");
      return;
    }
    try {
      await mainAssigneeRejectMut({ deliverableId: deliverableId as any, note: note.trim() });
      toast("success", "Changes requested");
      setShowRejectForm(null);
      setRejectNote({});
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not request changes");
    }
  }

  async function handlePassSubTaskToTeamLead(deliverableId: string) {
    try {
      await passSubTaskToTeamLeadMut({ deliverableId: deliverableId as any });
      toast("success", "Sent to team lead");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Action failed");
    }
  }

  function resetSubmitForm() {
    setShowSubmit(false);
    setEditingDeliverableId(null);
    setSubmitTaskId("");
    setSubmitMessage("");
    setSubmitLink("");
    setSubmitFiles([]);
    setEditKeptFiles([]);
  }

  function openEdit(d: any) {
    setEditingDeliverableId(d._id);
    setShowSubmit(true);
    setSubmitTaskId(d.taskId);
    setSubmitMessage(d.message ?? "");
    setSubmitLink(d.link ?? "");
    setSubmitFiles([]);
    setEditKeptFiles((d.files ?? []) as { name: string; url: string }[]);
  }

  async function handleSubmit(
    e: React.FormEvent | null,
    routeTo: "tl" | "bm" | "as" = "tl"
  ) {
    if (e) e.preventDefault();
    if (!submitMessage.trim()) return;
    if (!editingDeliverableId && !submitTaskId) return;

    let newFileIds: Id<"_storage">[] = [];
    let newFileNames: string[] = [];
    if (submitFiles.length > 0) {
      for (const file of submitFiles) {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        const { storageId } = await res.json();
        newFileIds.push(storageId);
        newFileNames.push(file.name);
      }
    }

    if (editingDeliverableId) {
      // Edit mode: combined existing-kept files (filenames only — URLs are derived)
      // are not included since we cannot recover Convex storageIds from URLs.
      // To keep edit simple and predictable, an edit replaces the file set with
      // exactly the newly uploaded files. If the submitter wants to keep an old
      // file, they must re-upload. Trade-off documented in the plan.
      try {
        await editDeliverableMut({
          deliverableId: editingDeliverableId as Id<"deliverables">,
          message: submitMessage.trim(),
          link: submitLink || undefined,
          ...(newFileIds.length > 0 ? { fileIds: newFileIds, fileNames: newFileNames } : {}),
        });
        toast("success", "Deliverable updated");
        resetSubmitForm();
      } catch (err) {
        toast("error", err instanceof Error ? err.message : "Could not update deliverable");
      }
      return;
    }

    const payload = {
      taskId: submitTaskId as any,
      message: submitMessage.trim(),
      link: submitLink || undefined,
      ...(newFileIds.length > 0 ? { fileIds: newFileIds, fileNames: newFileNames } : {}),
    };
    if (routeTo === "bm") {
      await submitDirectToManager(payload);
      toast("success", "Sent directly to Brand Manager");
    } else if (routeTo === "as") {
      await submitDirectToAssignor(payload);
      toast("success", "Sent directly to Assignor");
    } else {
      await submitDeliverable(payload);
      toast("success", "Submitted for Team Lead review");
    }
    resetSubmitForm();
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
    const noteValue = rejectNote[id] ?? "";
    const noteIsEmpty = !noteValue.trim();
    return (
      <div className="flex items-center gap-2 flex-1">
        <input
          value={noteValue}
          onChange={(e) => setRejectNote({ ...rejectNote, [id]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !noteIsEmpty) {
              e.preventDefault();
              onReject(id);
            }
          }}
          placeholder="Reason for changes..."
          className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--danger)]"
          autoFocus
        />
        <button
          onClick={() => onReject(id)}
          disabled={noteIsEmpty}
          className="px-3 py-1.5 rounded-lg bg-[var(--danger)] text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          title={noteIsEmpty ? "Add a reason first" : "Send"}
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
        {(myTasks ?? []).some((t) => t.status !== "done") && (
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
            {editingDeliverableId ? "Edit Deliverable" : "Submit a Deliverable"}
          </h3>
          <form onSubmit={(e) => handleSubmit(e, "tl")} className="flex flex-col gap-3">
            {!editingDeliverableId && (
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
            )}
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
            {editingDeliverableId && editKeptFiles.length > 0 && (
              <div className="px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                <div className="font-medium mb-1">Existing files on this deliverable:</div>
                <div className="flex flex-wrap gap-1.5">
                  {editKeptFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white text-[11px] text-amber-900">
                      <FileText className="h-3 w-3" />
                      <span className="max-w-[200px] truncate">{f.name}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 italic">Uploading new files will replace this set. Re-upload anything you want to keep.</div>
              </div>
            )}
            <div>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                <Paperclip className="h-3.5 w-3.5" />
                {editingDeliverableId ? "Replace files (optional)" : "Attach files (images, PDFs, etc.)"}
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
            {editingDeliverableId ? (
              <div className="flex gap-2">
                <Button type="submit" variant="primary">Save Changes</Button>
                <Button type="button" variant="secondary" onClick={resetSubmitForm}>Cancel</Button>
              </div>
            ) : (() => {
              const selected = myTasks?.find((t) => t._id === submitTaskId);
              const showAssignorBtn = !!selected?.assignedBy && selected.assignedBy !== user?._id;
              return (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Submit to</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="primary">Team Lead</Button>
                    <button
                      type="button"
                      disabled={!submitMessage.trim() || !submitTaskId}
                      onClick={() => handleSubmit(null, "bm")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                    >
                      Brand Manager
                    </button>
                    {showAssignorBtn && (
                      <button
                        type="button"
                        disabled={!submitMessage.trim() || !submitTaskId}
                        onClick={() => handleSubmit(null, "as")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        Assignor
                      </button>
                    )}
                    <Button type="button" variant="secondary" onClick={resetSubmitForm}>Cancel</Button>
                  </div>
                </div>
              );
            })()}
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

                {/* Submitter can edit their own deliverable while no reviewer has acted yet */}
                {(() => {
                  const isOwnSubmission = d.submittedBy === user?._id;
                  const tlNotActed =
                    !isSubTask &&
                    (d as any).teamLeadStatus === "pending" &&
                    !(d as any).teamLeadReviewedAt;
                  const maNotActed =
                    isSubTask &&
                    (d as any).mainAssigneeStatus === "pending" &&
                    !(d as any).mainAssigneeReviewedAt;
                  const canEdit =
                    isOwnSubmission &&
                    status !== "approved" &&
                    status !== "rejected" &&
                    (tlNotActed || maNotActed);
                  if (!canEdit) return null;
                  return (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => openEdit(d)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--accent-admin)] text-[var(--accent-admin)] text-[12px] font-medium hover:bg-[var(--accent-admin-dim)] transition-colors"
                      >
                        Edit
                      </button>
                      <span className="text-[11px] text-[var(--text-muted)] italic">
                        {isSubTask ? "Editable until main assignee reviews" : "Editable until team lead reviews"}
                      </span>
                    </div>
                  );
                })()}

                {/* Admin actions: final approve/reject for pending deliverables (never on your own submissions) */}
                {isAdmin && status === "pending" && d.submittedBy !== user?._id && (
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

                {/* Hand off approved deliverable to another team — gated by master-brief connectivity */}
                {(isAdmin || isBrandManager) && (status === "approved" || (d as any).clientStatus === "client_approved") && (() => {
                  const hctx = handoffContexts?.[d.taskId as string];
                  // Master brief WITH downstream connection → hide entirely; resources auto-flow.
                  if (hctx?.inMasterBrief && hctx?.hasDownstreamConnection) return null;
                  return (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    {hctx?.inMasterBrief && !hctx?.hasDownstreamConnection && (
                      <div className="mb-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                        This task is part of master brief <span className="font-semibold">&ldquo;{hctx.briefTitle}&rdquo;</span>{hctx.brandName ? <> for <span className="font-semibold">{hctx.brandName}</span></> : null} but isn&apos;t connected to a downstream node. Add a connection in the master-brief editor — you can hand off manually below for now.
                      </div>
                    )}
                    <button
                      onClick={() => setHandoffDeliverableId(handoffDeliverableId === d._id ? null : d._id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                        handoffDeliverableId === d._id
                          ? "bg-indigo-600 text-white"
                          : "border border-indigo-500 text-indigo-600 hover:bg-indigo-50"
                      }`}
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      Hand Off to Team
                    </button>
                    {handoffDeliverableId === d._id && (
                      <div className="space-y-2 mt-2 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                        <p className="text-[11px] font-medium text-indigo-700 mb-1">Hand off to another team for the next stage</p>
                        <select
                          value={handoffTeam[d._id] ?? ""}
                          onChange={(e) => {
                            setHandoffTeam((prev) => ({ ...prev, [d._id]: e.target.value }));
                            setHandoffAssignee((prev) => {
                              const n = { ...prev };
                              delete n[d._id];
                              return n;
                            });
                            setHandoffTargetChoice((prev) => {
                              const n = { ...prev };
                              delete n[d._id];
                              return n;
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">Select target team...</option>
                          {(allTeams ?? []).map((t: any) => (
                            <option key={t._id} value={t._id}>{t.name}</option>
                          ))}
                        </select>
                        {handoffTeam[d._id] && (
                          <select
                            value={handoffAssignee[d._id] ?? ""}
                            onChange={(e) => {
                              setHandoffAssignee((prev) => ({ ...prev, [d._id]: e.target.value }));
                              setHandoffTargetChoice((prev) => {
                                const n = { ...prev };
                                delete n[d._id];
                                return n;
                              });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">Select assignee from team...</option>
                            {(allUsers ?? [])
                              .filter((u: any) => (u.teams ?? []).some((t: any) => t._id === handoffTeam[d._id]))
                              .map((u: any) => (
                                <option key={u._id} value={u._id}>{u.name ?? u.email ?? "Unknown"}</option>
                              ))
                            }
                          </select>
                        )}
                        {handoffTeam[d._id] && handoffAssignee[d._id] && (() => {
                          const opts = deliverableHandoffCandidates ?? [];
                          const needPick = opts.length > 0;
                          const choice = handoffTargetChoice[d._id] ?? "";
                          const showNewFields = opts.length === 0 || choice === "__new__";
                          const canSubmit =
                            handoffTeam[d._id] &&
                            handoffAssignee[d._id] &&
                            (!needPick || choice);
                          return (
                            <>
                              {needPick && (
                                <div>
                                  <label className="block text-[10px] font-semibold text-indigo-800 mb-0.5">Attach deliverable to</label>
                                  <select
                                    value={choice}
                                    onChange={(e) =>
                                      setHandoffTargetChoice((prev) => ({ ...prev, [d._id]: e.target.value }))
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">Choose one...</option>
                                    <option value="__new__">Create a new task</option>
                                    {opts.map((t) => (
                                      <option key={t._id} value={t._id}>
                                        {t.title} ({t.status})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {opts.length === 0 && (
                                <p className="text-[10px] text-indigo-700">No open tasks for this person — a new task will be created on their team.</p>
                              )}
                              {showNewFields && (
                                <>
                                  <input
                                    type="text"
                                    value={handoffNewTitle[d._id] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewTitle((prev) => ({ ...prev, [d._id]: e.target.value }))
                                    }
                                    placeholder={`New task title (optional — defaults to Handoff: ${(d as any).taskTitle ?? "task"})`}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <textarea
                                    value={handoffNewDesc[d._id] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewDesc((prev) => ({ ...prev, [d._id]: e.target.value }))
                                    }
                                    placeholder="Description for the new task (optional)"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] min-h-[56px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <div>
                                    <label className="block text-[10px] font-semibold text-indigo-800 mb-0.5">Deadline (optional)</label>
                                    <input
                                      type="date"
                                      value={handoffDeadline[d._id] ?? ""}
                                      onChange={(e) =>
                                        setHandoffDeadline((prev) => ({ ...prev, [d._id]: e.target.value }))
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </>
                              )}
                              <textarea
                                value={handoffNote[d._id] ?? ""}
                                onChange={(e) => setHandoffNote((prev) => ({ ...prev, [d._id]: e.target.value }))}
                                placeholder="Extra instructions (optional) — appended to the handoff"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] min-h-[48px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <div className="flex gap-2">
                                <button
                                  disabled={!canSubmit}
                                  onClick={async () => {
                                    const teamId = handoffTeam[d._id];
                                    const assigneeId = handoffAssignee[d._id];
                                    if (!teamId || !assigneeId) return;
                                    const o = deliverableHandoffCandidates ?? [];
                                    const ch = handoffTargetChoice[d._id] ?? "";
                                    const isNew = o.length === 0 || ch === "__new__";
                                    try {
                                      const payload: Record<string, unknown> = {
                                        deliverableId: d._id as Id<"deliverables">,
                                        targetTeamId: teamId as Id<"teams">,
                                        targetAssigneeId: assigneeId as Id<"users">,
                                        ...(handoffDeadline[d._id] && isNew
                                          ? { deadline: new Date(handoffDeadline[d._id] + "T23:59:59").getTime() }
                                          : {}),
                                        ...(handoffNote[d._id]?.trim() ? { note: handoffNote[d._id].trim() } : {}),
                                      };
                                      if (!isNew && ch && ch !== "__new__") {
                                        payload.targetExistingTaskId = ch as Id<"tasks">;
                                      } else {
                                        if (handoffNewTitle[d._id]?.trim()) {
                                          payload.newTaskTitle = handoffNewTitle[d._id].trim();
                                        }
                                        if (handoffNewDesc[d._id]?.trim()) {
                                          payload.newTaskDescription = handoffNewDesc[d._id].trim();
                                        }
                                        payload.forceNewHandoffTask = true;
                                      }
                                      await handoffDeliverableMut(payload as any);
                                      setHandoffDeliverableId(null);
                                      setHandoffTeam((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                      setHandoffAssignee((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                      setHandoffDeadline((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                      setHandoffNote((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                      setHandoffTargetChoice((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                      setHandoffNewTitle((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                      setHandoffNewDesc((prev) => {
                                        const n = { ...prev };
                                        delete n[d._id];
                                        return n;
                                      });
                                    } catch {
                                      /* toast optional */
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                  <GitBranch className="h-3.5 w-3.5" />
                                  Hand Off
                                </button>
                                <button
                                  onClick={() => setHandoffDeliverableId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-[12px] font-medium hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  );
                })()}
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

      {/* Tab: Team Approvals (Team Lead) — Grouped by Task */}
      {activeTab === "team_approvals" && (
        <div className="space-y-3">
          {tlGroupedByTask.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No pending approvals from your team.</p>
            </Card>
          )}
          {tlGroupedByTask.map((group) => {
            const d = group.first; // shared task info from first deliverable
            const deliverables = group.deliverables;
            const isMultiCreative = deliverables.length > 1;
            return (
            <Card key={group.taskId} className="p-4">
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
                    {isMultiCreative && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-600 shrink-0">
                        {deliverables.length} CREATIVES
                      </span>
                    )}
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
                  {isMultiCreative
                    ? `${d.taskApprovedByTLCount ?? 0}/${deliverables.length} Approved`
                    : "Awaiting Review"}
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

              {/* Render each deliverable/creative within this task */}
              {deliverables.map((del: any, idx: number) => (
                <div key={del._id} className={`${isMultiCreative ? "ml-3 pl-3 border-l-2 border-purple-200 mb-2" : "mb-2"}`}>
                  {isMultiCreative && (
                    <p className="text-[10px] font-semibold text-purple-600 mb-1">Creative {idx + 1}</p>
                  )}
                  <p className="text-[12px] text-[var(--text-secondary)] mb-1">{del.message}</p>
                  {del.link && (
                    <a href={del.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-1">
                      <ExternalLink className="h-3 w-3" />
                      {del.link}
                    </a>
                  )}
                  {renderFiles(del.files ?? [])}

                  <div className="flex items-center flex-wrap gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                    {del.teamLeadStatus === "pending" && (
                      <>
                        <button
                          onClick={() => handleTeamLeadApprove(del._id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve{isMultiCreative ? ` #${idx + 1}` : " as Team Lead"}
                        </button>
                        {del.isAlsoBrandManager && (
                          <button
                            onClick={() => handleTeamLeadAndManagerApprove(del._id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Approve as TL & Manager
                          </button>
                        )}
                        {showRejectForm === del._id ? (
                          renderRejectForm(del._id, handleTeamLeadReject)
                        ) : (
                          <button
                            onClick={() => setShowRejectForm(del._id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-medium hover:bg-[var(--danger-dim)] transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Request Changes
                          </button>
                        )}
                      </>
                    )}

                    {del.teamLeadStatus === "approved" && !del.passedToManagerAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--accent-employee)] font-medium">TL Approved</span>
                        {del.isAlsoBrandManager ? (
                          <button
                            onClick={() => handleManagerApproveFromTeamLead(del._id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Final Approve (Brand Manager)
                          </button>
                        ) : (
                          (del.brandManagers ?? []).map((mgr: any) => (
                            <button
                              key={mgr._id}
                              onClick={async () => {
                                try { await passToManagerMut({ deliverableId: del._id as Id<"deliverables"> }); } catch {}
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Pass to {mgr.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {del.passedToManagerAt && (
                      <span className="text-[11px] text-[var(--text-muted)] font-medium">
                        Passed to brand manager
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Card>
            );
          })}
        </div>
      )}

      {/* Tab: Brand Deliverables (Manager) — Grouped by Task */}
      {activeTab === "brand_deliverables" && (
        <div className="space-y-3">
          {managerGroupedByTask.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No deliverables pending your review.</p>
            </Card>
          )}
          {managerGroupedByTask.map((group) => {
            const d = group.first;
            const deliverables = group.deliverables;
            const isMultiCreative = deliverables.length > 1;
            // Check if ANY deliverable in this group is a special type
            const hasClientFeedback = deliverables.some((del: any) => del._clientFeedback);
            const hasSendToClient = deliverables.some((del: any) => del._sendToClient);
            const allApproved = deliverables.every((del: any) => del.status === "approved");
            const allHandedOff = deliverables.every((del: any) => del.isHandedOff);
            const anyHandedOff = deliverables.some((del: any) => del.isHandedOff);
            return (
            <Card key={group.taskId} className="p-4">
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
                {isMultiCreative && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-600 shrink-0">
                    {deliverables.length} CREATIVES
                  </span>
                )}
                {allHandedOff ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700 shrink-0">
                    Handed Off{d.handoffTargetTeamName ? ` → ${d.handoffTargetTeamName}` : ""}
                    {d.hasIncompleteChainTasks ? " (in progress)" : " ✓"}
                  </span>
                ) : hasSendToClient ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-50 text-purple-700 shrink-0">
                    Ready to Send to Client
                  </span>
                ) : allApproved ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-50 text-green-700 shrink-0">
                    All Approved{d.taskHasHandoffTarget ? " — awaiting handoff" : ""}
                  </span>
                ) : d.awaitingHandoff ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 shrink-0">
                    TL approved — handoff pending
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 shrink-0">
                    {isMultiCreative
                      ? `${deliverables.filter((x: any) => x.status === "approved").length}/${deliverables.length} Approved`
                      : "Awaiting Your Approval"}
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

              {/* Render each deliverable/creative within this task group */}
              {deliverables.map((del: any, idx: number) => (
                <div key={del._id} className={`${isMultiCreative ? "ml-3 pl-3 border-l-2 border-purple-200 mb-3" : "mb-2"}`}>
                  {isMultiCreative && (
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] font-semibold text-purple-600">Creative {idx + 1}</p>
                      {del.isHandedOff && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-600">Handed Off</span>
                      )}
                      {del.status === "approved" && !del.isHandedOff && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-50 text-green-600">Approved</span>
                      )}
                    </div>
                  )}
                  <p className="text-[12px] text-[var(--text-secondary)] mb-1">{del.message}</p>

                  {del.clientNote && (del.clientStatus === "client_changes_requested" || del.clientStatus === "client_denied") && (
                    <div className={`mb-1 p-2 rounded-md border text-[11px] ${del.clientStatus === "client_denied" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                      <span className="font-semibold">Client remarks:</span> {del.clientNote}
                    </div>
                  )}

                  {del.link && (
                    <a href={del.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-1">
                      <ExternalLink className="h-3 w-3" />
                      {del.link}
                    </a>
                  )}
                  {renderFiles(del.files ?? [])}
                </div>
              ))}

              {/* Task-level actions */}
              <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                {hasClientFeedback ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={reassignTarget[group.taskId] ?? ""}
                        onChange={(e) => setReassignTarget((prev) => ({ ...prev, [group.taskId]: e.target.value }))}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                      >
                        <option value="">Select team member to reassign...</option>
                        {(d.teamMembers ?? []).map((m: any) => (
                          <option key={m._id} value={m._id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      disabled={!reassignTarget[group.taskId]}
                      onClick={async () => {
                        const target = reassignTarget[group.taskId];
                        if (!target) return;
                        try {
                          await reassignAfterClientFeedback({
                            taskId: group.taskId as Id<"tasks">,
                            newAssigneeId: target as Id<"users">,
                          });
                          setReassignTarget((prev) => { const n = { ...prev }; delete n[group.taskId]; return n; });
                        } catch {}
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 w-fit"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send Back to Team Member
                    </button>
                  </div>
                ) : hasSendToClient ? (
                  <div className="flex items-center gap-2">
                    {deliverables.filter((x: any) => x._sendToClient).map((del: any) => (
                      <button
                        key={del._id}
                        onClick={async () => {
                          try { await sendToClientMut({ deliverableId: del._id as Id<"deliverables"> }); } catch {}
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send to Client
                      </button>
                    ))}
                  </div>
                ) : d.awaitingHandoff ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Team lead approved. Confirm receipt to open final approval actions.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {deliverables.filter((x: any) => x.awaitingHandoff).map((del: any) => (
                        <button
                          key={del._id}
                          type="button"
                          onClick={async () => {
                            try { await passToManagerMut({ deliverableId: del._id as Id<"deliverables"> }); } catch {}
                          }}
                          className="flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Receive{isMultiCreative ? ` #${deliverables.indexOf(del) + 1}` : ""} for review
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Per-deliverable approve buttons */}
                      {!d.hasIncompleteChainTasks ? (
                        <>
                          {deliverables.some((x: any) => x.status !== "approved") && (
                            <div className="flex gap-2 flex-wrap">
                              {deliverables.filter((x: any) => x.status !== "approved" && !x.isHandedOff).map((del: any, idx: number) => (
                                <button
                                  key={del._id}
                                  onClick={() => handleApprove(del._id)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve{isMultiCreative ? ` #${deliverables.indexOf(del) + 1}` : ""}
                                </button>
                              ))}
                            </div>
                          )}
                          {allApproved && !allHandedOff && (
                            <span className="text-[11px] text-[var(--accent-employee)] font-medium flex items-center gap-1">
                              <Check className="h-3 w-3" /> All Approved
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Chain tasks in progress — final approval pending
                        </span>
                      )}

                      {deliverables.some((x: any) => x.status !== "approved" && !x.isHandedOff) && !d.hasIncompleteChainTasks && (() => {
                        // Use the deliverable ID consistently across the button, state, and form
                        // so the guard inside renderRejectForm (showRejectForm === id) matches.
                        const rejectTargetId = (deliverables.find((x: any) => x.status !== "approved" && !x.isHandedOff)?._id ?? d._id) as string;
                        return showRejectForm === rejectTargetId ? (
                          renderRejectForm(rejectTargetId, handleReject)
                        ) : (
                          <button
                            onClick={() => setShowRejectForm(rejectTargetId)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-medium hover:bg-[var(--danger-dim)] transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Request Changes
                          </button>
                        );
                      })()}

                      {/* Task-level Hand Off button (hands off ALL approved deliverables) */}
                      {(allApproved || d.taskHasHandoffTarget) && !allHandedOff && (() => {
                        const hctx = handoffContexts?.[group.taskId as string];
                        // Master brief WITH downstream connection → hide entirely; resources auto-flow.
                        if (hctx?.inMasterBrief && hctx?.hasDownstreamConnection) return null;
                        return (
                          <button
                            onClick={() => { setHandoffTaskId(handoffTaskId === group.taskId ? null : group.taskId); }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                              handoffTaskId === group.taskId
                                ? "bg-indigo-600 text-white"
                                : "border border-indigo-500 text-indigo-600 hover:bg-indigo-50"
                            }`}
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            Hand Off to Team{isMultiCreative ? ` (all ${deliverables.filter((x: any) => !x.isHandedOff).length} creatives)` : ""}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Master-brief unconnected-node alert */}
                    {(() => {
                      const hctx = handoffContexts?.[group.taskId as string];
                      if (!hctx?.inMasterBrief || hctx?.hasDownstreamConnection) return null;
                      return (
                        <div className="mt-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                          This task is part of master brief <span className="font-semibold">&ldquo;{hctx.briefTitle}&rdquo;</span>{hctx.brandName ? <> for <span className="font-semibold">{hctx.brandName}</span></> : null} but isn&apos;t connected to a downstream node. Add a connection in the master-brief editor — you can hand off manually below for now.
                        </div>
                      );
                    })()}

                    {/* Task-level Handoff form — hands off ALL un-handed-off deliverables */}
                    {handoffTaskId === group.taskId && (
                      <div className="space-y-2 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                        <p className="text-[11px] font-medium text-indigo-700 mb-1">
                          Hand off {isMultiCreative ? `all ${deliverables.filter((x: any) => !x.isHandedOff).length} creatives` : "approved deliverable"} to another team
                        </p>
                        <select
                          value={handoffTeam[group.taskId] ?? ""}
                          onChange={(e) => {
                            setHandoffTeam((prev) => ({ ...prev, [group.taskId]: e.target.value }));
                            setHandoffAssignee((prev) => {
                              const n = { ...prev };
                              delete n[group.taskId];
                              return n;
                            });
                            setHandoffTargetChoice((prev) => {
                              const n = { ...prev };
                              delete n[group.taskId];
                              return n;
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">Select target team...</option>
                          {(allTeams ?? []).map((t: any) => (
                            <option key={t._id} value={t._id}>{t.name}</option>
                          ))}
                        </select>
                        {handoffTeam[group.taskId] && (
                          <select
                            value={handoffAssignee[group.taskId] ?? ""}
                            onChange={(e) => {
                              setHandoffAssignee((prev) => ({ ...prev, [group.taskId]: e.target.value }));
                              setHandoffTargetChoice((prev) => {
                                const n = { ...prev };
                                delete n[group.taskId];
                                return n;
                              });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">Select assignee from team...</option>
                            {(allUsers ?? [])
                              .filter((u: any) => (u.teams ?? []).some((t: any) => t._id === handoffTeam[group.taskId]))
                              .map((u: any) => (
                                <option key={u._id} value={u._id}>{u.name ?? u.email ?? "Unknown"}</option>
                              ))
                            }
                          </select>
                        )}
                        {handoffTeam[group.taskId] && handoffAssignee[group.taskId] && (() => {
                          const tk = group.taskId;
                          const opts = taskHandoffCandidates ?? [];
                          const needPick = opts.length > 0;
                          const choice = handoffTargetChoice[tk] ?? "";
                          const showNewFields = opts.length === 0 || choice === "__new__";
                          const canSubmit = handoffTeam[tk] && handoffAssignee[tk] && (!needPick || choice);
                          return (
                            <>
                              {needPick && (
                                <div>
                                  <label className="block text-[10px] font-semibold text-indigo-800 mb-0.5">Attach deliverables to</label>
                                  <select
                                    value={choice}
                                    onChange={(e) =>
                                      setHandoffTargetChoice((prev) => ({ ...prev, [tk]: e.target.value }))
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">Choose one...</option>
                                    <option value="__new__">Create a new task</option>
                                    {opts.map((t) => (
                                      <option key={t._id} value={t._id}>
                                        {t.title} ({t.status})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {opts.length === 0 && (
                                <p className="text-[10px] text-indigo-700">No open tasks for this person — a new task will be created on their team.</p>
                              )}
                              {showNewFields && (
                                <>
                                  <input
                                    type="text"
                                    value={handoffNewTitle[tk] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewTitle((prev) => ({ ...prev, [tk]: e.target.value }))
                                    }
                                    placeholder={`New task title (optional — defaults to Handoff: ${(d as any).taskTitle ?? "task"})`}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <textarea
                                    value={handoffNewDesc[tk] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewDesc((prev) => ({ ...prev, [tk]: e.target.value }))
                                    }
                                    placeholder="Description for the new task (optional)"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] min-h-[56px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <div>
                                    <label className="block text-[10px] font-semibold text-indigo-800 mb-0.5">Deadline (optional)</label>
                                    <input
                                      type="date"
                                      value={handoffDeadline[tk] ?? ""}
                                      onChange={(e) =>
                                        setHandoffDeadline((prev) => ({ ...prev, [tk]: e.target.value }))
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </>
                              )}
                              <textarea
                                value={handoffNote[tk] ?? ""}
                                onChange={(e) => setHandoffNote((prev) => ({ ...prev, [tk]: e.target.value }))}
                                placeholder="Extra instructions (optional) — appended to the handoff"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-[12px] min-h-[48px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <div className="flex gap-2">
                                <button
                                  disabled={!canSubmit}
                                  onClick={async () => {
                                    const teamId = handoffTeam[tk];
                                    const assigneeId = handoffAssignee[tk];
                                    if (!teamId || !assigneeId) return;
                                    const o = taskHandoffCandidates ?? [];
                                    const ch = handoffTargetChoice[tk] ?? "";
                                    const isNew = o.length === 0 || ch === "__new__";
                                    try {
                                      const toHandoff = deliverables.filter((x: any) =>
                                        (x.status === "approved" || x.teamLeadStatus === "approved") && !x.isHandedOff
                                      );
                                      for (let i = 0; i < toHandoff.length; i++) {
                                        const del = toHandoff[i];
                                        const payload: Record<string, unknown> = {
                                          deliverableId: del._id as Id<"deliverables">,
                                          targetTeamId: teamId as Id<"teams">,
                                          targetAssigneeId: assigneeId as Id<"users">,
                                          ...(handoffDeadline[tk] && isNew
                                            ? { deadline: new Date(handoffDeadline[tk] + "T23:59:59").getTime() }
                                            : {}),
                                          ...(handoffNote[tk]?.trim() ? { note: handoffNote[tk].trim() } : {}),
                                        };
                                        if (!isNew && ch && ch !== "__new__") {
                                          payload.targetExistingTaskId = ch as Id<"tasks">;
                                        } else {
                                          if (handoffNewTitle[tk]?.trim()) {
                                            payload.newTaskTitle = handoffNewTitle[tk].trim();
                                          }
                                          if (handoffNewDesc[tk]?.trim()) {
                                            payload.newTaskDescription = handoffNewDesc[tk].trim();
                                          }
                                          if (i === 0) payload.forceNewHandoffTask = true;
                                        }
                                        await handoffDeliverableMut(payload as any);
                                      }
                                      setHandoffTaskId(null);
                                      setHandoffTeam((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                      setHandoffAssignee((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                      setHandoffDeadline((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                      setHandoffNote((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                      setHandoffTargetChoice((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                      setHandoffNewTitle((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                      setHandoffNewDesc((prev) => {
                                        const n = { ...prev };
                                        delete n[tk];
                                        return n;
                                      });
                                    } catch {
                                      /* */
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                  <GitBranch className="h-3.5 w-3.5" />
                                  Hand Off{isMultiCreative ? " All" : ""}
                                </button>
                                <button
                                  onClick={() => setHandoffTaskId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-[12px] font-medium hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
            );
          })}
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
