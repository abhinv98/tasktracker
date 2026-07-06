"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  Calendar,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  Paperclip,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react";
import { PortalCard, REQUEST_STATUS, formatDate } from "@/components/portal/shared";
import {
  PortalButton,
  PortalPageHeader,
  PortalSkeleton,
  PortalStatusChip,
} from "@/components/portal/ui";

type RefKind = "image" | "document" | "video" | "link";
type PendingRef = {
  kind: RefKind;
  name?: string;
  url?: string;
  fileKey?: string;
  contentType?: string;
  _localName?: string;
  _uploading?: boolean;
};

function kindFromFile(file: File): RefKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

function RefIcon({ kind }: { kind: RefKind }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-[var(--p-text-2)]";
  if (kind === "image") return <ImageIcon className={cls} />;
  if (kind === "video") return <Video className={cls} />;
  if (kind === "link") return <Link2 className={cls} />;
  return <FileText className={cls} />;
}

export default function PortalNewTaskPage() {
  const params = useParams();
  const token = params.token as string;
  const session = useQuery(api.clientPortal.getPortalSession);
  const requests = useQuery(api.clientPortal.listMyRequests);
  const submitRequest = useMutation(api.clientPortal.submitTaskRequest);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [refs, setRefs] = useState<PendingRef[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const kind = kindFromFile(file);
      const placeholder: PendingRef = {
        kind,
        name: file.name,
        contentType: file.type,
        _localName: file.name,
        _uploading: true,
      };
      setRefs((prev) => [...prev, placeholder]);
      try {
        const presignRes = await fetch("/api/r2-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream" }),
        });
        const { uploadUrl, fileKey } = await presignRes.json();
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        setRefs((prev) =>
          prev.map((r) =>
            r._localName === file.name && r._uploading ? { ...r, fileKey, _uploading: false } : r
          )
        );
      } catch {
        setRefs((prev) => prev.filter((r) => !(r._localName === file.name && r._uploading)));
        setError("A file failed to upload. Please try again.");
      }
    }
  }

  function addLink() {
    const raw = linkInput.trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const isVideo = /(youtube\.com|youtu\.be|vimeo\.com|\.mp4|\.mov)/i.test(url);
    setRefs((prev) => [...prev, { kind: isVideo ? "video" : "link", url, name: raw }]);
    setLinkInput("");
  }

  const uploading = refs.some((r) => r._uploading);

  async function submit() {
    if (!title.trim() || submitting || uploading) return;
    setSubmitting(true);
    setError(null);
    try {
      const references = refs
        .filter((r) => !r._uploading)
        .map((r) => ({ kind: r.kind, name: r.name, url: r.url, fileKey: r.fileKey, contentType: r.contentType }));
      await submitRequest({
        title: title.trim(),
        description: description.trim() || undefined,
        proposedDeadline: deadline ? new Date(deadline + "T00:00:00").getTime() : undefined,
        references: references.length > 0 ? references : undefined,
      });
      setTitle("");
      setDescription("");
      setDeadline("");
      setRefs([]);
      setLinkInput("");
      setJustSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request.");
    }
    setSubmitting(false);
  }

  if (!session || requests === undefined) {
    return (
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-48" />
        <PortalSkeleton rows={4} />
      </div>
    );
  }

  const tasks = requests ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-5">
      <PortalPageHeader
        title="New task"
        description="Tell the team what you need. They review every request and confirm a timeline."
      />

      {/* Single-column form, or the post-submit success state */}
      <PortalCard className="max-w-2xl">
        {justSubmitted ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-[var(--p-radius-md)] bg-[var(--p-surface-2)] flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6 text-[var(--p-success)]" />
            </div>
            <h2 className="p-section mb-1">Request sent</h2>
            <p className="p-secondary max-w-sm mx-auto">
              The {session.brand.name} team will review and schedule this — track it under JSR.
            </p>
            <div className="flex items-center justify-center gap-2 mt-5">
              <PortalButton variant="secondary" onClick={() => setJustSubmitted(false)}>
                Send another request
              </PortalButton>
              <Link
                href={`/portal/${token}/jsr`}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[var(--p-radius-sm)] text-[12.5px] font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: "var(--p-brand)" }}
              >
                Track it under JSR
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {error && (
              <p className="text-[12.5px] font-medium text-[var(--p-danger)] bg-[var(--p-danger-soft)] rounded-[var(--p-radius-sm)] px-3 py-2">
                {error}
              </p>
            )}

            {/* What do you need */}
            <div>
              <p className="p-overline mb-1.5">What do you need</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Instagram carousel for product launch"
                className="p-input"
              />
            </div>

            {/* Details */}
            <div>
              <p className="p-overline mb-1.5">Details</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you need: tone, key messages, dimensions, anything relevant"
                rows={4}
                className="p-input resize-none"
              />
            </div>

            {/* References */}
            <div>
              <p className="p-overline mb-1.5">References</p>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void handleFiles(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center gap-1.5 px-4 py-7 rounded-[var(--p-radius-md)] border border-dashed cursor-pointer text-center ${
                  dragging
                    ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)]"
                    : "border-[var(--p-border-strong)] bg-[var(--p-surface-2)] hover:border-[var(--p-brand-border)]"
                }`}
              >
                <UploadCloud className="h-5 w-5 text-[var(--p-text-3)]" />
                <span className="p-secondary">
                  Drop files here, or <span className="font-semibold text-[var(--p-text)]">browse</span>
                </span>
                <span className="text-[11px] text-[var(--p-text-3)]">Images, documents and videos</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {refs.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {refs.map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 rounded-[var(--p-radius-sm)] bg-[var(--p-surface-2)] border border-[var(--p-border)]"
                    >
                      {r._uploading ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--p-text-3)]" />
                      ) : (
                        <RefIcon kind={r.kind} />
                      )}
                      <span className="flex-1 text-[12px] text-[var(--p-text-2)] truncate">
                        {r.name || r.url}
                        {r._uploading && <span className="text-[var(--p-text-3)]"> (uploading)</span>}
                      </span>
                      <button
                        onClick={() => setRefs((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-border)] text-[var(--p-text-3)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="Paste a link (Drive, YouTube, Figma)"
                  className="p-input flex-1"
                />
                <PortalButton variant="secondary" disabled={!linkInput.trim()} onClick={addLink}>
                  Add link
                </PortalButton>
              </div>
            </div>

            {/* Deadline */}
            <div>
              <p className="p-overline mb-1.5">Deadline</p>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="p-input"
              />
              <p className="text-[11px] text-[var(--p-text-3)] mt-1">
                Optional — the team confirms the final delivery date on review.
              </p>
            </div>

            <PortalButton
              className="w-full"
              loading={submitting}
              disabled={!title.trim() || uploading}
              onClick={() => void submit()}
            >
              {uploading ? "Uploading references" : "Send request"}
            </PortalButton>
          </div>
        )}
      </PortalCard>

      {/* Requests list */}
      <PortalCard className="max-w-2xl">
        <div className="px-5 py-3.5 border-b border-[var(--p-border)]">
          <h2 className="p-section">
            Your requests
            <span className="font-normal text-[var(--p-text-3)]"> · {tasks.length}</span>
          </h2>
        </div>
        {tasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-[var(--p-radius-md)] bg-[var(--p-surface-2)] flex items-center justify-center mx-auto mb-3">
              <Inbox className="h-6 w-6 text-[var(--p-text-3)]" />
            </div>
            <p className="p-body text-[var(--p-text-2)]">No requests yet.</p>
            <p className="p-secondary text-[var(--p-text-3)] mt-0.5">
              Submitted tasks and their status will appear here.
            </p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            {tasks.map((t: any) => {
              const meta = REQUEST_STATUS[t.status] ?? REQUEST_STATUS.pending_review;
              return (
                <div key={t._id} className="px-5 py-4 border-b border-[var(--p-border)] last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="p-body font-medium">{t.title}</p>
                      {t.description && (
                        <p className="p-secondary text-[var(--p-text-3)] mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-[var(--p-text-3)]">
                        {t.clientName && <span>By {t.clientName}</span>}
                        {t.proposedDeadline && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Requested {formatDate(t.proposedDeadline)}
                          </span>
                        )}
                        {t.referenceCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Paperclip className="h-3 w-3" /> {t.referenceCount} reference
                            {t.referenceCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <PortalStatusChip label={meta.label} dotColor={meta.dot} className="shrink-0" />
                  </div>
                  {t.status !== "pending_review" && t.finalDeadline && (
                    <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--p-text-2)] bg-[var(--p-surface-2)] rounded-[var(--p-radius-sm)] px-3 py-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--p-success)]" />
                      Confirmed completion date: {formatDate(t.finalDeadline)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PortalCard>
    </div>
  );
}
