// Class strings for the two things pages still write by hand: icon-only
// buttons and native fields that the Input / Select / Textarea components do
// not fit (inline editors, filter rows). One place, so they stay one size.

/** A 32px icon-only button. Always give the element an aria-label. */
export const iconButtonClass =
  "inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors";

/** The same, for delete and remove: quiet until hovered. */
export const iconButtonDangerClass =
  "inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors";

/** A native textarea or other field with its own height. No width: add w-full or a fixed one. */
export const fieldBaseClass =
  "px-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-50";

/** A native input or select at the standard 32px height. No width: add w-full or a fixed one. */
export const fieldClass = `h-8 ${fieldBaseClass}`;
