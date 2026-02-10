"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";

interface PromptModalProps {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

export function PromptModal({
  open,
  title,
  message,
  placeholder = "",
  defaultValue = "",
  confirmLabel = "Save",
  confirmingLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, defaultValue]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    try {
      await onConfirm(value.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 animate-fadeIn" onClick={!loading ? onCancel : undefined} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[400px] bg-white rounded-xl shadow-2xl border border-[var(--border)] animate-scaleIn">
        <form onSubmit={handleSubmit}>
          <div className="p-5">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
              {title}
            </h3>
            {message && (
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {message}
              </p>
            )}
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="mt-3 w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] focus:border-transparent"
            />
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg-primary)] rounded-b-xl">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] bg-white border border-[var(--border)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? activeLabel : confirmLabel}
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
