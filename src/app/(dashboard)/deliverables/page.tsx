"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Button, ConfirmModal, EmptyState, PageHeader, SegmentedTabs, useToast, useCelebrate } from "@/components/ui";
import {
  Check, X, MessageSquare, ExternalLink, Paperclip, FileText,
  Image as ImageIcon, Eye, Trash2, ArrowRight, ShieldCheck, Users, UserCheck, Send, GitBranch, Loader2
} from "lucide-react";
import { FilePreviewModal } from "@/components/ui/FilePreviewModal";
import type { Id } from "@/convex/_generated/dataModel";
import { fieldBaseClass } from "@/components/ui/classes";

type TabType = "my" | "helper_reviews" | "team_approvals" | "brand_deliverables";

// One look for every native field on this page (32px, same as <Input>).
const FIELD = fieldBaseClass; // also on textareas, so no fixed height
const AREA =
  "px-2.5 py-2 rounded-md border border-[var(--border)] bg-white text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] focus:border-transparent";
// Informs: neutral. Asks the reader to do something: warning.
const NOTE = "rounded-md bg-[var(--bg-primary)] px-3 py-2 text-[12px] text-[var(--text-secondary)]";
const NOTE_WARNING = "rounded-md bg-[var(--warning-dim)] px-3 py-2 text-[12px] text-[var(--warning)]";
const FIELD_LABEL = "block text-[12px] font-medium text-[var(--text-secondary)] mb-1";

