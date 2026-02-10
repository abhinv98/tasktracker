"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmingLabel,
  cancelLabel = "Cancel",
  variant = "primary",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  // Reset loading when modal closes
  useEffect(() => {
    if (!open) setLoading(false);
  }, [open]);

  // Escape to cancel
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    },
    [onCancel, loading]
  );

  useEffect(() => {
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const activeLabel = confirmingLabel ?? confirmLabel.replace(/e?$/, "ing...");

  const btnColor =
    variant === "danger"
      ? "bg-[var(--danger)] hover:bg-[#a93225]"
      : "bg-[var(--accent-admin)] hover:bg-[#c4684d]";

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 animate-fadeIn" onClick={!loading ? onCancel : undefined} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="w-[90vw] max-w-[400px] bg-white rounded-xl shadow-2xl border border-[var(--border)] animate-scaleIn pointer-events-auto">
        <div className="p-5">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg-primary)] rounded-b-xl">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] bg-white border border-[var(--border)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed ${btnColor}`}
          >
            {loading ? activeLabel : confirmLabel}
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
