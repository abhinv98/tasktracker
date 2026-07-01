"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PageHeader, useToast } from "@/components/ui";
import {
  Inbox,
  X,
  Calendar,
  Paperclip,
  Link2,
  Image as ImageIcon,
  FileText,
  Video,
  CheckCircle2,
  UserPlus,
  Ban,
  Trash2,
  Clock,
} from "lucide-react";

type RefItem = {
  kind: "image" | "document" | "video" | "link";
  name?: string;
  url?: string;
  fileKey?: string;
  contentType?: string;
};

type ClientRequest = {
  _id: string;
  brandId: string;
  title: string;
  description?: string;
  status: "pending_review" | "accepted" | "in_progress" | "completed" | "declined";
  proposedDeadline?: number;
  finalDeadline?: number;
  clientName?: string;
  references?: RefItem[];
  createdAt: number;
  linkedTaskId?: string;
  brandName: string;
  brandColor: string;
  assigneeName: string | null;
  assigned: boolean;
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

function toDateInput(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInput(val: string): number | undefined {
  if (!val) return undefined;
  // End-of-day local time, matching the app's DatePicker semantics.
  return new Date(val + "T23:59:59").getTime();
}

function refUrl(r: RefItem): string | undefined {
  if (r.url) return r.url;
  if (r.fileKey) return `/api/r2-file?key=${encodeURIComponent(r.fileKey)}`;
  return undefined;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: "Awaiting Review", color: "#b45309", bg: "#fffbeb" },
  accepted: { label: "Accepted", color: "#047857", bg: "#ecfdf5" },
  in_progress: { label: "In Progress", color: "#1d4ed8", bg: "#eff6ff" },
  completed: { label: "Completed", color: "#047857", bg: "#ecfdf5" },
};

function RefIcon({ kind }: { kind: RefItem["kind"] }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]";
  if (kind === "image") return <ImageIcon className={cls} />;
  if (kind === "video") return <Video className={cls} />;
  if (kind === "link") return <Link2 className={cls} />;
  return <FileText className={cls} />;
}

