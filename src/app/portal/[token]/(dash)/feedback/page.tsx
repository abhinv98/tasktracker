"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, MessageSquareText, Presentation, RotateCcw } from "lucide-react";
import { PortalCard, PortalCardHeader, EmptyState, timeAgo } from "@/components/portal/shared";
import { PortalButton, PortalPageHeader, PortalSkeleton } from "@/components/portal/ui";

const KIND_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  feedback: { label: "Feedback", icon: MessageSquareText },
  remark: { label: "Comment", icon: MessageSquareText },
  deliverable_changes: { label: "Change request", icon: RotateCcw },
  deck_changes: { label: "Document changes", icon: Presentation },
};

export default function PortalFeedbackPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const log = useQuery(api.clientPortal.getFeedbackLog);
  const submitFeedback = useMutation(api.clientPortal.submitFeedback);

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  if (!session || log === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-48" />
        <PortalSkeleton rows={4} />
      </div>
    );
  }
  if (!log) return null;

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitFeedback({ content: content.trim() });
      setContent("");
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch {}
    setSubmitting(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-5">
      <PortalPageHeader
        title="Feedback log"
        description="A history of your feedback: comments, change requests and general notes to the team."
      />

      {/* Compose */}
      <PortalCard>
        <div className="p-5">
          {justSubmitted && (
            <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--p-success)] bg-[var(--p-surface-2)] rounded-[var(--p-radius-sm)] px-3 py-2 mb-3">
              <CheckCircle2 className="h-3.5 w-3.5" /> Feedback sent. The team has been notified.
            </p>
          )}
          <div className="flex items-start gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share feedback with the Ecultify team"
              rows={2}
              className="p-input flex-1 resize-none"
            />
            <PortalButton
              loading={submitting}
              disabled={!content.trim()}
              onClick={() => void submit()}
              className="shrink-0"
            >
              Send feedback
            </PortalButton>
          </div>
        </div>
      </PortalCard>

      {/* History timeline */}
      <PortalCard>
        <PortalCardHeader
          icon={<MessageSquareText className="h-3.5 w-3.5" />}
          title="History"
          count={log.length}
        />
        {log.length === 0 ? (
          <EmptyState
            icon={<MessageSquareText className="h-6 w-6" />}
            title="No feedback yet"
            hint="Your comments, change requests and notes will be collected here."
          />
        ) : (
          <div>
            {log.map((entry: any, i: number) => {
              const meta = KIND_META[entry.kind] ?? KIND_META.feedback;
              const Icon = meta.icon;
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-4 border-b border-[var(--p-border)] last:border-b-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--p-surface-2)]">
                    <Icon className="h-4 w-4 text-[var(--p-text-2)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="p-overline">{meta.label}</span>
                      <span className="text-[11px] text-[var(--p-text-3)]">{entry.context}</span>
                    </div>
                    <p className="p-body mt-1">{entry.content}</p>
                    <p className="text-[11px] text-[var(--p-text-3)] mt-1">
                      {entry.authorName} · {timeAgo(entry.createdAt)}
                    </p>
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
