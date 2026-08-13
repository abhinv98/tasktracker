"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Live regions have to be in the DOM *before* the text lands, so they're
          permanent and empty rather than mounted with each toast. They carry
          the announcement; the visible stack below is aria-hidden so the
          message isn't read out twice. Politeness differs by type: a success
          can wait for a pause in speech, a failure can't. */}
      <div className="sr-only" role="status" aria-live="polite">
        {toasts.filter((t) => t.type !== "error").map((t) => (
          <p key={t.id}>{t.message}</p>
        ))}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {toasts.filter((t) => t.type === "error").map((t) => (
          <p key={t.id}>{t.message}</p>
        ))}
      </div>

      {/* Not aria-hidden: it holds a real dismiss button, and hiding focusable
          content from AT is its own bug. It sits outside any live region, so
          it stays silent on insert and the regions above do the announcing. */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);

  // Errors stay until dismissed — a failed save that disappears in 3.5s while
  // the user is looking at the form is a support message later. Hovering holds
  // the others open so a long message can actually be read.
  useEffect(() => {
    if (item.type === "error" || paused) return;
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss, item.type, paused]);

  const ICONS = {
    success: <CheckCircle2 className="h-4 w-4 text-[var(--accent-employee-text)]" />,
    error: <XCircle className="h-4 w-4 text-[var(--danger)]" />,
    info: <Info className="h-4 w-4 text-[var(--accent-admin-text)]" />,
  };

  // Tinted surface instead of the old 3px left stripe — same semantics, and it
  // reads as a designed state rather than a tacked-on accent bar.
  const SURFACE = {
    success: "bg-[var(--accent-employee-dim)] border-[var(--accent-employee)]/30",
    error: "bg-[var(--danger-dim)] border-[var(--danger)]/30",
    info: "bg-white border-[var(--border)]",
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-lg shadow-lg border ${SURFACE[item.type]} animate-slideInRight min-w-[260px] max-w-[380px]`}
    >
      <div className="shrink-0 mt-0.5">{ICONS[item.type]}</div>
      <p className="flex-1 text-[13px] text-[var(--text-primary)] leading-snug">
        {item.message}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
