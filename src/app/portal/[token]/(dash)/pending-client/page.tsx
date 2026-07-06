"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  Presentation,
  X,
} from "lucide-react";
import { PortalCard, PortalCardHeader, EmptyState, timeAgo } from "@/components/portal/shared";
import {
  PortalButton,
  PortalPageHeader,
  PortalSkeleton,
} from "@/components/portal/ui";

export default function PortalPendingClientPage() {
  const params = useParams();
  const token = params.token as string;
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
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-56" />
        <PortalSkeleton rows={4} />
      </div>
    );
  }
  if (!pending) return null;

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
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-5">
      <PortalPageHeader
        title="Your pending work"
        description="Everything waiting on you: approvals, input requests and documents."
      />

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
            title="Ready for review"
            count={pending.pendingDeliverables.length}
          />
          <div>
            {pending.pendingDeliverables.map((item: any) => (
              <div
                key={item.deliverableId}
                className="flex items-center gap-3 px-5 py-3 border-b border-[var(--p-border)] last:border-b-0 hover:bg-[var(--p-surface-2)]"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--p-surface-2)]">
                  <FileDown className="h-4 w-4 text-[var(--p-text-2)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="p-body font-medium truncate">{item.taskTitle}</p>
                  <p className="text-[11px] text-[var(--p-text-3)] truncate mt-0.5">
                    {item.briefTitle}
                    {item.sentToClientAt ? ` · Sent ${timeAgo(item.sentToClientAt)}` : ""}
                  </p>
                </div>
                <PortalButton
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => {
                    setReviewItem(item);
                    setReviewNote("");
                    setNeedsNote(null);
                  }}
                >
                  Review &amp; respond
                </PortalButton>
              </div>
            ))}
          </div>
        </PortalCard>
      )}

      {/* Input requests */}
      {pending.inputRequests.length > 0 && (
        <PortalCard>
          <PortalCardHeader
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            title="The team needs your input"
            count={pending.inputRequests.length}
          />
          <div>
            {pending.inputRequests.map((req: any) => (
              <div key={req._id} className="px-5 py-4 border-b border-[var(--p-border)] last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="p-body font-medium truncate">{req.title}</p>
                    <p className="text-[11px] text-[var(--p-text-3)] truncate mt-0.5">{req.briefTitle}</p>
                  </div>
                  <Link
                    href={`/portal/${token}/messages`}
                    className="shrink-0 inline-flex items-center h-8 px-3 rounded-[var(--p-radius-sm)] border border-[var(--p-border-strong)] bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-text)] hover:bg-[var(--p-surface-2)]"
                  >
                    Reply in messages
                  </Link>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-[var(--p-radius-sm)] bg-[var(--p-surface-2)] mt-2">
                  <AlertCircle className="h-3.5 w-3.5 text-[var(--p-warning)] shrink-0 mt-0.5" />
                  <p className="p-secondary">{req.clientInputMessage}</p>
                </div>
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
            title="Documents awaiting approval"
            count={pending.pendingDeck.length}
          />
          <div>
            {pending.pendingDeck.map((item: any) => (
              <div
                key={item._id}
                className="flex items-center gap-3 px-5 py-3 border-b border-[var(--p-border)] last:border-b-0 hover:bg-[var(--p-surface-2)]"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--p-surface-2)]">
                  <Presentation className="h-4 w-4 text-[var(--p-text-2)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="p-body font-medium truncate">{item.title}</p>
                  {item.category && (
                    <p className="text-[11px] text-[var(--p-text-3)] capitalize mt-0.5">{item.category}</p>
                  )}
                </div>
                <Link
                  href={`/portal/${token}/deck`}
                  className="shrink-0 inline-flex items-center h-8 px-3 rounded-[var(--p-radius-sm)] text-[12px] font-semibold text-white hover:opacity-90"
                  style={{ backgroundColor: "var(--p-brand)" }}
                >
                  Review &amp; approve
                </Link>
              </div>
            ))}
          </div>
        </PortalCard>
      )}

      {/* Review sidebar */}
      {reviewItem && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setReviewItem(null)} />
          <div
            className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-[var(--p-surface)] border-l border-[var(--p-border)] z-50 flex flex-col"
            style={{ boxShadow: "var(--p-shadow)" }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--p-border)]">
              <h3 className="p-section">Review deliverable</h3>
              <button
                onClick={() => setReviewItem(null)}
                className="p-1.5 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)] text-[var(--p-text-3)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ overscrollBehavior: "contain" }}>
              <div>
                <h4 className="p-body font-semibold mb-1">{reviewItem.taskTitle}</h4>
                <p className="text-[12px] text-[var(--p-text-3)] mb-2">{reviewItem.briefTitle}</p>
                {reviewItem.taskDescription && (
                  <p className="p-secondary leading-relaxed">{reviewItem.taskDescription}</p>
                )}
              </div>
              <div className="border-t border-[var(--p-border)] pt-4">
                <h5 className="p-overline mb-3">Deliverable</h5>
                {reviewItem.message && <p className="p-body text-[var(--p-text-2)] mb-3">{reviewItem.message}</p>}
                {reviewItem.link && (
                  <a
                    href={reviewItem.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium text-[var(--p-text)] underline decoration-[var(--p-border-strong)] hover:decoration-[var(--p-text)] block mb-3 break-all"
                  >
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
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--p-radius-sm)] bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[12px] font-medium text-[var(--p-text-2)] hover:border-[var(--p-border-strong)]"
                      >
                        <FileDown className="h-3.5 w-3.5 text-[var(--p-text-3)]" />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}
                {reviewItem.sentToClientAt && (
                  <p className="text-[11px] text-[var(--p-text-3)] mt-3">
                    Sent {timeAgo(reviewItem.sentToClientAt)}
                  </p>
                )}
              </div>
              <div className="border-t border-[var(--p-border)] pt-4">
                <h5 className="p-overline mb-3">Your response</h5>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a note (required to request changes or deny)"
                  rows={3}
                  className="p-input resize-none"
                />
                {needsNote && !reviewNote.trim() && (
                  <p className="text-[12px] font-medium text-[var(--p-danger)] mt-2">
                    Add a note before {needsNote === "changes" ? "requesting changes" : "denying"}.
                  </p>
                )}
              </div>
            </div>
            <div className="border-t border-[var(--p-border)] px-6 py-4 flex items-center gap-2">
              <PortalButton
                className="flex-1"
                loading={submitting}
                onClick={() => void act("approve")}
              >
                Approve
              </PortalButton>
              <PortalButton
                variant="secondary"
                className="flex-1"
                disabled={submitting}
                onClick={() => void act("changes")}
              >
                Request changes
              </PortalButton>
              <PortalButton
                variant="danger"
                className="flex-1"
                disabled={submitting}
                onClick={() => void act("deny")}
              >
                Deny
              </PortalButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
