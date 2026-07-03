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
  Presentation,
  RotateCcw,
  ThumbsUp,
} from "lucide-react";
import { PortalCard, PortalCardHeader, EmptyState, timeAgo } from "@/components/portal/shared";

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

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Presentation className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Client Deck</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">
        Documents, decks and plans shared by the team. Items marked for approval need your review.
      </p>

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
            hint="Decks, gantt charts and documents the team shares will appear here."
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
                        {item.reviewedAt ? ` · Reviewed ${timeAgo(item.reviewedAt)}` : ""}
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