export default function ClientRequestsPage() {
  const { toast } = useToast();
  const requests = useQuery(api.jsr.listPendingClientRequests) as ClientRequest[] | undefined;
  const allUsers = useQuery(api.users.listAllUsers);

  const setDeadline = useMutation(api.jsr.updateClientTaskDeadline);
  const setStatus = useMutation(api.jsr.updateClientTaskStatus);
  const reassign = useMutation(api.jsr.reassignClientTask);
  const deleteTask = useMutation(api.jsr.deleteClientTask);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counterDate, setCounterDate] = useState<number | undefined>(undefined);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => (requests ?? []).find((r) => r._id === selectedId) ?? null,
    [requests, selectedId]
  );

  // Sync sidebar local state when selection changes / data refreshes.
  useEffect(() => {
    if (selected) {
      setCounterDate(selected.finalDeadline ?? selected.proposedDeadline);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.finalDeadline]);

  const pending = (requests ?? []).filter((r) => r.status === "pending_review");
  const accepted = (requests ?? []).filter((r) => r.status !== "pending_review");

  // Group pending by brand.
  const pendingByBrand = useMemo(() => {
    const map: Record<string, { brandName: string; brandColor: string; items: ClientRequest[] }> = {};
    for (const r of pending) {
      if (!map[r.brandId]) map[r.brandId] = { brandName: r.brandName, brandColor: r.brandColor, items: [] };
      map[r.brandId].items.push(r);
    }
    return Object.values(map).sort((a, b) => a.brandName.localeCompare(b.brandName));
  }, [pending]);

  const assignableUsers = (allUsers ?? []).filter((u: any) => u);

  async function handleSaveCounterDate() {
    if (!selected || counterDate === undefined) return;
    setBusy(true);
    try {
      await setDeadline({ taskId: selected._id as Id<"jsrClientTasks">, finalDeadline: counterDate });
      toast("success", "Counter date saved");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save date");
    }
    setBusy(false);
  }

  async function handleTakeAction() {
    if (!selected) return;
    if (counterDate === undefined) {
      toast("error", "Set a counter completion date first");
      return;
    }
    setBusy(true);
    try {
      // Persist the committed date, then convert into a real brief task.
      await setDeadline({ taskId: selected._id as Id<"jsrClientTasks">, finalDeadline: counterDate });
      await setStatus({ taskId: selected._id as Id<"jsrClientTasks">, status: "accepted" });
      toast("success", "Task added to briefs — now assign someone");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to take action");
    }
    setBusy(false);
  }

  async function handleAssign() {
    if (!selected || !assigneeId) return;
    setBusy(true);
    try {
      await reassign({
        clientTaskId: selected._id as Id<"jsrClientTasks">,
        assigneeId: assigneeId as Id<"users">,
      });
      toast("success", "Assigned");
      setAssigneeId("");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to assign");
    }
    setBusy(false);
  }

  async function handleDecline() {
    if (!selected) return;
    setBusy(true);
    try {
      await setStatus({ taskId: selected._id as Id<"jsrClientTasks">, status: "declined" });
      toast("success", "Request declined");
      setSelectedId(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to decline");
    }
    setBusy(false);
  }

  async function handleDelete() {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteTask({ clientTaskId: selected._id as Id<"jsrClientTasks"> });
      toast("success", "Deleted");
      setSelectedId(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to delete");
    }
    setBusy(false);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Client Requests"
        subtitle="Tasks submitted by clients through brand intake links. Review, set a completion date, then take action."
      />

      {requests === undefined ? (
        <p className="text-[13px] text-[var(--text-muted)] px-1 py-8">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-3">
            <Inbox className="h-7 w-7 text-[var(--text-muted)]" />
          </div>
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)] mb-1">No client requests</h3>
          <p className="text-[13px] text-[var(--text-muted)] max-w-sm mx-auto">
            When a client submits a task through a brand intake link, it will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-8 pb-10">
          {/* PENDING REVIEW */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold text-[14px] text-[var(--text-primary)]">Awaiting Review</h2>
              <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5">
                {pending.length}
              </span>
            </div>
            {pendingByBrand.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">Nothing awaiting review. 🎉</p>
            ) : (
              <div className="space-y-5">
                {pendingByBrand.map((group) => (
                  <div key={group.brandName}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.brandColor }} />
                      <h3 className="font-semibold text-[12px] uppercase tracking-wide text-[var(--text-secondary)]">
                        {group.brandName}
                      </h3>
                      <span className="text-[11px] text-[var(--text-muted)]">{group.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {group.items.map((r) => (
                        <RequestCard key={r._id} r={r} onClick={() => setSelectedId(r._id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ACCEPTED / IN PROGRESS */}
          {accepted.length > 0 && (
            <section>
              <h2 className="font-semibold text-[14px] text-[var(--text-primary)] mb-3">Accepted &amp; In Progress</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {accepted.map((r) => (
                  <RequestCard key={r._id} r={r} onClick={() => setSelectedId(r._id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══ REVIEW SIDEBAR ═══ */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedId(null)} />
          <div className="fixed top-0 right-0 h-full w-[560px] max-w-[95vw] bg-white border-l border-[var(--border)] shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.brandColor }} />
                <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] truncate">
                  {selected.brandName}
                </span>
                <span
                  className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: (STATUS_META[selected.status] ?? STATUS_META.pending_review).color,
                    backgroundColor: (STATUS_META[selected.status] ?? STATUS_META.pending_review).bg,
                  }}
                >
                  {(STATUS_META[selected.status] ?? STATUS_META.pending_review).label}
                </span>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ overscrollBehavior: "contain" }}>
              {/* Submitted details */}
              <div>
                <h3 className="font-semibold text-[17px] text-[var(--text-primary)] leading-snug">{selected.title}</h3>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-[var(--text-muted)]">
                  {selected.clientName && <span>From {selected.clientName}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {timeAgo(selected.createdAt)}
                  </span>
                  {selected.proposedDeadline && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Requested {formatDate(selected.proposedDeadline)}
                    </span>
                  )}
                </div>
                {selected.description && (
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mt-3 whitespace-pre-wrap">
                    {selected.description}
                  </p>
                )}
              </div>

              {/* References */}
              {selected.references && selected.references.length > 0 && (
                <div className="border-t border-[var(--border-subtle)] pt-4">
                  <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-3">
                    References ({selected.references.length})
                  </h4>
                  {selected.references.some((r) => r.kind === "image") && (
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {selected.references
                        .filter((r) => r.kind === "image")
                        .map((r, i) => {
                          const url = refUrl(r);
                          return (
                            <a
                              key={`img-${i}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block h-16 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-hover)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={r.name ?? "reference"} className="w-full h-full object-cover" />
                            </a>
                          );
                        })}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {selected.references
                      .filter((r) => r.kind !== "image")
                      .map((r, i) => {
                        const url = refUrl(r);
                        return (
                          <a
                            key={`ref-${i}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] hover:border-[var(--border)] transition-colors"
                          >
                            <RefIcon kind={r.kind} />
                            <span className="truncate flex-1">{r.name || r.url}</span>
                          </a>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Counter date */}
              <div className="border-t border-[var(--border-subtle)] pt-4">
                <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                  Counter completion date
                </h4>
                <p className="text-[12px] text-[var(--text-muted)] mb-2.5">
                  Set the date we commit to. This is shown to the client and used as the task deadline.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={toDateInput(counterDate)}
                    onChange={(e) => setCounterDate(fromDateInput(e.target.value))}
                    className="flex-1 min-w-0 bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                  {selected.status === "pending_review" && (
                    <button
                      onClick={handleSaveCounterDate}
                      disabled={busy || counterDate === undefined}
                      className="shrink-0 px-3 py-2 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>

              {/* Assignment (after acceptance) */}
              {selected.status !== "pending_review" && (
                <div className="border-t border-[var(--border-subtle)] pt-4">
                  <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                    Assignment
                  </h4>
                  {selected.assigned ? (
                    <div className="flex items-center gap-2 mb-2 text-[13px] text-[var(--text-primary)]">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Assigned to <span className="font-semibold">{selected.assigneeName}</span>
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--text-muted)] mb-2">Not yet assigned to anyone.</p>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] appearance-none cursor-pointer"
                    >
                      <option value="">{selected.assigned ? "Reassign to…" : "Choose assignee…"}</option>
                      {assignableUsers.map((u: any) => (
                        <option key={u._id} value={u._id}>
                          {u.name ?? u.email} {u.role === "admin" ? "(admin)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={busy || !assigneeId}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-semibold disabled:opacity-40 transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Assign
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-[var(--border)] px-6 py-4 flex items-center gap-2">
              {selected.status === "pending_review" ? (
                <>
                  <button
                    onClick={handleTakeAction}
                    disabled={busy || counterDate === undefined}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-white text-[13px] font-semibold disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: "var(--accent-admin)" }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Take Action — Add to Briefs
                  </button>
                  <button
                    onClick={handleDecline}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-red-50 text-red-600 text-[13px] font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <Ban className="h-4 w-4" /> Decline
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-red-50 text-red-600 text-[13px] font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors ml-auto"
                >
                  <Trash2 className="h-4 w-4" /> Delete (removes brief task)
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RequestCard({ r, onClick }: { r: ClientRequest; onClick: () => void }) {
  const meta = STATUS_META[r.status] ?? STATUS_META.pending_review;
  const refCount = (r.references ?? []).length;
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl border border-[var(--border)] bg-white p-4 hover:border-[var(--border-strong)] hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium text-[13px] text-[var(--text-primary)] line-clamp-2 flex-1">{r.title}</p>
        <span
          className="shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: meta.color, backgroundColor: meta.bg }}
        >
          {meta.label}
        </span>
      </div>
      {r.description && <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mb-2">{r.description}</p>}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
        {r.clientName && <span>{r.clientName}</span>}
        {r.proposedDeadline && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDate(r.proposedDeadline)}
          </span>
        )}
        {refCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> {refCount}
          </span>
        )}
        {r.assigned && <span className="text-emerald-600 font-medium">→ {r.assigneeName}</span>}
        <span className="ml-auto">{timeAgo(r.createdAt)}</span>
      </div>
    </button>
  );
}
