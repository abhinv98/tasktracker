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
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const ICONS = {
    success: <CheckCircle2 className="h-4 w-4 text-[var(--accent-employee)]" />,
    error: <XCircle className="h-4 w-4 text-[var(--danger)]" />,
    info: <Info className="h-4 w-4 text-[var(--accent-admin)]" />,
  };

  const BG = {
    success: "border-l-[var(--accent-employee)]",
    error: "border-l-[var(--danger)]",
    info: "border-l-[var(--accent-admin)]",
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 bg-white rounded-lg shadow-lg border border-[var(--border)] border-l-[3px] ${BG[item.type]} animate-slideInRight min-w-[260px] max-w-[380px]`}
    >
      <div className="shrink-0 mt-0.5">{ICONS[item.type]}</div>
      <p className="flex-1 text-[13px] text-[var(--text-primary)] leading-snug">
        {item.message}
      </p>
      <button onClick={onDismiss} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
