"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  Button,
  Input,
  Select,
  Textarea,
  StatusBadge,
  useToast,
} from "@/components/ui";
import {
  HR_CATEGORIES,
  categoryLabel,
  statusMeta,
  type HrCategory,
  type HrStatus,
} from "@/lib/hrRequests";
import { Send, X, Paperclip, Download, Trash2, Inbox } from "lucide-react";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const createRequest = useMutation(api.hr.createRequest);
  const { toast } = useToast();
  const [category, setCategory] = useState<HrCategory>("appointment_letter");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmitting(true);
    try {
      await createRequest({
        category,
        subject: subject.trim(),
        details: details.trim() || undefined,
      });
      toast("success", "Request sent to HR");
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[480px] mx-4 bg-white border border-[var(--border)] rounded-xl shadow-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-admin-dim)]">
              <Send size={15} className="text-[var(--accent-admin)]" />
            </div>
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)] tracking-tight">
              Send Request to HR
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={15} className="text-[var(--text-muted)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as HrCategory)}
            options={HR_CATEGORIES}
          />
          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Appraisal letter for FY 25-26"
          />
          <Textarea
            label="Your query"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add any detail HR needs to action this…"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !subject.trim()}>
              {submitting ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MyRequestsPage() {
  const requests = useQuery(api.hr.listMine);
  const deleteRequest = useMutation(api.hr.deleteRequest);
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);

  async function handleWithdraw(id: Id<"hrRequests">) {
    try {
      await deleteRequest({ requestId: id });
      toast("success", "Request withdrawn");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="My Requests"
        subtitle="Requests you've raised with HR and where they stand"
        icon={Send}
        actions={
          <Button onClick={() => setShowModal(true)}>
            <Send size={14} />
            Send Request to HR
          </Button>
        }
      />

      {requests === undefined ? (
        <p className="text-[14px] text-[var(--text-secondary)]">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">
            No requests yet
          </p>
          <p className="text-[13px] text-[var(--text-muted)] mt-1">
            Raise one with HR using the button above.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => {
            const meta = statusMeta(r.status as HrStatus);
            return (
              <div
                key={r._id}
                className="rounded-xl border border-[var(--border)] bg-white shadow-sm p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)]">
                        {categoryLabel(r.category as HrCategory)}
                      </span>
                      <StatusBadge color={meta.color} label={meta.label} />
                    </div>
                    <h3 className="mt-2 font-semibold text-[14px] text-[var(--text-primary)]">
                      {r.subject}
                    </h3>
                    {r.details && (
                      <p className="mt-1 text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
                        {r.details}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {formatDate(r.createdAt)}
                    </span>
                    {r.status === "pending" && (
                      <button
                        onClick={() => handleWithdraw(r._id)}
                        title="Withdraw request"
                        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--danger)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {r.statusNote && (
                  <div className="mt-3 rounded-lg bg-[var(--bg-hover)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Update from HR
                    </p>
                    <p className="mt-0.5 text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
                      {r.statusNote}
                    </p>
                  </div>
                )}

                {r.documents.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Documents ({r.documents.length})
                    </p>
                    {r.documents.map((d) => (
                      <a
                        key={d.fileId}
                        href={d.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border)] group"
                      >
                        <Paperclip size={13} className="text-[var(--text-muted)]" />
                        <span className="flex-1 truncate text-[12px] text-[var(--text-primary)]">
                          {d.fileName}
                        </span>
                        <Download
                          size={13}
                          className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <NewRequestModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
