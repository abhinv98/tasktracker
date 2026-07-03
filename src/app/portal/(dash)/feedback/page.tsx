"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  Ban,
  Loader2,
  MessageSquareText,
  Presentation,
  RotateCcw,
  Send,
} from "lucide-react";
import { PortalCard, PortalCardHeader, EmptyState, timeAgo } from "@/components/portal/shared";

const KIND_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  feedback: { label: "Feedback", icon: MessageSquareText },
  remark: { label: "Comment", icon: MessageSquareText },
  deliverable_changes: { label: "Change Request", icon: RotateCcw },
  deck_changes: { label: "Document Changes", icon: Presentation },
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
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!log) return null;

  const bc = session.brand.color;

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
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <MessageSquareText className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Feedback Log</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">
        A history of your feedback: comments, change requests and general notes to the team.
      </p>

      {/* Compose */}
      <PortalCard>
        <div className="p-5">
          {justSubmitted && (
            <p className="text-[13px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
              Feedback sent. The team has been notified.
            </p>
          )}
          <div className="flex items-start gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share feedback with the Ecultify team..."
              rows={2}
              className="flex-1 px-3 py-2.5 rounded-lg border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 bg-white resize-none"
              style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
            />
            <button
              onClick={() => void submit()}
              disabled={submitting || !content.trim()}
              className="shrink-0 h-10 px-4 rounded-lg flex items-center gap-1.5 justify-center text-white text-[13px] font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: bc }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </div>
      </PortalCard>

      {/* History */}
      <PortalCard>
        <PortalCardHeader
          icon={<MessageSquareText className="h-3.5 w-3.5" />}
          title="History"
          count={log.length}
          brandColor={bc}
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
                <div key={i} className={`px-6 py-4 ${i < log.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: bc + "10" }}>
                      <Icon className="h-4 w-4" style={{ color: bc }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: bc, backgroundColor: bc + "10" }}>
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-[#a3a3a3]">{entry.context}</span>
                      </div>
                      <p className="text-[13px] text-[#171717] mt-1.5 leading-relaxed">{entry.content}</p>
                      <p className="text-[10px] text-[#a3a3a3] mt-1">
                        {entry.authorName} · {timeAgo(entry.createdAt)}
                      </p>
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
