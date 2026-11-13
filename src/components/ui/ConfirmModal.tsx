"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import { Loader2 } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  children?: React.ReactNode;
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
  children,
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
  // While the dialog is open it owns the keyboard. Listening in the capture
  // phase and stopping the event there means the page behind never sees the
  // key: Escape cancels only this dialog (not the task panel under it), and
  // page shortcuts (the planner's N and arrows) stay quiet. Tab, Enter and
  // Space still work on the dialog's own buttons, as those are default actions.
  const box = useRef<HTMLDivElement>(null);
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape" && !loading) onCancel();
      // Tab stays inside the dialog: from the last control it wraps to the
      // first (and back), and from anywhere outside it comes in.
      if (e.key === "Tab" && box.current) {
        const stops = [...box.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")].filter(
          (el) => !el.hasAttribute("disabled")
        );
        if (stops.length === 0) return;
        const first = stops[0];
        const last = stops[stops.length - 1];
        const at = document.activeElement;
        if (!box.current.contains(at) || (e.shiftKey && at === first) || (!e.shiftKey && at === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    },
    [onCancel, loading]
  );

  // Whatever had focus when the dialog opened gets it back when it closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, [open]);

  useEffect(() => {
    if (open) document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, handleKey]);

  if (!open) return null;

  const activeLabel = confirmingLabel ?? confirmLabel.replace(/e?$/, "ing...");

  const btnColor =
    variant === "danger"
      ? "bg-[var(--danger)] hover:bg-[#a93225]"
      : "bg-[var(--accent-admin-strong)] hover:bg-[#a04525]";

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
      <div className="fixed inset-0 bg-black/40 z-[70] animate-fadeIn" onClick={!loading ? onCancel : undefined} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-[90vw] max-w-[400px] bg-white rounded-xl shadow-2xl border border-[var(--border)] animate-scaleIn pointer-events-auto"
      >
        <div className="p-5">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
            {message}
          </p>
          {children}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg-primary)] rounded-b-xl">
          <button
            onClick={onCancel}
            disabled={loading}
            // Focus starts on the safe choice, and inside the dialog, so Enter
            // cannot press whatever was focused on the page behind.
            autoFocus
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

type ConfirmRequest = {
  title: string;
  message: string;
  /** Defaults to "Delete". */
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
};

// Outside a ConfirmProvider the button must still work, so fall back to the
// browser's own prompt instead of doing nothing.
const ConfirmContext = createContext<(request: ConfirmRequest) => void>((request) => {
  if (window.confirm(`${request.title}\n\n${request.message}`)) void request.onConfirm();
});

/** Ask before something that cannot be undone:
 *  `const askConfirm = useConfirm(); askConfirm({ title, message, onConfirm })`.
 *  (Not named `confirm`: that would shadow the browser's.) One dialog for the whole app,
 *  above every panel; a failure is shown as a toast instead of vanishing. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const { toast } = useToast();
  return (
    <ConfirmContext.Provider value={setRequest}>
      {children}
      <ConfirmModal
        open={request !== null}
        title={request?.title ?? ""}
        message={request?.message ?? ""}
        confirmLabel={request?.confirmLabel ?? "Delete"}
        variant="danger"
        onCancel={() => setRequest(null)}
        onConfirm={async () => {
          try {
            await request?.onConfirm();
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "That did not work. Try again.");
          } finally {
            setRequest(null);
          }
        }}
      />
    </ConfirmContext.Provider>
  );
}