type Mark = { variant: "neutral" | "success" | "danger"; label: string };

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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Also shown to an admin who isn't a brand manager but has work sent
  // straight to them as the task's assignor.
  if (isBrandManager || (isAdmin && (managerDeliverables ?? []).length > 0)) {
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
  const { celebrate } = useCelebrate();

  async function handleApprove(deliverableId: string, taskTitle?: string) {
    try {
      await approveDeliverable({ deliverableId: deliverableId as any });
      // Final approval closes the task out — one of the three moments in this
      // app worth marking. A toast would say the same thing and be forgotten.
      celebrate(
        "Deliverable approved",
        taskTitle ? `${taskTitle} is done` : "The task is now done"
      );
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
      toast("success", "Changes requested. Sent back to the submitter");
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
    if (isSubmitting) return;
    if (!submitMessage.trim()) return;
    if (!editingDeliverableId && !submitTaskId) return;
    // One in-flight submit at a time: a double click or a second route button
    // would otherwise create duplicate deliverables.
    setIsSubmitting(true);
    try {
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
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const STATUS_STYLE: Record<string, Mark> = {
    pending: { variant: "neutral", label: "Pending Review" },
    approved: { variant: "success", label: "Approved" },
    rejected: { variant: "danger", label: "Changes Requested" },
  };

  const TL_STATUS_STYLE: Record<string, Mark> = {
    pending: { variant: "neutral", label: "TL Review Pending" },
    approved: { variant: "success", label: "TL Approved" },
    changes_requested: { variant: "danger", label: "TL Requested Changes" },
    rejected: { variant: "danger", label: "TL Rejected" },
  };

  const MA_STATUS_STYLE: Record<string, Mark> = {
    pending: { variant: "neutral", label: "Assignee Review Pending" },
    approved: { variant: "success", label: "Assignee Approved" },
    changes_requested: { variant: "danger", label: "Assignee Requested Changes" },
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
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-[13px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-admin-text)] transition-colors"
            >
              {isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span className="max-w-[150px] truncate">{file.name}</span>
              <Eye className="h-3.5 w-3.5 shrink-0" />
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
          className={`flex-1 min-w-0 ${FIELD}`}
          autoFocus
        />
        <Button
          variant="secondary"
          onClick={() => onReject(id)}
          disabled={noteIsEmpty}
          title={noteIsEmpty ? "Add a reason first" : "Send"}
        >
          Send
        </Button>
        <button
          onClick={() => setShowRejectForm(null)}
          aria-label="Cancel request for changes"
          className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Deliverables"
        actions={
          (myTasks ?? []).some((t) => t.status !== "done") && (
            <Button variant="primary" onClick={() => setShowSubmit(!showSubmit)}>
              Submit Deliverable
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4">
      {/* Tabs */}
      {availableTabs.length > 1 && (
        <SegmentedTabs
          value={activeTab}
          onChange={setActiveTab}
          options={availableTabs.map((tab) => ({
            value: tab.id,
            label: tab.label,
            count: tab.count !== undefined && tab.count > 0 ? tab.count : undefined,
          }))}
          className="self-start max-w-full overflow-x-auto"
        />
      )}

      {/* Submit form for employees */}
      {showSubmit && (
        <Card className="p-4">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3">
            {editingDeliverableId ? "Edit Deliverable" : "Submit a Deliverable"}
          </h3>
          <form onSubmit={(e) => handleSubmit(e, "tl")} className="flex flex-col gap-3">
            {!editingDeliverableId && (
              <select
                value={submitTaskId}
                onChange={(e) => setSubmitTaskId(e.target.value)}
                className={FIELD}
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
              className={`${AREA} min-h-[60px]`}
              required
            />
            <input
              value={submitLink}
              onChange={(e) => setSubmitLink(e.target.value)}
              placeholder="Link (optional)"
              className={FIELD}
            />
            {editingDeliverableId && editKeptFiles.length > 0 && (
              <div className={NOTE_WARNING}>
                <div className="font-medium mb-1">Existing files on this deliverable:</div>
                <div className="flex flex-wrap gap-1.5">
                  {editKeptFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white text-[12px] text-[var(--text-secondary)]">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="max-w-[200px] truncate">{f.name}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-1.5">Uploading new files will replace this set. Re-upload anything you want to keep.</div>
              </div>
            )}
            <div>
              <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-dashed border-[var(--border)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
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
                      {f.type.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      <span className="max-w-[150px] truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setSubmitFiles((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {editingDeliverableId ? (
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={isSubmitting}>Save Changes</Button>
                <Button type="button" variant="ghost" onClick={resetSubmitForm}>Cancel</Button>
              </div>
            ) : (() => {
              const selected = myTasks?.find((t) => t._id === submitTaskId);
              const showAssignorBtn = !!selected?.assignedBy && selected.assignedBy !== user?._id;
              return (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] font-medium text-[var(--text-muted)]">Submit to</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="primary" disabled={isSubmitting}>Team Lead</Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSubmitting || !submitMessage.trim() || !submitTaskId}
                      onClick={() => handleSubmit(null, "bm")}
                    >
                      Brand Manager
                    </Button>
                    {showAssignorBtn && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSubmitting || !submitMessage.trim() || !submitTaskId}
                        onClick={() => handleSubmit(null, "as")}
                      >
                        Assignor
                      </Button>
                    )}
                    <Button type="button" variant="ghost" onClick={resetSubmitForm}>Cancel</Button>
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
            // One mark per approval: the overall badge is dropped only when a
            // stage badge beside it already says the same thing.
            const stageRepeatsOverall =
              (status === "pending" && (maStatus === "pending" || tlStatus === "pending")) ||
              (status === "rejected" &&
                (maStatus === "changes_requested" || tlStatus === "changes_requested" || tlStatus === "rejected"));
            const showOverall = !((maStyle || tlStyle) && stageRepeatsOverall);

            return (
              <Card key={d._id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isSubTask && <Badge className="shrink-0">Helper</Badge>}
                      <p className="font-medium text-[14px] text-[var(--text-primary)]">
                        {d.taskTitle}
                      </p>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                      {isSubTask && (d as any).parentTaskTitle && (
                        <>Parent: <span className="font-medium text-[var(--text-primary)]">{(d as any).parentTaskTitle}</span> &middot; </>
                      )}
                      {d.briefTitle} &middot; by {d.submitterName} &middot;{" "}
                      {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {maStyle && <Badge variant={maStyle.variant}>{maStyle.label}</Badge>}
                    {tlStyle && <Badge variant={tlStyle.variant}>{tlStyle.label}</Badge>}
                    {showOverall && <Badge variant={style.variant}>{style.label}</Badge>}
                    {isAdmin && (
                      <button
                        onClick={() => setDeletingDeliverableId(d._id)}
                        className="inline-flex items-center justify-center h-8 w-8 -my-1.5 -mr-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
                        title="Delete deliverable"
                        aria-label="Delete deliverable"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[13px] text-[var(--text-secondary)] mb-2">{d.message}</p>

                {d.link && (
                  <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-admin-text)] hover:underline mb-2">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {d.link}
                  </a>
                )}

                {renderFiles((d as any).files ?? [])}

                {d.reviewNote && (
                  <div className={`flex items-start gap-2 mt-2 ${NOTE}`}>
                    <MessageSquare className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {d.reviewerName ?? "Reviewer"}:
                      </p>
                      <p>{d.reviewNote}</p>
                    </div>
                  </div>
                )}

                {(d as any).mainAssigneeReviewNote && (d as any).mainAssigneeReviewerName && (
                  <div className={`flex items-start gap-2 mt-2 ${NOTE}`}>
                    <UserCheck className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {(d as any).mainAssigneeReviewerName} (Main Assignee):
                      </p>
                      <p>{(d as any).mainAssigneeReviewNote}</p>
                    </div>
                  </div>
                )}

                {(d as any).teamLeadReviewNote && (d as any).teamLeadReviewerName && (
                  <div className={`flex items-start gap-2 mt-2 ${NOTE}`}>
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {(d as any).teamLeadReviewerName} (Team Lead):
                      </p>
                      <p>{(d as any).teamLeadReviewNote}</p>
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
                      <Button variant="secondary" onClick={() => openEdit(d)}>
                        Edit
                      </Button>
                      <span className="text-[12px] text-[var(--text-muted)]">
                        {isSubTask ? "Editable until main assignee reviews" : "Editable until team lead reviews"}
                      </span>
                    </div>
                  );
                })()}

                {/* Admin actions: final approve/reject for pending deliverables (never on your own submissions) */}
                {isAdmin && status === "pending" && d.submittedBy !== user?._id && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <Button variant="primary" onClick={() => handleApprove(d._id, d.taskTitle)}>
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    {showRejectForm === d._id ? (
                      renderRejectForm(d._id, handleReject)
                    ) : (
                      <Button variant="secondary" onClick={() => setShowRejectForm(d._id)}>
                        <X className="h-3.5 w-3.5" />
                        Request Changes
                      </Button>
                    )}
                  </div>
                )}

                {/* Hand off approved deliverable to another team — gated by master-brief connectivity */}
                {(isAdmin || isBrandManager) && (status === "approved" || (d as any).clientStatus === "client_approved") && (() => {
                  const hctx = handoffContexts?.[d.taskId as string];
                  // Master brief WITH downstream connection → hide entirely; resources auto-flow.
                  // Calendar tasks never have connections and auto-handoff on their own.
                  if (hctx?.briefType === "content_calendar") return null;
                  if (hctx?.inMasterBrief && hctx?.hasDownstreamConnection) return null;
                  return (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    {hctx?.inMasterBrief && !hctx?.hasDownstreamConnection && (
                      <div className={`mb-2 ${NOTE_WARNING}`}>
                        This task is part of master brief <span className="font-semibold">&ldquo;{hctx.briefTitle}&rdquo;</span>{hctx.brandName ? <> for <span className="font-semibold">{hctx.brandName}</span></> : null} but isn&apos;t connected to a downstream node. Add a connection in the master-brief editor. You can hand off manually below for now.
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      aria-expanded={handoffDeliverableId === d._id}
                      onClick={() => setHandoffDeliverableId(handoffDeliverableId === d._id ? null : d._id)}
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      Hand Off to Team
                    </Button>
                    {handoffDeliverableId === d._id && (
                      <div className="space-y-2 mt-2 p-3 rounded-md bg-[var(--bg-primary)]">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">Hand off to another team for the next stage</p>
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
                          className={`w-full ${FIELD}`}
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
                            className={`w-full ${FIELD}`}
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
                                  <label className={FIELD_LABEL}>Attach deliverable to</label>
                                  <select
                                    value={choice}
                                    onChange={(e) =>
                                      setHandoffTargetChoice((prev) => ({ ...prev, [d._id]: e.target.value }))
                                    }
                                    className={`w-full ${FIELD}`}
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
                                <p className="text-[12px] text-[var(--text-secondary)]">No open tasks for this person. A new task will be created on their team.</p>
                              )}
                              {showNewFields && (
                                <>
                                  <input
                                    type="text"
                                    value={handoffNewTitle[d._id] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewTitle((prev) => ({ ...prev, [d._id]: e.target.value }))
                                    }
                                    placeholder={`New task title (optional, defaults to Handoff: ${(d as any).taskTitle ?? "task"})`}
                                    className={`w-full ${FIELD}`}
                                  />
                                  <textarea
                                    value={handoffNewDesc[d._id] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewDesc((prev) => ({ ...prev, [d._id]: e.target.value }))
                                    }
                                    placeholder="Description for the new task (optional)"
                                    className={`w-full ${AREA} min-h-[56px]`}
                                  />
                                  <div>
                                    <label className={FIELD_LABEL}>Deadline (optional)</label>
                                    <input
                                      type="date"
                                      value={handoffDeadline[d._id] ?? ""}
                                      onChange={(e) =>
                                        setHandoffDeadline((prev) => ({ ...prev, [d._id]: e.target.value }))
                                      }
                                      className={`w-full ${FIELD}`}
                                    />
                                  </div>
                                </>
                              )}
                              <textarea
                                value={handoffNote[d._id] ?? ""}
                                onChange={(e) => setHandoffNote((prev) => ({ ...prev, [d._id]: e.target.value }))}
                                placeholder="Extra instructions (optional), appended to the handoff"
                                className={`w-full ${AREA} min-h-[48px]`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  variant="primary"
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
                                >
                                  <GitBranch className="h-3.5 w-3.5" />
                                  Hand Off
                                </Button>
                                <Button variant="ghost" onClick={() => setHandoffDeliverableId(null)}>
                                  Cancel
                                </Button>
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
            <EmptyState
              icon={FileText}
              title="No deliverables yet"
              description="Submitted work waiting for review will show up here."
            />
          )}
        </div>
      )}

      {/* Tab: Helper Reviews (Main Assignee) */}
      {activeTab === "helper_reviews" && (
        <div className="space-y-3">
          {(mainAssigneePending ?? []).length === 0 && (
            <EmptyState title="No pending helper deliverables to review." />
          )}
          {(mainAssigneePending ?? []).map((d: any) => (
            <Card key={d._id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Badge className="shrink-0">Helper</Badge>
                    <p className="font-medium text-[14px] text-[var(--text-primary)]">
                      {d.subTaskTitle}
                    </p>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    Parent task: <span className="font-medium text-[var(--text-primary)]">{d.parentTaskTitle}</span> &middot; {d.briefTitle} &middot; by{" "}
                    <span className="font-medium text-[var(--text-primary)]">{d.submitterName}</span> &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <Badge className="shrink-0">Awaiting Your Review</Badge>
              </div>

              {d.subTaskDescription && (
                <div className={`mb-2 ${NOTE}`}>
                  <p>
                    <span className="font-medium text-[var(--text-primary)]">Sub-task:</span>{" "}{d.subTaskDescription}
                  </p>
                </div>
              )}

              <p className="text-[13px] text-[var(--text-secondary)] mb-2">{d.message}</p>

              {d.link && (
                <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-admin-text)] hover:underline mb-2">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {d.link}
                </a>
              )}

              {renderFiles(d.files ?? [])}

              <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                {d.mainAssigneeStatus === "pending" && (
                  <>
                    <Button variant="primary" onClick={() => handleMainAssigneeApprove(d._id)}>
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    {showRejectForm === d._id ? (
                      renderRejectForm(d._id, handleMainAssigneeReject)
                    ) : (
                      <Button variant="secondary" onClick={() => setShowRejectForm(d._id)}>
                        <X className="h-3.5 w-3.5" />
                        Request Changes
                      </Button>
                    )}
                  </>
                )}

                {d.mainAssigneeStatus === "approved" && !d.teamLeadStatus && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--accent-employee-text)] font-medium flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5" />
                      Approved by you
                    </span>
                    <Button variant="primary" onClick={() => handlePassSubTaskToTeamLead(d._id)}>
                      <ArrowRight className="h-3.5 w-3.5" />
                      Pass to Team Lead
                    </Button>
                  </div>
                )}

                {d.teamLeadStatus && (
                  <span className="text-[12px] text-[var(--text-muted)] font-medium">
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
            <EmptyState title="No pending approvals from your team." />
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
                    {d.isSubTask && <Badge className="shrink-0">Helper</Badge>}
                    <p className="font-medium text-[14px] text-[var(--text-primary)]">
                      {d.taskTitle}
                    </p>
                    {isMultiCreative && (
                      <Badge className="shrink-0">{deliverables.length} creatives</Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    {d.isSubTask && d.parentTaskTitle && (
                      <>Parent: <span className="font-medium text-[var(--text-primary)]">{d.parentTaskTitle}</span> &middot; </>
                    )}
                    {d.briefTitle} &middot; {d.brandName} &middot; by{" "}
                    <span className="font-medium text-[var(--text-primary)]">{d.submitterName}</span> &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <Badge className="shrink-0">
                  {isMultiCreative
                    ? `${d.taskApprovedByTLCount ?? 0}/${deliverables.length} Approved`
                    : "Awaiting Review"}
                </Badge>
              </div>

              {d.isSubTask && d.mainAssigneeApproved && d.mainAssigneeReviewerName && (
                <div className={`flex items-center gap-2 mb-2 w-fit ${NOTE}`}>
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  <span>
                    Approved by main assignee: {d.mainAssigneeReviewerName}
                    {d.mainAssigneeName && d.mainAssigneeName !== d.mainAssigneeReviewerName
                      ? ` (${d.mainAssigneeName})`
                      : ""}
                  </span>
                </div>
              )}

              {/* Render each deliverable/creative within this task */}
              {deliverables.map((del: any, idx: number) => (
                <div key={del._id} className={`${isMultiCreative ? "ml-3 pl-3 border-l-2 border-[var(--border)] mb-2" : "mb-2"}`}>
                  {isMultiCreative && (
                    <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">Creative {idx + 1}</p>
                  )}
                  <p className="text-[13px] text-[var(--text-secondary)] mb-1">{del.message}</p>
                  {del.link && (
                    <a href={del.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-admin-text)] hover:underline mb-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                      {del.link}
                    </a>
                  )}
                  {renderFiles(del.files ?? [])}

                  <div className="flex items-center flex-wrap gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                    {del.teamLeadStatus === "pending" && (
                      <>
                        <Button variant="primary" onClick={() => handleTeamLeadApprove(del._id)}>
                          <Check className="h-3.5 w-3.5" />
                          Approve{isMultiCreative ? ` #${idx + 1}` : " as Team Lead"}
                        </Button>
                        {del.isAlsoBrandManager && (
                          <Button variant="secondary" onClick={() => handleTeamLeadAndManagerApprove(del._id)}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Approve as TL & Manager
                          </Button>
                        )}
                        {showRejectForm === del._id ? (
                          renderRejectForm(del._id, handleTeamLeadReject)
                        ) : (
                          <Button variant="secondary" onClick={() => setShowRejectForm(del._id)}>
                            <X className="h-3.5 w-3.5" />
                            Request Changes
                          </Button>
                        )}
                      </>
                    )}

                    {del.teamLeadStatus === "approved" && !del.passedToManagerAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[var(--accent-employee-text)] font-medium">TL Approved</span>
                        {del.isAlsoBrandManager ? (
                          <Button variant="primary" onClick={() => handleManagerApproveFromTeamLead(del._id)}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Final Approve (Brand Manager)
                          </Button>
                        ) : (
                          (del.brandManagers ?? []).map((mgr: any) => (
                            <Button
                              key={mgr._id}
                              variant="primary"
                              onClick={async () => {
                                try { await passToManagerMut({ deliverableId: del._id as Id<"deliverables"> }); } catch {}
                              }}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Pass to {mgr.name}
                            </Button>
                          ))
                        )}
                      </div>
                    )}

                    {del.passedToManagerAt && (
                      <span className="text-[12px] text-[var(--text-muted)] font-medium">
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
            <EmptyState title="No deliverables pending your review." />
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
                    <p className="font-medium text-[14px] text-[var(--text-primary)]">
                      {d.taskTitle}
                    </p>
                    {d.taskClientFacing && <Badge>Client-facing</Badge>}
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    {d.briefTitle} &middot; {d.brandName} &middot; by{" "}
                    <span className="font-medium text-[var(--text-primary)]">{d.submitterName}</span> &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                {isMultiCreative && (
                  <Badge className="shrink-0">{deliverables.length} creatives</Badge>
                )}
                {allHandedOff ? (
                  <Badge variant={d.hasIncompleteChainTasks ? "neutral" : "success"} className="shrink-0">
                    Handed Off{d.handoffTargetTeamName ? ` → ${d.handoffTargetTeamName}` : ""}
                    {d.hasIncompleteChainTasks ? " (in progress)" : " ✓"}
                  </Badge>
                ) : hasSendToClient ? (
                  <Badge className="shrink-0">Ready to Send to Client</Badge>
                ) : allApproved ? (
                  <Badge variant="success" className="shrink-0">
                    All Approved{d.taskHasHandoffTarget ? ", awaiting handoff" : ""}
                  </Badge>
                ) : d.awaitingHandoff ? (
                  <Badge className="shrink-0">TL approved, handoff pending</Badge>
                ) : (
                  <Badge className="shrink-0">
                    {isMultiCreative
                      ? `${deliverables.filter((x: any) => x.status === "approved").length}/${deliverables.length} Approved`
                      : "Awaiting Your Approval"}
                  </Badge>
                )}
              </div>

              {d.teamLeadReviewerName && (
                <div className={`flex items-center gap-2 mb-2 w-fit ${NOTE}`}>
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  <span>
                    Approved by {d.teamLeadReviewerName}{d.teamName ? ` of ${d.teamName}` : ""}
                  </span>
                </div>
              )}

              {/* Render each deliverable/creative within this task group */}
              {deliverables.map((del: any, idx: number) => (
                <div key={del._id} className={`${isMultiCreative ? "ml-3 pl-3 border-l-2 border-[var(--border)] mb-3" : "mb-2"}`}>
                  {isMultiCreative && (
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-medium text-[var(--text-muted)]">Creative {idx + 1}</p>
                      {del.isHandedOff && <Badge>Handed Off</Badge>}
                      {del.status === "approved" && !del.isHandedOff && (
                        <Badge variant="success">Approved</Badge>
                      )}
                    </div>
                  )}
                  <p className="text-[13px] text-[var(--text-secondary)] mb-1">{del.message}</p>

                  {del.clientNote && (del.clientStatus === "client_changes_requested" || del.clientStatus === "client_denied") && (
                    <div className={`mb-1 rounded-md px-3 py-2 text-[12px] ${del.clientStatus === "client_denied" ? "bg-[var(--danger-dim)] text-[var(--danger)]" : "bg-[var(--warning-dim)] text-[var(--warning)]"}`}>
                      <span className="font-semibold">Client remarks:</span> {del.clientNote}
                    </div>
                  )}

                  {del.link && (
                    <a href={del.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-admin-text)] hover:underline mb-1">
                      <ExternalLink className="h-3.5 w-3.5" />
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
                        className={`flex-1 min-w-0 ${FIELD}`}
                      >
                        <option value="">Select team member to reassign...</option>
                        {(d.teamMembers ?? []).map((m: any) => (
                          <option key={m._id} value={m._id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="primary"
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
                      className="w-fit"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send Back to Team Member
                    </Button>
                  </div>
                ) : hasSendToClient ? (
                  <div className="flex items-center gap-2">
                    {deliverables.filter((x: any) => x._sendToClient).map((del: any) => (
                      <Button
                        key={del._id}
                        variant="primary"
                        onClick={async () => {
                          try { await sendToClientMut({ deliverableId: del._id as Id<"deliverables"> }); } catch {}
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send to Client
                      </Button>
                    ))}
                  </div>
                ) : d.awaitingHandoff ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Team lead approved. Confirm receipt to open final approval actions.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {deliverables.filter((x: any) => x.awaitingHandoff).map((del: any) => (
                        <Button
                          key={del._id}
                          type="button"
                          variant="primary"
                          onClick={async () => {
                            try { await passToManagerMut({ deliverableId: del._id as Id<"deliverables"> }); } catch {}
                          }}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Receive{isMultiCreative ? ` #${deliverables.indexOf(del) + 1}` : ""} for review
                        </Button>
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
                                <Button
                                  key={del._id}
                                  variant="primary"
                                  onClick={() => handleApprove(del._id, del.taskTitle ?? d?.taskTitle)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve{isMultiCreative ? ` #${deliverables.indexOf(del) + 1}` : ""}
                                </Button>
                              ))}
                            </div>
                          )}
                          {allApproved && !allHandedOff && (
                            <span className="text-[12px] text-[var(--accent-employee-text)] font-medium flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" /> All Approved
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-[var(--text-secondary)] font-medium flex items-center gap-1">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Chain tasks in progress, final approval pending
                        </span>
                      )}

                      {deliverables.some((x: any) => x.status !== "approved" && !x.isHandedOff) && !d.hasIncompleteChainTasks && (() => {
                        // Use the deliverable ID consistently across the button, state, and form
                        // so the guard inside renderRejectForm (showRejectForm === id) matches.
                        const rejectTargetId = (deliverables.find((x: any) => x.status !== "approved" && !x.isHandedOff)?._id ?? d._id) as string;
                        return showRejectForm === rejectTargetId ? (
                          renderRejectForm(rejectTargetId, handleReject)
                        ) : (
                          <Button variant="secondary" onClick={() => setShowRejectForm(rejectTargetId)}>
                            <X className="h-3.5 w-3.5" />
                            Request Changes
                          </Button>
                        );
                      })()}

                      {/* Task-level Hand Off button (hands off ALL approved deliverables) */}
                      {(allApproved || d.taskHasHandoffTarget) && !allHandedOff && (() => {
                        const hctx = handoffContexts?.[group.taskId as string];
                        // Master brief WITH downstream connection → hide entirely; resources auto-flow.
                        // Calendar tasks never have connections and auto-handoff on their own.
                        if (hctx?.briefType === "content_calendar") return null;
                        if (hctx?.inMasterBrief && hctx?.hasDownstreamConnection) return null;
                        return (
                          <Button
                            variant="secondary"
                            aria-expanded={handoffTaskId === group.taskId}
                            onClick={() => { setHandoffTaskId(handoffTaskId === group.taskId ? null : group.taskId); }}
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            Hand Off to Team{isMultiCreative ? ` (all ${deliverables.filter((x: any) => !x.isHandedOff).length} creatives)` : ""}
                          </Button>
                        );
                      })()}
                    </div>

                    {/* Master-brief unconnected-node alert */}
                    {(() => {
                      const hctx = handoffContexts?.[group.taskId as string];
                      if (!hctx?.inMasterBrief || hctx?.hasDownstreamConnection || hctx?.briefType === "content_calendar") return null;
                      return (
                        <div className={NOTE_WARNING}>
                          This task is part of master brief <span className="font-semibold">&ldquo;{hctx.briefTitle}&rdquo;</span>{hctx.brandName ? <> for <span className="font-semibold">{hctx.brandName}</span></> : null} but isn&apos;t connected to a downstream node. Add a connection in the master-brief editor. You can hand off manually below for now.
                        </div>
                      );
                    })()}

                    {/* Task-level Handoff form — hands off ALL un-handed-off deliverables */}
                    {handoffTaskId === group.taskId && (
                      <div className="space-y-2 p-3 rounded-md bg-[var(--bg-primary)]">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">
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
                          className={`w-full ${FIELD}`}
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
                            className={`w-full ${FIELD}`}
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
                                  <label className={FIELD_LABEL}>Attach deliverables to</label>
                                  <select
                                    value={choice}
                                    onChange={(e) =>
                                      setHandoffTargetChoice((prev) => ({ ...prev, [tk]: e.target.value }))
                                    }
                                    className={`w-full ${FIELD}`}
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
                                <p className="text-[12px] text-[var(--text-secondary)]">No open tasks for this person. A new task will be created on their team.</p>
                              )}
                              {showNewFields && (
                                <>
                                  <input
                                    type="text"
                                    value={handoffNewTitle[tk] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewTitle((prev) => ({ ...prev, [tk]: e.target.value }))
                                    }
                                    placeholder={`New task title (optional, defaults to Handoff: ${(d as any).taskTitle ?? "task"})`}
                                    className={`w-full ${FIELD}`}
                                  />
                                  <textarea
                                    value={handoffNewDesc[tk] ?? ""}
                                    onChange={(e) =>
                                      setHandoffNewDesc((prev) => ({ ...prev, [tk]: e.target.value }))
                                    }
                                    placeholder="Description for the new task (optional)"
                                    className={`w-full ${AREA} min-h-[56px]`}
                                  />
                                  <div>
                                    <label className={FIELD_LABEL}>Deadline (optional)</label>
                                    <input
                                      type="date"
                                      value={handoffDeadline[tk] ?? ""}
                                      onChange={(e) =>
                                        setHandoffDeadline((prev) => ({ ...prev, [tk]: e.target.value }))
                                      }
                                      className={`w-full ${FIELD}`}
                                    />
                                  </div>
                                </>
                              )}
                              <textarea
                                value={handoffNote[tk] ?? ""}
                                onChange={(e) => setHandoffNote((prev) => ({ ...prev, [tk]: e.target.value }))}
                                placeholder="Extra instructions (optional), appended to the handoff"
                                className={`w-full ${AREA} min-h-[48px]`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  variant="primary"
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
                                >
                                  <GitBranch className="h-3.5 w-3.5" />
                                  Hand Off{isMultiCreative ? " All" : ""}
                                </Button>
                                <Button variant="ghost" onClick={() => setHandoffTaskId(null)}>
                                  Cancel
                                </Button>
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

      </div>

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
