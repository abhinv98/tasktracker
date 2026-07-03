"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  FileDown,
  Inbox,
  Presentation,
  RotateCcw,
  ThumbsUp,
  X,
} from "lucide-react";
import { PortalCard, PortalCardHeader, EmptyState, timeAgo } from "@/components/portal/shared";

export default function PortalPendingClientPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const pending = useQuery(api.clientPortal.getClientPendingWork);
  const approveMut = useMutation(api.clientPortal.approveDeliverable);
  const changesMut = useMutation(api.clientPortal.requestChanges);
  const denyMut = useMutation(api.clientPortal.denyDeliverable);

  const [reviewItem, setReviewItem] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [needsNote, setNeedsNote] = useState<"changes" | "deny" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.style.overflow = reviewItem ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [reviewItem]);

  if (!session || pending === undefined) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!pending) return null;

  const bc = session.brand.color;
  const isEmpty =
    pending.pendingDeliverables.length === 0 &&
    pending.inputRequests.length === 0 &&
    pending.pendingDeck.length === 0;

  async function act(action: "approve" | "changes" | "deny") {
    if (!reviewItem || submitting) return;
    if ((action === "changes" || action === "deny") && !reviewNote.trim()) {
      setNeedsNote(action);
      return;
    }
    setSubmitting(true);
    try {
      const deliverableId = reviewItem.deliverableId as Id<"deliverables">;
      if (action === "approve") {
        await approveMut({ deliverableId, note: reviewNote.trim() || undefined });
      } else if (action === "changes") {
        await changesMut({ deliverableId, note: reviewNote.trim() });
      } else {
        await denyMut({ deliverableId, note: reviewNote.trim() });
      }
      setReviewItem(null);
      setReviewNote("");
      setNeedsNote(null);
    } catch {}
    setSubmitting(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Inbox className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Your Pending Work</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">Everything waiting on you: approvals, input requests and documents.</p>

      {isEmpty && (
        <PortalCard>
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="You're all caught up"
            hint="Deliverables to approve and requests for your input will appear here."
          />
        </PortalCard>
      )}

      {/* Deliverables ready for review */}
      {pending.pendingDeliverables.length > 0 && (
        <PortalCard>
          <PortalCardHeader
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            title="Ready for Review"
            count={pending.pendingDeliverables.length}
            brandColor={bc}
          />
          <div>
            {pending.pendingDeliverables.map((item: any, i: number) => (
              <button
                key={item.deliverableId}
                onClick={() => {
                  setReviewItem(item);
                  setReviewNote("");
                  setNeedsNote(null);
                }}
                className={`flex items-center gap-3 w-full text-left px-6 py-3.5 hover:bg-[#fafafa] transition-colors ${i < pending.pendingDeliverables.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: bc + "12" }}>
                  <FileDown className="h-4 w-4" style={{ color: bc }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] text-[#171717] truncate">{item.taskTitle}</p>
                  <p className="text-[10px] text-[#a3a3a3]">{item.briefTitle}</p>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ color: bc, backgroundColor: bc + "10" }}>
                  Review
                </span>
              </button>
            ))}
          </div>
        </PortalCard>
      )}

      {/* Input requests */}
      {pending.inputRequests.length > 0 && (
        <PortalCard>
          <PortalCardHeader
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            title="Ecultify Needs Your Input"
            count={pending.inputRequests.length}
            brandColor={bc}
          />
          <div>
            {pending.inputRequests.map((req: any, i: number) => (
              <div key={req._id} className={`px-6 py-4 ${i < pending.inputRequests.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="font-medium text-[13px] text-[#171717]">{req.title}</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-orange-600 bg-orange-50">{req.briefTitle}</span>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50/60 border border-orange-100">
                  <AlertCircle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[#525252] leading-relaxed">{req.clientInputMessage}</p>
                </div>
                <p className="text-[11px] text-[#a3a3a3] mt-2">
                  Reply via the Messages thread on <Link href="/portal/jsr" className="underline" style={{ color: bc }}>JSR Track</Link>.
                </p>
              </div>
            ))}
          </div>
        </PortalCard>
      )}

      {/* Deck approvals */}
      {pending.pendingDeck.length > 0 && (
        <PortalCard>
          <PortalCardHeader
            icon={<Presentation className="h-3.5 w-3.5" />}
            title="Documents Awaiting Approval"
            count={pending.pendingDeck.length}
            brandColor={bc}
          />
          <div>
            {pending.pendingDeck.map((item: any, i: number) => (
              <Link
                key={item._id}
                href="/portal/deck"
                className={`flex items-center gap-3 px-6 py-3.5 hover:bg-[#fafafa] transition-colors ${i < pending.pendingDeck.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: bc + "12" }}>
                  <Presentation className="h-4 w-4" style={{ color: bc }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] text-[#171717] truncate">{item.title}</p>
                  {item.category && <p className="text-[10px] text-[#a3a3a3] capitalize">{item.category}</p>}
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 text-white" style={{ backgroundColor: bc }}>
                  Approve
                </span>
              </Link>
            ))}
          </div>
        </PortalCard>
      )}

      {/* Review sidebar */}
      {reviewItem && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setReviewItem(null)} />
          <div className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-white border-l border-[#e5e5e5] shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5]">
              <h3 className="font-semibold text-[16px] text-[#171717]">Review Deliverable</h3>
              <button onClick={() => setReviewItem(null)} className="p-1.5 rounded-lg hover:bg-[#f0f0f0] text-[#a3a3a3]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ overscrollBehavior: "contain" }}>
              <div>
                <h4 className="font-semibold text-[14px] text-[#171717] mb-1">{reviewItem.taskTitle}</h4>
                <p className="text-[12px] text-[#a3a3a3] mb-2">{reviewItem.briefTitle}</p>
                {reviewItem.taskDescription && (
                  <p className="text-[13px] text-[#525252] leading-relaxed">{reviewItem.taskDescription}</p>
                )}
              </div>
              <div className="border-t border-[#f0f0f0] pt-4">
                <h5 className="font-medium text-[13px] text-[#171717] mb-3">Deliverable</h5>
                {reviewItem.message && <p className="text-[13px] text-[#525252] mb-3 leading-relaxed">{reviewItem.message}</p>}
                {reviewItem.link && (
                  <a href={reviewItem.link} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium underline block mb-3 break-all" style={{ color: bc }}>
                    {reviewItem.link}
                  </a>
                )}
                {reviewItem.files && reviewItem.files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {reviewItem.files.map((f: any, idx: number) => (
                      <a
                        key={idx}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#fafafa] border border-[#e5e5e5] text-[12px] font-medium text-[#525252] hover:border-[#c4c4c4] transition-colors"
                      >
                        <FileDown className="h-3.5 w-3.5 text-[#a3a3a3]" />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}
                {reviewItem.sentToClientAt && (
                  <p className="text-[10px] text-[#a3a3a3] mt-3">Sent {timeAgo(reviewItem.sentToClientAt)}</p>
                )}
              </div>
              <div className="border-t border-[#f0f0f0] pt-4">
                <h5 className="font-medium text-[13px] text-[#171717] mb-3">Your Response</h5>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a note (required for Request Changes and Deny)..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 bg-white resize-none"
                  style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
                />
              </div>
            </div>
            <div className="border-t border-[#e5e5e5] px-6 py-4 flex items-center gap-2">
              <button
                onClick={() => void act("approve")}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500 text-white text-[13px] font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                onClick={() => void act("changes")}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-amber-500 text-white text-[13px] font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Request Changes
              </button>
              <button
                onClick={() => void act("deny")}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" /> Deny
              </button>
            </div>
            {needsNote && !reviewNote.trim() && (
              <div className="px-6 pb-3">
                <p className="text-[12px] text-red-500 font-medium">
                  Please add a note before {needsNote === "changes" ? "requesting changes" : "denying"}.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
