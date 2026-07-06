"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  FileText,
  GanttChartSquare,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Presentation,
  RotateCcw,
  X,
} from "lucide-react";
import { PortalCard, EmptyState, timeAgo, formatDate } from "@/components/portal/shared";
import {
  PortalButton,
  PortalPageHeader,
  PortalSkeleton,
  PortalStatusChip,
} from "@/components/portal/ui";
import { RemarkComposer, RemarkThread } from "@/components/portal/DeliverableCard";

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  deck: Presentation,
  gantt: GanttChartSquare,
  doc: FileText,
};

export default function PortalDeckPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const items = useQuery(api.clientPortal.getDeckItems);
  const approve = useMutation(api.clientPortal.approveDeckItem);
  const requestChanges = useMutation(api.clientPortal.requestDeckChanges);
  const addClientDeckItem = useMutation(api.clientPortal.addClientDeckItem);
  const addDeckRemark = useMutation(api.clientPortal.addDeckRemark);

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);

  // Client "add document" form
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addLink, setAddLink] = useState("");
  const [addComment, setAddComment] = useState("");
  const [addFile, setAddFile] = useState<{ fileKey: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  if (!session || items === undefined) {
    return (
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-48" />
        <PortalSkeleton rows={4} variant="cards" />
      </div>
    );
  }

  const bc = session.brand.color;

  async function handleApprove(id: string) {
    setBusy(id + ":approve");
    try {
      await approve({ deckItemId: id as Id<"clientDeckItems"> });
    } catch {}
    setBusy(null);
  }

  async function handleRequestChanges(id: string) {
    if (!note.trim()) return;
    setBusy(id + ":changes");
    try {
      await requestChanges({ deckItemId: id as Id<"clientDeckItems">, note: note.trim() });
      setNoteFor(null);
      setNote("");
    } catch {}
    setBusy(null);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setAddError(null);
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
      setAddFile({ fileKey, fileName: file.name });
      if (!addTitle.trim()) setAddTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setAddError("The file failed to upload. Please try again.");
    }
    setUploading(false);
  }

  async function handleAddItem() {
    if (!addTitle.trim() || (!addLink.trim() && !addFile) || addingItem) return;
    setAddingItem(true);
    setAddError(null);
    try {
      const url = addLink.trim()
        ? /^https?:\/\//i.test(addLink.trim())
          ? addLink.trim()
          : `https://${addLink.trim()}`
        : undefined;
      await addClientDeckItem({
        title: addTitle.trim(),
        url,
        fileKey: addFile?.fileKey,
        fileName: addFile?.fileName,
        comment: addComment.trim() || undefined,
      });
      setAddTitle("");
      setAddLink("");
      setAddComment("");
      setAddFile(null);
      setShowAdd(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add the document.");
    }
    setAddingItem(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-5">
      <PortalPageHeader
        title="Client deck"
        count={items.length}
        description="Documents shared between you and the team. Add your own, comment, and approve items sent for sign off."
        action={
          <PortalButton variant={showAdd ? "secondary" : "primary"} onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAdd ? "Cancel" : "Add a document"}
          </PortalButton>
        }
      />

      {/* Client add form */}
      {showAdd && (
        <PortalCard>
          <div className="p-5 space-y-3">
            {addError && (
              <p className="text-[12.5px] font-medium text-[var(--p-danger)] bg-[var(--p-danger-soft)] rounded-[var(--p-radius-sm)] px-3 py-2">
                {addError}
              </p>
            )}
            <div>
              <label className="p-overline block mb-1.5">Title</label>
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="For example, Brand guidelines v2"
                className="p-input"
              />
            </div>
            <div>
              <label className="p-overline block mb-1.5">Link or file</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={addLink}
                  onChange={(e) => setAddLink(e.target.value)}
                  placeholder="Paste a link (Drive, Docs, Figma)"
                  disabled={!!addFile}
                  className="p-input flex-1 disabled:opacity-50"
                />
                <label
                  className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[var(--p-radius-sm)] border border-[var(--p-border-strong)] bg-[var(--p-surface)] text-[12.5px] font-semibold text-[var(--p-text)] hover:bg-[var(--p-surface-2)] cursor-pointer ${
                    addLink.trim() ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  {addFile ? addFile.fileName : uploading ? "Uploading" : "Upload a file"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {addFile && (
                  <button
                    onClick={() => setAddFile(null)}
                    className="p-2 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)] text-[var(--p-text-3)] self-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="p-overline block mb-1.5">Comment</label>
              <textarea
                value={addComment}
                onChange={(e) => setAddComment(e.target.value)}
                placeholder="Add a comment for the team (optional)"
                rows={2}
                className="p-input resize-none"
              />
            </div>
            <PortalButton
              className="w-full"
              loading={addingItem}
              disabled={!addTitle.trim() || (!addLink.trim() && !addFile) || uploading}
              onClick={() => void handleAddItem()}
            >
              Share with the team
            </PortalButton>
          </div>
        </PortalCard>
      )}

      {items.length === 0 ? (
        <PortalCard>
          <EmptyState
            icon={<Presentation className="h-6 w-6" />}
            title="Nothing shared yet"
            hint="Decks, plans and documents from the team, and anything you add, will appear here."
          />
        </PortalCard>
      ) : (
        /* Thumbnail grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {items.map((item: any) => {
            const Icon = CATEGORY_ICON[item.category ?? ""] ?? FileText;
            const pending = item.requiresApproval && item.approvalStatus === "pending_client";
            return (
              <PortalCard key={item._id}>
                {/* 16:9 preview */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block aspect-video bg-[var(--p-surface-2)] border-b border-[var(--p-border)]"
                >
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Icon className="h-8 w-8 text-[var(--p-text-3)]" />
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center bg-[var(--p-surface-2)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--p-text)]">
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </a>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-body font-medium hover:underline min-w-0 truncate"
                    >
                      {item.title}
                    </a>
                    {pending ? (
                      <PortalStatusChip label="Needs your approval" dotColor="var(--p-warning)" className="shrink-0" />
                    ) : item.requiresApproval && item.approvalStatus === "client_approved" ? (
                      <PortalStatusChip label="Approved" dotColor="var(--p-success)" className="shrink-0" />
                    ) : item.requiresApproval && item.approvalStatus === "client_changes_requested" ? (
                      <PortalStatusChip label="Changes requested" dotColor="var(--p-warning)" className="shrink-0" />
                    ) : null}
                  </div>
                  <p className="text-[11px] text-[var(--p-text-3)] mt-1">
                    {formatDate(item.createdAt)}
                    {item.category ? ` · ${item.category}` : ""}
                    {item.addedByClient ? " · Shared by you" : ""}
                    {item.reviewedAt ? ` · Reviewed ${timeAgo(item.reviewedAt)}` : ""}
                  </p>
                  {item.description && <p className="p-secondary mt-1.5">{item.description}</p>}
                  {item.approvalStatus === "client_changes_requested" && item.approvalNote && (
                    <p className="p-secondary bg-[var(--p-surface-2)] rounded-[var(--p-radius-sm)] px-3 py-2 mt-2">
                      Your note: {item.approvalNote}
                    </p>
                  )}

                  {pending && (
                    <div className="mt-3">
                      {noteFor === item._id ? (
                        <div className="space-y-2">
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What should change?"
                            rows={2}
                            className="p-input resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <PortalButton
                              size="sm"
                              variant="secondary"
                              loading={busy === item._id + ":changes"}
                              disabled={!note.trim() || busy !== null}
                              onClick={() => void handleRequestChanges(item._id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Send request
                            </PortalButton>
                            <PortalButton
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setNoteFor(null);
                                setNote("");
                              }}
                            >
                              Cancel
                            </PortalButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <PortalButton
                            size="sm"
                            loading={busy === item._id + ":approve"}
                            disabled={busy !== null}
                            onClick={() => void handleApprove(item._id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </PortalButton>
                          <PortalButton
                            size="sm"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => {
                              setNoteFor(item._id);
                              setNote("");
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" /> Request changes
                          </PortalButton>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comment thread */}
                  {(item.remarks.length > 0 || commentFor === item._id) && (
                    <div className="mt-3 rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] overflow-hidden">
                      {item.remarks.length > 0 && (
                        <div className="px-3 py-2 border-b border-[var(--p-border)]">
                          <RemarkThread remarks={item.remarks} brandColor={bc} />
                        </div>
                      )}
                      <div className="px-3 py-2 bg-[var(--p-surface)]">
                        <RemarkComposer
                          brandColor={bc}
                          placeholder="Write a comment"
                          onSubmit={async (content) => {
                            await addDeckRemark({ deckItemId: item._id as Id<"clientDeckItems">, content });
                            setCommentFor(null);
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {item.remarks.length === 0 && commentFor !== item._id && (
                    <PortalButton
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setCommentFor(item._id)}
                    >
                      <MessageSquare className="h-3 w-3" /> Comment
                    </PortalButton>
                  )}
                </div>
              </PortalCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
