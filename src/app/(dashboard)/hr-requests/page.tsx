"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PageHeader, Button, StatusBadge, useToast } from "@/components/ui";
import {
  HR_CATEGORIES,
  HR_STATUSES,
  categoryLabel,
  statusMeta,
  type HrCategory,
  type HrStatus,
} from "@/lib/hrRequests";
import {
  LifeBuoy,
  Paperclip,
  Download,
  Trash2,
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

function RequestCard({
  req,
  selected,
  onToggleSelect,
}: {
  req: HrRequest;
  selected: boolean;
  onToggleSelect: () => void;
}) {
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
    <div
      className={`flex flex-col rounded-xl border bg-white shadow-sm p-4 h-full transition-colors ${
        selected
          ? "border-[var(--accent-admin)] ring-1 ring-[var(--accent-admin)]"
          : "border-[var(--border)]"
      }`}
    >
      {/* Who + when */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${req.requesterName}'s request: ${req.subject}`}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-admin-strong)]"
          />
          <div className="min-w-0">
            <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
              {req.requesterName}
            </p>
            {req.requesterDesignation && (
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {req.requesterDesignation}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge color={meta.color} label={meta.label} />
          <span className="text-[11px] text-[var(--text-muted)]">
            {formatDate(req.createdAt)}
          </span>
        </div>
      </div>

      {/* What */}
      <div className="mt-3">
        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)]">
          {categoryLabel(req.category)}
        </span>
        <h3 className="mt-1.5 font-medium text-[15px] text-[var(--text-primary)] leading-snug">
          {req.subject}
        </h3>
        {req.details && (
          <p className="mt-1 text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap">
            {req.details}
          </p>
        )}
      </div>

      {req.documents.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {req.documents.map((d) => (
            <div
              key={d.fileId}
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)] group"
            >
              <Paperclip size={12} className="text-[var(--text-muted)] shrink-0" />
              <a
                href={d.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-[11px] text-[var(--text-primary)] hover:underline"
              >
                {d.fileName}
              </a>
              <a href={d.url ?? "#"} target="_blank" rel="noreferrer">
                <Download size={12} className="text-[var(--text-muted)]" />
              </a>
              <button
                onClick={() =>
                  removeDocument({ requestId: req._id, fileId: d.fileId })
                }
                className="text-[var(--text-muted)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions pinned to the bottom so cards in a row line up */}
      <div className="mt-auto pt-3">
        {req.status === "pending" ? (
          <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
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
          <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center gap-2">
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
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="secondary"
                loading={uploading}
                className="ml-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={14} />
                Upload
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Status note for the employee…"
                className="flex-1 min-w-0 bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
              <Button
                variant="secondary"
                disabled={!note.trim() || note === (req.statusNote ?? "")}
                onClick={() => update(req.status, note)}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "all" | HrCategory;

export default function HrRequestsPage() {
  const requests = useQuery(api.hr.listAll) as HrRequest[] | undefined;
  const setStatusBulk = useMutation(api.hr.setStatusBulk);
  const { toast } = useToast();
  const [openOnly, setOpenOnly] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Takes ids rather than reading `selected`, so it can only ever act on the
  // requests actually visible in the batch bar.
  async function applyBulk(status: HrStatus, ids: Id<"hrRequests">[]) {
    if (ids.length === 0) return;
    try {
      const { updated } = await setStatusBulk({ requestIds: ids, status });
      toast("success", `${updated} request${updated === 1 ? "" : "s"} updated`);
      setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Bulk update failed");
    }
  }

  if (requests === undefined) {
    return (
      <div className="p-8">
        <p className="text-[15px] text-[var(--text-secondary)]">Loading…</p>
      </div>
    );
  }

  const scoped = openOnly
    ? requests.filter((r) => r.status !== "completed" && r.status !== "declined")
    : requests;
  const visible =
    tab === "all" ? scoped : scoped.filter((r) => r.category === tab);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: scoped.length },
    ...HR_CATEGORIES.map((c) => ({
      key: c.value as Tab,
      label: c.label,
      count: scoped.filter((r) => r.category === c.value).length,
    })),
  ];

  // Count only what's on screen: switching tab or toggling "Open only" must
  // never leave a hidden request in the batch about to be actioned.
  const selectedVisible = visible.filter((r) => selected.has(r._id));
  const batchIds = selectedVisible.map((r) => r._id);
  const allVisibleSelected =
    visible.length > 0 && selectedVisible.length === visible.length;

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

      {/* Category tabs */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] w-fit mb-6 flex-wrap">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              tab === key
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
            <span
              className={`px-1.5 rounded text-[11px] ${
                tab === key
                  ? "bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]"
                  : "bg-white/60 text-[var(--text-muted)]"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Batch bar — sticks to the top of the scroll area so it stays reachable
          in a long list, and only exists while something is selected. */}
      {selectedVisible.length > 0 && (
        <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent-admin)] bg-white px-3 py-2 shadow-sm">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            {selectedVisible.length} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => applyBulk("accepted", batchIds)}>
              <Check size={14} />
              Accept all
            </Button>
            <Button variant="secondary" onClick={() => applyBulk("completed", batchIds)}>
              Mark completed
            </Button>
            <Button variant="secondary" onClick={() => applyBulk("declined", batchIds)}>
              <Ban size={14} />
              Decline all
            </Button>
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            id="select-all"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected(
                allVisibleSelected ? new Set() : new Set(visible.map((r) => r._id))
              )
            }
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-admin-strong)]"
          />
          <label
            htmlFor="select-all"
            className="text-[12px] text-[var(--text-muted)] cursor-pointer"
          >
            Select all {visible.length} shown
          </label>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">
            No requests here
          </p>
        </div>
      ) : tab === "all" ? (
        // Grouped by category so "All" still reads as segregated.
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
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {group.map((r) => (
                    <RequestCard
                      key={r._id}
                      req={r}
                      selected={selected.has(r._id)}
                      onToggleSelect={() => toggle(r._id)}
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
              selected={selected.has(r._id)}
              onToggleSelect={() => toggle(r._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
