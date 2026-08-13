"use client";

import { useEffect, useRef } from "react";
import { X, type LucideIcon } from "lucide-react";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  size?: ModalSize;
  /** Right-aligned footer slot — buttons go here, not in children. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[560px]",
  lg: "max-w-[760px]",
};

/**
 * The one modal. Built on native <dialog>.showModal(), which hands us focus
 * trapping, Escape-to-close, inertness of the page behind, and top-layer
 * rendering that no z-index or overflow:hidden ancestor can clip — all of
 * which the six hand-rolled overlays in this app each had to re-solve, and
 * mostly didn't.
 */
export function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  size = "sm",
  footer,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Escape fires `cancel` before `close`; route both through onClose so the
  // parent's state stays the single source of truth.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handle);
    return () => el.removeEventListener("cancel", handle);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={(e) => {
        // Clicks land on the dialog element itself only when they hit the
        // backdrop — anything inside the content div stops here.
        if (e.target === ref.current) onClose();
      }}
      // m-auto is load-bearing: the UA stylesheet centres a modal <dialog>
      // with `margin: auto` inside its inset-0 box, and Tailwind's preflight
      // zeroes margin on every element — which drops the dialog into the
      // top-left corner. Restoring it is what centres this.
      className={`
        m-auto w-[calc(100%-2rem)] ${SIZES[size]} max-h-[calc(100dvh-4rem)]
        p-0 bg-transparent overflow-visible
        backdrop:bg-[#141413]/40 backdrop:backdrop-blur-[2px]
        open:animate-scaleIn
      `}
    >
      <div className="bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-admin-dim)] shrink-0">
                <Icon size={15} className="text-[var(--accent-admin-text)]" />
              </div>
            )}
            <h2
              id="modal-title"
              className="font-semibold text-[15px] text-[var(--text-primary)] tracking-tight truncate"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-hover)] transition-colors shrink-0"
          >
            <X size={15} className="text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
