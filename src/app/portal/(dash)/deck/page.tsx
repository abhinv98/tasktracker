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
  ThumbsUp,
  X,
} from "lucide-react";
import { PortalCard, PortalCardHeader, EmptyState, timeAgo } from "@/components/portal/shared";
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
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
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
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Presentation className="h-5 w-5" style={{ color: bc }} />
          <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Client Deck</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[13px] font-semibold"
          style={{ backgroundColor: bc }}
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? "Cancel" : "Add a document"}
        </button>
      </div>
      <p className="text-[13px] text-[#737373] -mt-1">
        Documents shared between you and the team. You can add your own files or links, comment on
        anything here, and approve items the team sends for your sign off.
      </p>

      {/* Client add form */}
      {showAdd && (
        <PortalCard>
          <div className="p-5 space-y-3">
            {addError && (
              <p className="text-[13px] text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2">{addError}</p>
            )}
            <input
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="Title, for example Brand guidelines v2"
              className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 bg-white"
              style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={addLink}
                onChange={(e) => setAddLink(e.target.value)}
                placeholder="Paste a link (Drive, Docs, Figma)"
                disabled={!!addFile}
                className="flex-1 px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 bg-white disabled:opacity-50"
                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
              />
              <label className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#e5e5e5] text-[12px] font-medium text-[#525252] hover:border-[#c4c4c4] cursor-pointer transition-colors ${addLink.trim() ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {addFile ? addFile.fileName : uploading ? "Uploading" : "Or upload a file"}
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
                <button onClick={() => setAddFile(null)} className="p-2 rounded-lg hover:bg-[#f0f0f0] text-[#a3a3a3] self-center">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <textarea
              value={addComment}
              onChange={(e) => setAddComment(e.target.value)}
              placeholder="Add a comment for the team (optional)"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 bg-white resize-none"
              style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
            />
            <button
              onClick={() => void handleAddItem()}
              disabled={!addTitle.trim() || (!addLink.trim() && !addFile) || uploading || addingItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: bc }}
            >
              {addingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Share with the team
            </button>
          </div>
        </PortalCard>
      )}

      <PortalCard>
        <PortalCardHeader
          icon={<Presentation className="h-3.5 w-3.5" />}
          title="Shared Documents"
          count={items.length}
          brandColor={bc}
        />
        {items.length === 0 ? (
          <EmptyState
            icon={<Presentation className="h-6 w-6" />}
            title="Nothing shared yet"
            hint="Decks, plans and documents from the team, and anything you add, will appear here."
          />
        ) : (
          <div>
            {items.map((item: any, i: number) => {
              const Icon = CATEGORY_ICON[item.category ?? ""] ?? FileText;
              const pending = item.requiresApproval && item.approvalStatus === "pending_client";
              return (
                <div key={item._id} className={`px-6 py-4 ${i < items.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: bc + "10" }}>
                      <Icon className="h-4 w-4" style={{ color: bc }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[14px] text-[#171717] hover:underline inline-flex items-center gap-1"
                        >
                          {item.title}
                          <ExternalLink className="h-3 w-3 text-[#a3a3a3]" />
                        </a>
                        {item.addedByClient && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f0f0f0] text-[#737373]">
                            Shared by you
                          </span>
                        )}
                        {item.category && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full capitalize" style={{ color: bc, backgroundColor: bc + "10" }}>
                            {item.category}
                          </span>
                        )}
                        {item.requiresApproval && item.approvalStatus === "client_approved" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-50">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        )}
                        {item.requiresApproval && item.approvalStatus === "client_changes_requested" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-amber-600 bg-amber-50">
                            <RotateCcw className="h-3 w-3" /> Changes requested
                          </span>
                        )}
                        {pending && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: bc }}>
                            Needs your approval
                          </span>
                        )}
                      </div>
                      {item.description && <p className="text-[12px] text-[#737373] mt-1">{item.description}</p>}
                      {item.approvalStatus === "client_changes_requested" && item.approvalNote && (
                        <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
                          Your note: {item.approvalNote}
                        </p>
                      )}
                      <p className="text-[10px] text-[#a3a3a3] mt-1.5">
                        Shared {timeAgo(item.createdAt)}
                        {item.reviewedAt ? `, reviewed ${timeAgo(item.reviewedAt)}` : ""}
                      </p>

                      {pending && (
                        <div className="mt-3">
                          {noteFor === item._id ? (
                            <div className="space-y-2">
                              <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="What should change?"
                                rows={2}
                                className="w-full px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 bg-white resize-none"
                                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void handleRequestChanges(item._id)}
                                  disabled={!note.trim() || busy !== null}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-[12px] font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                >
                                  {busy === item._id + ":changes" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                  Send request
                                </button>
                                <button
                                  onClick={() => { setNoteFor(null); setNote(""); }}
                                  className="px-3 py-2 rounded-xl text-[12px] text-[#737373] hover:bg-[#f0f0f0]"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void handleApprove(item._id)}
                                disabled={busy !== null}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-[12px] font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                              >
                                {busy === item._id + ":approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                                Approve
                              </button>
                              <button
                                onClick={() => { setNoteFor(item._id); setNote(""); }}
                                disabled={busy !== null}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#e5e5e5] text-[12px] font-semibold text-[#525252] hover:border-[#c4c4c4] disabled:opacity-50 transition-colors"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Request changes
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comment thread */}
                      {(item.remarks.length > 0 || commentFor === item._id) && (
                        <div className="mt-3 rounded-xl border border-[#f0f0f0] bg-[#fafafa] overflow-hidden">
                          {item.remarks.length > 0 && (
                            <div className="px-3 py-2 border-b border-[#f0f0f0]">
                              <RemarkThread remarks={item.remarks} brandColor={bc} />
                            </div>
                          )}
                          <div className="px-3 py-2">
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
                        <button
                          onClick={() => setCommentFor(item._id)}
                          className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium"
                          style={{ color: bc }}
                        >
                          <MessageSquare className="h-3 w-3" /> Comment
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PortalCard>
    </div>
  );
}
