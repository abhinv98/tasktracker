"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PageHeader, Button, StatusBadge, useToast } from "@/components/ui";
import {
  HR_CATEGORIES,
  HR_STATUSES,
  statusMeta,
  type HrCategory,
  type HrStatus,
} from "@/lib/hrRequests";
import {
  LifeBuoy,
  Paperclip,
  Download,
  Trash2,
  Loader2,
  Check,
  Ban,
  Inbox,
} from "lucide-react";

type HrDoc = {
  fileId: Id<"_storage">;
  fileName: string;
  fileType?: string;
  uploadedAt: number;
  url: string | null;
};

type HrRequest = {
  _id: Id<"hrRequests">;
  category: HrCategory;
  subject: string;
  details?: string;
  status: HrStatus;
  statusNote?: string;
  documents: HrDoc[];
  createdAt: number;
  requesterName: string;
  requesterDesignation: string | null;
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RequestCard({ req }: { req: HrRequest }) {
  const setStatus = useMutation(api.hr.setStatus);
  const addDocument = useMutation(api.hr.addDocument);
  const removeDocument = useMutation(api.hr.removeDocument);
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState(req.statusNote ?? "");
  const meta = statusMeta(req.status);

  async function update(status: HrStatus, statusNote?: string) {
    try {
      await setStatus({ requestId: req._id, status, statusNote });
      toast("success", "Request updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await addDocument({
        requestId: req._id,
        document: {
          fileId: storageId,
          fileName: file.name,
          fileType: file.type,
          uploadedAt: Date.now(),
        },
      });
      toast("success", "Document uploaded");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              {req.requesterName}
            </span>
            {req.requesterDesignation && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {req.requesterDesignation}
              </span>
            )}
            <StatusBadge color={meta.color} label={meta.label} />
          </div>
          <h3 className="mt-1.5 font-medium text-[14px] text-[var(--text-primary)]">
            {req.subject}
          </h3>
          {req.details && (
            <p className="mt-1 text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
              {req.details}
            </p>
          )}
        </div>
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">
          {formatDate(req.createdAt)}
        </span>
      </div>

      {/* Triage */}
      {req.status === "pending" ? (
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={() => update("accepted")}>
            <Check size={14} />
            Accept
          </Button>
          <Button variant="secondary" onClick={() => update("declined")}>
            <Ban size={14} />
            Decline
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={req.status}
            onChange={(e) => update(e.target.value as HrStatus)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          >
            {HR_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Status note for the employee…"
            className="flex-1 min-w-[200px] bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
          <Button
            variant="secondary"
            disabled={!note.trim() || note === (req.statusNote ?? "")}
            onClick={() => update(req.status, note)}
          >
            Save note
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Paperclip size={14} />
            )}
            {uploading ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      )}

      {req.documents.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {req.documents.map((d) => (
            <div
              key={d.fileId}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] group"
            >
              <Paperclip size={13} className="text-[var(--text-muted)]" />
              <a
                href={d.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-[12px] text-[var(--text-primary)] hover:underline"
              >
                {d.fileName}
              </a>
              <a href={d.url ?? "#"} target="_blank" rel="noreferrer">
                <Download size={13} className="text-[var(--text-muted)]" />
              </a>
              <button
                onClick={() =>
                  removeDocument({ requestId: req._id, fileId: d.fileId })
                }
                className="text-[var(--text-muted)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HrRequestsPage() {
  const requests = useQuery(api.hr.listAll) as HrRequest[] | undefined;
  const [openOnly, setOpenOnly] = useState(false);

  if (requests === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading…</p>
      </div>
    );
  }

  const visible = openOnly
    ? requests.filter((r) => r.status !== "completed" && r.status !== "declined")
    : requests;
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-8">
      <PageHeader
        title="Requests"
        subtitle={`${pendingCount} awaiting your response`}
        icon={LifeBuoy}
        actions={
          <Button
            variant={openOnly ? "primary" : "secondary"}
            onClick={() => setOpenOnly((v) => !v)}
          >
            Open only
          </Button>
        }
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">
            No requests
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {HR_CATEGORIES.map(({ value, label }) => {
            const group = visible.filter((r) => r.category === value);
            if (group.length === 0) return null;
            return (
              <section key={value}>
                <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {label}
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] normal-case tracking-normal">
                    {group.length}
                  </span>
                </h2>
                <div className="flex flex-col gap-3">
                  {group.map((r) => (
                    <RequestCard key={r._id} req={r} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
