"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PageHeader, Badge, Button, ConfirmModal, EmptyState, Input, Modal, Select, SegmentedTabs, SectionHeader, Textarea, StatusBadge, useToast, SkeletonCards } from "@/components/ui";
import {
  HR_CATEGORIES,
  categoryLabel,
  statusMeta,
  type HrCategory,
  type HrStatus,
} from "@/lib/hrRequests";
import { Send, Paperclip, Download, Trash2, Inbox } from "lucide-react";

type MyRequest = {
  _id: Id<"hrRequests">;
  category: HrCategory;
  subject: string;
  details?: string;
  status: HrStatus;
  statusNote?: string;
  documents: { fileId: Id<"_storage">; fileName: string; url: string | null }[];
  createdAt: number;
};

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
    <Modal
      open
      onClose={onClose}
      title="Send Request to HR"
      icon={Send}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="hr-request-form"
            loading={submitting}
            disabled={!subject.trim()}
          >
            Send Request
          </Button>
        </>
      }
    >
      <form
        id="hr-request-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
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
      </form>
    </Modal>
  );
}

function RequestCard({
  req,
  onDelete,
}: {
  req: MyRequest;
  onDelete: () => void;
}) {
  const meta = statusMeta(req.status);

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-white p-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <Badge>{categoryLabel(req.category)}</Badge>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge color={meta.color} label={meta.label} />
          <span className="text-[12px] text-[var(--text-muted)]">
            {formatDate(req.createdAt)}
          </span>
        </div>
      </div>

      <h3 className="mt-2 font-medium text-[14px] text-[var(--text-primary)] leading-snug">
        {req.subject}
      </h3>
      {req.details && (
        <p className="mt-1 text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
          {req.details}
        </p>
      )}

      {req.statusNote && (
        <div className="mt-3 rounded-md bg-[var(--bg-primary)] px-3 py-2">
          <p className="text-[12px] font-medium text-[var(--text-muted)]">
            Update from HR
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
            {req.statusNote}
          </p>
        </div>
      )}

      {req.documents.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {req.documents.map((d) => (
            <a
              key={d.fileId}
              href={d.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors group"
            >
              <Paperclip size={14} className="text-[var(--text-muted)] shrink-0" />
              <span className="flex-1 truncate text-[12px] text-[var(--text-primary)]">
                {d.fileName}
              </span>
              <Download
                size={14}
                className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
              />
            </a>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3 flex justify-end border-t border-[var(--border-subtle)]">
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 size={14} />
          Delete
        </Button>
      </div>
    </div>
  );
}

type Tab = "all" | HrCategory;

export default function MyRequestsPage() {
  const requests = useQuery(api.hr.listMine) as MyRequest[] | undefined;
  const deleteRequest = useMutation(api.hr.deleteRequest);
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [deleting, setDeleting] = useState<MyRequest | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteRequest({ requestId: deleting._id });
      toast("success", "Request deleted");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete");
    }
    setDeleting(null);
  }

  const all = requests ?? [];
  const visible = tab === "all" ? all : all.filter((r) => r.category === tab);
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: all.length },
    ...HR_CATEGORIES.map((c) => ({
      key: c.value as Tab,
      label: c.label,
      count: all.filter((r) => r.category === c.value).length,
    })),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
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
        <SkeletonCards count={3} what="your requests" />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="Raise one with HR using the button above."
        />
      ) : (
        <>
          {/* Category tabs — same arrangement as HR's board */}
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={tabs.map(({ key, label, count }) => ({ value: key, label, count }))}
            className="mb-4 max-w-full flex-wrap"
          />

          {visible.length === 0 ? (
            <EmptyState icon={Inbox} title="No requests here" />
          ) : tab === "all" ? (
            <div className="flex flex-col gap-6">
              {HR_CATEGORIES.map(({ value, label }) => {
                const group = visible.filter((r) => r.category === value);
                if (group.length === 0) return null;
                return (
                  <section key={value}>
                    <SectionHeader title={label} count={group.length} />
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {group.map((r) => (
                        <RequestCard
                          key={r._id}
                          req={r}
                          onDelete={() => setDeleting(r)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((r) => (
                <RequestCard
                  key={r._id}
                  req={r}
                  onDelete={() => setDeleting(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showModal && <NewRequestModal onClose={() => setShowModal(false)} />}

      <ConfirmModal
        open={deleting !== null}
        title="Delete request"
        message={
          deleting && deleting.documents.length > 0
            ? `Delete "${deleting.subject}"? Any documents HR attached to it will be removed too.`
            : `Delete "${deleting?.subject}"? HR will no longer see it.`
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
