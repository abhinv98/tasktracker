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
  Loader2,
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
  status:
    | "pending_review"
    | "on_hold"
    | "accepted"
    | "in_progress"
    | "completed"
    | "declined";
  acceptedDestination?: "campaign_brief" | "individual_task" | "calendar";
  heldAt?: number;
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
  viaPortal?: boolean;
};

type DestKind = "campaign" | "individual" | "calendar";

const PLATFORMS = [
  "Instagram", "Facebook", "Twitter/X", "LinkedIn", "YouTube", "TikTok", "Pinterest", "Other",
];
const CONTENT_TYPES = [
  "Post", "Reel", "Story", "Carousel", "Video", "Blog", "Newsletter", "Other",
];

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
  on_hold: { label: "On Hold", color: "#57534e", bg: "#f5f5f4" },
  accepted: { label: "Accepted", color: "#047857", bg: "#ecfdf5" },
  in_progress: { label: "In Progress", color: "#1d4ed8", bg: "#eff6ff" },
  completed: { label: "Completed", color: "#047857", bg: "#ecfdf5" },
};

const DEST_LABEL: Record<string, string> = {
  campaign_brief: "Campaign brief",
  individual_task: "Individual task",
  calendar: "Calendar",
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
  const acceptRequest = useMutation(api.jsr.acceptClientRequest);
  const holdRequest = useMutation(api.jsr.holdClientRequest);
  const resumeRequest = useMutation(api.jsr.resumeClientRequest);

  const [tab, setTab] = useState<"pending" | "held">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counterDate, setCounterDate] = useState<number | undefined>(undefined);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [taskTag, setTaskTag] = useState<string>("");
  const [busyAction, setBusyAction] = useState<
    null | "date" | "action" | "assign" | "decline" | "delete" | "hold" | "resume"
  >(null);
  const busy = busyAction !== null;

  // ── Accept destination picker state ──
  const [acceptMode, setAcceptMode] = useState(false);
  const [destKind, setDestKind] = useState<DestKind | null>(null);
  const [campaignChoice, setCampaignChoice] = useState<"existing" | "new">("new");
  const [existingBriefId, setExistingBriefId] = useState<string>("");
  const [newBriefTitle, setNewBriefTitle] = useState<string>("");
  const [newBriefDesc, setNewBriefDesc] = useState<string>("");
  const [calDate, setCalDate] = useState<string>("");
  const [calPlatform, setCalPlatform] = useState<string>(PLATFORMS[0]);
  const [calContentType, setCalContentType] = useState<string>(CONTENT_TYPES[0]);
  const [acceptAssigneeId, setAcceptAssigneeId] = useState<string>("");

  const selected = useMemo(
    () => (requests ?? []).find((r) => r._id === selectedId) ?? null,
    [requests, selectedId]
  );
  const brandTagSuggestions = useQuery(
    api.tasks.listBrandTags,
    selected ? { brandId: selected.brandId as Id<"brands"> } : "skip"
  );
  const campaignBriefs = useQuery(
    api.jsr.listCampaignBriefsForBrand,
    selected && acceptMode && destKind === "campaign"
      ? { brandId: selected.brandId as Id<"brands"> }
      : "skip"
  );

  // Sync sidebar local state when selection changes / data refreshes.
  useEffect(() => {
    if (selected) {
      setCounterDate(selected.finalDeadline ?? selected.proposedDeadline);
      setTaskTag("");
      setAcceptMode(false);
      setDestKind(null);
      setCampaignChoice("new");
      setExistingBriefId("");
      setNewBriefTitle(selected.title);
      setNewBriefDesc("");
      setCalDate("");
      setAcceptAssigneeId("");
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
  const held = (requests ?? []).filter((r) => r.status === "on_hold");
  const accepted = (requests ?? []).filter(
    (r) => r.status !== "pending_review" && r.status !== "on_hold"
  );
  const queue = tab === "pending" ? pending : held;

  // Group the active queue by brand.
  const pendingByBrand = useMemo(() => {
    const map: Record<string, { brandName: string; brandColor: string; items: ClientRequest[] }> = {};
    for (const r of queue) {
      if (!map[r.brandId]) map[r.brandId] = { brandName: r.brandName, brandColor: r.brandColor, items: [] };
      map[r.brandId].items.push(r);
    }
    return Object.values(map).sort((a, b) => a.brandName.localeCompare(b.brandName));
  }, [queue]);

  const assignableUsers = (allUsers ?? []).filter((u: any) => u);

  async function handleSaveCounterDate() {
    if (!selected || counterDate === undefined) return;
    setBusyAction("date");
    try {
      await setDeadline({ taskId: selected._id as Id<"jsrClientTasks">, finalDeadline: counterDate });
      toast("success", "Counter date saved");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save date");
    }
    setBusyAction(null);
  }

  const acceptReady =
    destKind === "calendar"
      ? !!calDate
      : destKind === "campaign"
        ? campaignChoice === "existing"
          ? !!existingBriefId
          : !!newBriefTitle.trim()
        : destKind === "individual";

  async function handleConfirmAccept() {
    if (!selected || !destKind || !acceptReady) return;
    if (destKind !== "calendar" && counterDate === undefined) {
      toast("error", "Set a counter completion date first");
      return;
    }
    setBusyAction("action");
    try {
      // Persist the committed date so the accepted task inherits it.
      if (counterDate !== undefined) {
        await setDeadline({
          taskId: selected._id as Id<"jsrClientTasks">,
          finalDeadline: counterDate,
        });
      }
      const destination =
        destKind === "calendar"
          ? {
              kind: "calendar" as const,
              postDate: calDate,
              platform: calPlatform,
              contentType: calContentType,
            }
          : destKind === "individual"
            ? { kind: "individual_task" as const }
            : campaignChoice === "existing"
              ? {
                  kind: "existing_brief" as const,
                  briefId: existingBriefId as Id<"briefs">,
                }
              : {
                  kind: "new_campaign_brief" as const,
                  title: newBriefTitle.trim(),
                  description: newBriefDesc.trim() || undefined,
                };
      await acceptRequest({
        requestId: selected._id as Id<"jsrClientTasks">,
        tag: taskTag.trim() || undefined,
        assigneeId: acceptAssigneeId
          ? (acceptAssigneeId as Id<"users">)
          : undefined,
        destination,
      });
      toast(
        "success",
        destKind === "calendar"
          ? "Accepted. Added to the content calendar"
          : destKind === "individual"
            ? "Accepted as an individual task"
            : "Accepted into the campaign brief"
      );
      setAcceptMode(false);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to accept");
    }
    setBusyAction(null);
  }

  async function handleHold() {
    if (!selected) return;
    setBusyAction("hold");
    try {
      await holdRequest({ requestId: selected._id as Id<"jsrClientTasks"> });
      toast("success", "Moved to On Hold");
      setSelectedId(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to hold");
    }
    setBusyAction(null);
  }

  async function handleResume() {
    if (!selected) return;
    setBusyAction("resume");
    try {
      await resumeRequest({ requestId: selected._id as Id<"jsrClientTasks"> });
      toast("success", "Returned to pending");
      setSelectedId(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to resume");
    }
    setBusyAction(null);
  }

  async function handleAssign() {
    if (!selected || !assigneeId) return;
    setBusyAction("assign");
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
    setBusyAction(null);
  }

  async function handleDecline() {
    if (!selected) return;
    setBusyAction("decline");
    try {
      await setStatus({ taskId: selected._id as Id<"jsrClientTasks">, status: "declined" });
      toast("success", "Request declined");
      setSelectedId(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to decline");
    }
    setBusyAction(null);
  }

  async function handleDelete() {
    if (!selected) return;
    setBusyAction("delete");
    try {
      await deleteTask({ clientTaskId: selected._id as Id<"jsrClientTasks"> });
      toast("success", "Deleted");
      setSelectedId(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to delete");
    }
    setBusyAction(null);
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
          {/* PENDING / ON HOLD QUEUE */}
          <section>
            <div className="flex items-center gap-1.5 mb-4">
              <button
                onClick={() => setTab("pending")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  tab === "pending"
                    ? "bg-[var(--text-primary)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                Awaiting Review
                <span
                  className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    tab === "pending" ? "bg-white/25 text-white" : "bg-amber-500 text-white"
                  }`}
                >
                  {pending.length}
                </span>
              </button>
              <button
                onClick={() => setTab("held")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  tab === "held"
                    ? "bg-[var(--text-primary)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                On Hold
                <span
                  className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    tab === "held"
                      ? "bg-white/25 text-white"
                      : "bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  }`}
                >
                  {held.length}
                </span>
              </button>
            </div>
            {pendingByBrand.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                {tab === "pending"
                  ? "Nothing awaiting review. 🎉"
                  : "Nothing on hold. Requests you park with “Hold for later” appear here."}
              </p>
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
                  {selected.clientName && (
                    <span>
                      From {selected.clientName}
                      {selected.viaPortal && <span className="text-[var(--accent-admin)] font-medium"> · via Portal</span>}
                    </span>
                  )}
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
                  {(selected.status === "pending_review" || selected.status === "on_hold") && (
                    <button
                      onClick={handleSaveCounterDate}
                      disabled={busy || counterDate === undefined}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      {busyAction === "date" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save
                    </button>
                  )}
                </div>
              </div>

              {/* Category tag (applied to the created task on accept) */}
              {(selected.status === "pending_review" || selected.status === "on_hold") && (
                <div className="border-t border-[var(--border-subtle)] pt-4">
                  <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                    Category Tag
                  </h4>
                  <input
                    value={taskTag}
                    onChange={(e) => setTaskTag(e.target.value)}
                    list="client-request-tags"
                    placeholder="e.g. Social, Blog, Design (optional)"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                  <datalist id="client-request-tags">
                    {(brandTagSuggestions ?? []).map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                    The tag is applied to the task when you accept, and lets the client filter their portal view by category.
                  </p>
                </div>
              )}

              {/* Destination picker (accept flow) */}
              {acceptMode &&
                (selected.status === "pending_review" || selected.status === "on_hold") && (
                  <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                      Where should this task go?
                    </h4>
                    <div className="space-y-2">
                      {(
                        [
                          {
                            kind: "campaign" as const,
                            title: "Campaign Brief",
                            hint: "Part of a bigger campaign: new brief or an existing one",
                          },
                          {
                            kind: "individual" as const,
                            title: "Individual Task",
                            hint: "A standalone one-off task with its own brief",
                          },
                          {
                            kind: "calendar" as const,
                            title: "Calendar Task",
                            hint: "A content-calendar entry on a specific date",
                          },
                        ]
                      ).map((opt) => (
                        <button
                          key={opt.kind}
                          onClick={() => setDestKind(opt.kind)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors ${
                            destKind === opt.kind
                              ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]"
                              : "border-[var(--border)] hover:border-[var(--border-strong)]"
                          }`}
                        >
                          <span className="block text-[13px] font-semibold text-[var(--text-primary)]">
                            {opt.title}
                          </span>
                          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                            {opt.hint}
                          </span>
                        </button>
                      ))}
                    </div>

                    {destKind === "campaign" && (
                      <div className="mt-3 space-y-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCampaignChoice("new")}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                              campaignChoice === "new"
                                ? "border-[var(--accent-admin)] text-[var(--accent-admin)] bg-[var(--accent-admin-dim)]"
                                : "border-[var(--border)] text-[var(--text-secondary)]"
                            }`}
                          >
                            Create new brief
                          </button>
                          <button
                            onClick={() => setCampaignChoice("existing")}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                              campaignChoice === "existing"
                                ? "border-[var(--accent-admin)] text-[var(--accent-admin)] bg-[var(--accent-admin-dim)]"
                                : "border-[var(--border)] text-[var(--text-secondary)]"
                            }`}
                          >
                            Add to existing
                          </button>
                        </div>
                        {campaignChoice === "new" ? (
                          <>
                            <input
                              value={newBriefTitle}
                              onChange={(e) => setNewBriefTitle(e.target.value)}
                              placeholder="Campaign brief title"
                              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                            />
                            <textarea
                              value={newBriefDesc}
                              onChange={(e) => setNewBriefDesc(e.target.value)}
                              placeholder="Brief description (optional)"
                              rows={2}
                              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-none"
                            />
                          </>
                        ) : (
                          <select
                            value={existingBriefId}
                            onChange={(e) => setExistingBriefId(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] appearance-none cursor-pointer"
                          >
                            <option value="">
                              {campaignBriefs === undefined
                                ? "Loading briefs…"
                                : campaignBriefs.length === 0
                                  ? "No campaign briefs for this brand yet"
                                  : "Choose a campaign brief…"}
                            </option>
                            {(campaignBriefs ?? []).map((b: any) => (
                              <option key={b._id} value={b._id}>
                                {b.title}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {destKind === "calendar" && (
                      <div className="mt-3 space-y-2.5">
                        <input
                          type="date"
                          value={calDate}
                          onChange={(e) => setCalDate(e.target.value)}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={calPlatform}
                            onChange={(e) => setCalPlatform(e.target.value)}
                            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] appearance-none cursor-pointer"
                          >
                            {PLATFORMS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          <select
                            value={calContentType}
                            onChange={(e) => setCalContentType(e.target.value)}
                            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] appearance-none cursor-pointer"
                          >
                            {CONTENT_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        {!calDate && (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Pick the post date. The entry lands on that day of the calendar.
                          </p>
                        )}
                      </div>
                    )}

                    {destKind && (
                      <div className="mt-3">
                        <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                          Assign to (optional)
                        </h4>
                        <select
                          value={acceptAssigneeId}
                          onChange={(e) => setAcceptAssigneeId(e.target.value)}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] appearance-none cursor-pointer"
                        >
                          <option value="">Decide later</option>
                          {assignableUsers.map((u: any) => (
                            <option key={u._id} value={u._id}>
                              {u.name ?? u.email} {u.role === "admin" ? "(admin)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

              {/* Assignment (after acceptance) */}
              {selected.status !== "pending_review" && selected.status !== "on_hold" && (
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
                      {busyAction === "assign" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      {busyAction === "assign" ? "Assigning…" : "Assign"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-[var(--border)] px-6 py-4 flex items-center gap-2">
              {selected.status === "pending_review" || selected.status === "on_hold" ? (
                acceptMode ? (
                  <>
                    <button
                      onClick={() => {
                        setAcceptMode(false);
                        setDestKind(null);
                      }}
                      disabled={busy}
                      className="flex items-center justify-center px-4 py-2.5 rounded-md border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleConfirmAccept}
                      disabled={busy || !destKind || !acceptReady}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-white text-[13px] font-semibold disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "var(--accent-admin)" }}
                    >
                      {busyAction === "action" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {busyAction === "action"
                        ? "Accepting…"
                        : !destKind
                          ? "Choose a destination"
                          : "Confirm Accept"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setAcceptMode(true)}
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-white text-[13px] font-semibold disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "var(--accent-admin)" }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Accept…
                    </button>
                    {selected.status === "pending_review" ? (
                      <button
                        onClick={handleHold}
                        disabled={busy}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border border-[var(--border)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
                      >
                        {busyAction === "hold" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                        Hold
                      </button>
                    ) : (
                      <button
                        onClick={handleResume}
                        disabled={busy}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border border-[var(--border)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
                      >
                        {busyAction === "resume" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Inbox className="h-4 w-4" />
                        )}
                        To Pending
                      </button>
                    )}
                    <button
                      onClick={handleDecline}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-red-50 text-red-600 text-[13px] font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      {busyAction === "decline" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      Decline
                    </button>
                  </>
                )
              ) : (
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-red-50 text-red-600 text-[13px] font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors ml-auto"
                >
                  {busyAction === "delete" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {busyAction === "delete" ? "Deleting…" : "Delete (removes brief task)"}
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
        {r.clientName && (
          <span>
            {r.clientName}
            {r.viaPortal && <span className="text-[var(--accent-admin)] font-medium"> · via Portal</span>}
          </span>
        )}
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
        {r.acceptedDestination && (
          <span className="font-medium">{DEST_LABEL[r.acceptedDestination]}</span>
        )}
        <span className="ml-auto">
          {r.status === "on_hold" && r.heldAt ? `Held ${timeAgo(r.heldAt)}` : timeAgo(r.createdAt)}
        </span>
      </div>
    </button>
  );
}
