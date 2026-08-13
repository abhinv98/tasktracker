"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FileDown } from "lucide-react";
import { timeAgo } from "./shared";
import { PortalButton, PortalStatusChip } from "./ui";

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
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
              r.senderType === "client" ? "text-white" : "bg-[var(--p-surface-2)] text-[var(--p-text-2)]"
            }`}
            style={r.senderType === "client" ? { backgroundColor: brandColor } : {}}
          >
            {(r.senderName || (r.senderType === "client" ? "C" : "M"))[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--p-text)]">
                {r.senderName || (r.senderType === "client" ? "Client" : "Manager")}
              </span>
              <span className="text-[11px] text-[var(--p-text-3)]">{timeAgo(r.createdAt)}</span>
            </div>
            <p className="p-secondary">{r.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RemarkComposer({
  placeholder,
  onSubmit,
}: {
  /** Kept for call-site compatibility; the composer is token-styled. */
  brandColor?: string;
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
        className="p-input flex-1 !h-8 text-[12px]"
      />
      <PortalButton size="sm" loading={submitting} disabled={!content.trim()} onClick={() => void submit()}>
        Send
      </PortalButton>
    </div>
  );
}

const DELIVERABLE_STATUS: Record<string, { label: string; dot: string }> = {
  approved: { label: "Approved", dot: "var(--p-success)" },
  rejected: { label: "Revision requested", dot: "var(--p-danger)" },
  pending: { label: "Pending review", dot: "var(--p-warning)" },
};

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
  const statusMeta = deliverable.status
    ? (DELIVERABLE_STATUS[deliverable.status] ?? DELIVERABLE_STATUS.pending)
    : null;

  return (
    <div className="mt-2 rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-2)] overflow-hidden">
      <div className="px-4 py-3">
        {deliverable.message && <p className="p-secondary mb-2">{deliverable.message}</p>}
        {deliverable.link && (
          <a
            href={deliverable.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-medium text-[var(--p-text)] underline decoration-[var(--p-border-strong)] hover:decoration-[var(--p-text)] mb-2 block break-all"
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--p-radius-sm)] bg-[var(--p-surface)] border border-[var(--p-border)] text-[11px] font-medium text-[var(--p-text-2)] hover:border-[var(--p-border-strong)]"
              >
                <FileDown className="h-3 w-3 text-[var(--p-text-3)]" />
                {f.name}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-[var(--p-text-3)]">
          <span>{timeAgo(deliverable.submittedAt)}</span>
          {statusMeta && <PortalStatusChip label={statusMeta.label} dotColor={statusMeta.dot} />}
        </div>
      </div>

      {deliverable.remarks && deliverable.remarks.length > 0 && (
        <div className="border-t border-[var(--p-border)] px-4 py-2 bg-[var(--p-surface)]">
          <RemarkThread remarks={deliverable.remarks} brandColor={brandColor} />
        </div>
      )}

      <div className="border-t border-[var(--p-border)] px-4 py-2 bg-[var(--p-surface)]">
        {showForm ? (
          <RemarkComposer
            brandColor={brandColor}
            placeholder="Leave feedback"
            onSubmit={async (content) => {
              await addRemark({
                deliverableId: deliverable._id as Id<"deliverables">,
                content,
              });
              setShowForm(false);
            }}
          />
        ) : (
          <PortalButton variant="ghost" size="sm" onClick={() => setShowForm(true)}>
            Leave feedback
          </PortalButton>
        )}
      </div>
    </div>
  );
}
