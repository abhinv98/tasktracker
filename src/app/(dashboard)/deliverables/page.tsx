"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Button } from "@/components/ui";
import { Check, X, MessageSquare, ExternalLink } from "lucide-react";

export default function DeliverablesPage() {
  const user = useQuery(api.users.getCurrentUser);
  const deliverables = useQuery(api.approvals.listDeliverables, {});
  const approveDeliverable = useMutation(api.approvals.approveDeliverable);
  const rejectDeliverable = useMutation(api.approvals.rejectDeliverable);
  const submitDeliverable = useMutation(api.approvals.submitDeliverable);

  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);

  // Submit form state
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitLink, setSubmitLink] = useState("");

  const role = user?.role ?? "employee";
  const isManagerOrAdmin = role === "admin" || role === "manager";

  // For employees, show their tasks to submit deliverables
  const myTasks = useQuery(
    api.tasks.listTasksForUser,
    user ? { userId: user._id } : "skip"
  );

  const filteredDeliverables = deliverables?.filter((d) => {
    if (role === "employee") return d.submittedBy === user?._id;
    return true;
  }) ?? [];

  async function handleApprove(deliverableId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await approveDeliverable({ deliverableId: deliverableId as any });
  }

  async function handleReject(deliverableId: string) {
    const note = rejectNote[deliverableId];
    if (!note?.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await rejectDeliverable({ deliverableId: deliverableId as any, note: note.trim() });
    setShowRejectForm(null);
    setRejectNote({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitTaskId || !submitMessage.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await submitDeliverable({ taskId: submitTaskId as any, message: submitMessage.trim(), link: submitLink || undefined });
    setShowSubmit(false);
    setSubmitTaskId("");
    setSubmitMessage("");
    setSubmitLink("");
  }

  const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "var(--accent-admin-dim)", text: "var(--accent-admin)", label: "Pending Review" },
    approved: { bg: "var(--accent-employee-dim)", text: "var(--accent-employee)", label: "Approved" },
    rejected: { bg: "var(--danger-dim)", text: "var(--danger)", label: "Changes Requested" },
  };

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
            <div className="flex gap-2">
              <Button type="submit" variant="primary">Submit</Button>
              <Button type="button" variant="secondary" onClick={() => setShowSubmit(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Deliverables list */}
      <div className="space-y-3">
        {filteredDeliverables.map((d) => {
          const status = d.status ?? "pending";
          const style = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
          return (
            <Card key={d._id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] text-[var(--text-primary)]">
                    {d.taskTitle}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {d.briefTitle} &middot; by {d.submitterName} &middot;{" "}
                    {new Date(d.submittedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  {style.label}
                </span>
              </div>

              <p className="text-[12px] text-[var(--text-secondary)] mb-2">{d.message}</p>

              {d.link && (
                <a
                  href={d.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-admin)] hover:underline mb-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  {d.link}
                </a>
              )}

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

              {/* Actions for managers/admins */}
              {isManagerOrAdmin && status === "pending" && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => handleApprove(d._id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-employee)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  {showRejectForm === d._id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={rejectNote[d._id] ?? ""}
                        onChange={(e) => setRejectNote({ ...rejectNote, [d._id]: e.target.value })}
                        placeholder="Reason for changes..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--danger)]"
                        autoFocus
                      />
                      <button
                        onClick={() => handleReject(d._id)}
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
            <p className="text-[13px] text-[var(--text-muted)]">
              No deliverables yet.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
