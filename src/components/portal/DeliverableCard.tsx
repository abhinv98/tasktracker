"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { timeAgo } from "./shared";

type Remark = {
  _id: string;
  senderType: "client" | "manager";
  senderName?: string;
  content: string;
  createdAt: number;
};

export function RemarkThread({ remarks, brandColor }: { remarks: Remark[]; brandColor: string }) {
  if (remarks.length === 0) return null;
  return (
    <div className="space-y-2">
      {remarks.map((r) => (
        <div key={r._id} className="flex gap-2">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5 ${
              r.senderType === "client" ? "text-white" : "bg-[#e5e5e5] text-[#525252]"
            }`}
            style={r.senderType === "client" ? { backgroundColor: brandColor } : {}}
          >
            {(r.senderName || (r.senderType === "client" ? "C" : "M"))[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#171717]">
                {r.senderName || (r.senderType === "client" ? "Client" : "Manager")}
              </span>
              <span className="text-[9px] text-[#a3a3a3]">{timeAgo(r.createdAt)}</span>
            </div>
            <p className="text-[12px] text-[#525252] leading-relaxed">{r.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RemarkComposer({
  brandColor,
  placeholder,
  onSubmit,
}: {
  brandColor: string;
  placeholder: string;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent("");
    } catch {}
    setSubmitting(false);
  }

  return (
    <div className="flex gap-2">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        className="flex-1 px-3 py-1.5 rounded-lg border border-[#e5e5e5] text-[12px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-1 bg-white"
        style={{ "--tw-ring-color": brandColor + "40" } as React.CSSProperties}
      />
      <button
        onClick={() => void submit()}
        disabled={submitting || !content.trim()}
        className="px-3 py-1.5 rounded-lg text-white text-[11px] font-medium disabled:opacity-50"
        style={{ backgroundColor: brandColor }}
      >
        {submitting ? "..." : "Send"}
      </button>
    </div>
  );
}

/** Deliverable inside the JSR Track — files, links and its comment thread. */
export function DeliverableCard({
  deliverable,
  brandColor,
}: {
  deliverable: {
    _id: string;
    message?: string;
    link?: string;
    status?: string;
    submittedAt: number;
    files?: { name: string; url: string }[];
    remarks?: Remark[];
  };
  brandColor: string;
}) {
  const addRemark = useMutation(api.clientPortal.addDeliverableRemark);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="ml-7 mt-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] overflow-hidden">
      <div className="px-4 py-3">
        {deliverable.message && <p className="text-[12px] text-[#525252] mb-2">{deliverable.message}</p>}
        {deliverable.link && (
          <a
            href={deliverable.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-medium underline mb-2 block"
            style={{ color: brandColor }}
          >
            {deliverable.link}
          </a>
        )}
        {deliverable.files && deliverable.files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {deliverable.files.map((f, idx) => (
              <a
                key={idx}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#e5e5e5] text-[11px] font-medium text-[#525252] hover:border-[#c4c4c4] transition-colors"
              >
                <svg className="h-3 w-3 text-[#a3a3a3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {f.name}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-[#a3a3a3]">
          <span>{timeAgo(deliverable.submittedAt)}</span>
          {deliverable.status && (
            <span
              className={`font-medium px-1.5 py-0.5 rounded ${
                deliverable.status === "approved"
                  ? "text-[#10b981] bg-[#10b98112]"
                  : deliverable.status === "rejected"
                    ? "text-[#ef4444] bg-[#ef444412]"
                    : "text-[#f59e0b] bg-[#f59e0b12]"
              }`}
            >
              {deliverable.status === "approved"
                ? "Approved"
                : deliverable.status === "rejected"
                  ? "Revision Requested"
                  : "Pending Review"}
            </span>
          )}
        </div>
      </div>

      {deliverable.remarks && deliverable.remarks.length > 0 && (
        <div className="border-t border-[#e5e5e5] px-4 py-2">
          <RemarkThread remarks={deliverable.remarks} brandColor={brandColor} />
        </div>
      )}

      <div className="border-t border-[#e5e5e5] px-4 py-2">
        {showForm ? (
          <RemarkComposer
            brandColor={brandColor}
            placeholder="Leave feedback..."
            onSubmit={async (content) => {
              await addRemark({
                deliverableId: deliverable._id as Id<"deliverables">,
                content,
              });
              setShowForm(false);
            }}
          />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="text-[11px] font-medium transition-colors"
            style={{ color: brandColor }}
          >
            Leave feedback
          </button>
        )}
      </div>
    </div>
  );
}
