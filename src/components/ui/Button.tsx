import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** sm = 28px, for toolbars and dense rows; md = 32px default. */
  size?: "sm" | "md";
  /** Force the spinner on. Omit and an async onClick drives it automatically. */
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Ink, not brand terracotta: the primary action is the darkest thing on
  // the page (17:1 behind white). Terracotta stays for accents and links.
  primary:
    "bg-[var(--text-primary)] text-white hover:bg-[#2a2a2a]",
  secondary:
    "bg-white text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]",
  destructive:
    "bg-[var(--danger)] text-white hover:bg-[#a93225]",
  ghost:
    "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
};

// Duplicate rows (same brief/task created twice, ~0.6-2s apart) came from
// impatient double-clicks on submit buttons: the mutation round-trip to the
// self-hosted Convex takes ~1s, nothing changes on screen, so the user clicks
// again. Swallow the second click here — one place, every form.
// ponytail: fixed 2.5s window; swap for real per-form pending state if a form
// ever needs two legitimate submits inside it.
const RESUBMIT_WINDOW_MS = 2500;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, disabled, loading, onClick, ...props }, ref) => {
    const lastSubmit = useRef(0);
    // An async onClick drives the spinner on its own, so every action button
    // gets one without touching its call site. `loading` overrides for forms,
    // where the work hangs off onSubmit instead.
    const [running, setRunning] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (props.type === "submit") {
        const now = Date.now();
        if (now - lastSubmit.current < RESUBMIT_WINDOW_MS) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lastSubmit.current = now;
      }
      const result = onClick?.(e) as unknown;
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setRunning(true);
        void (result as Promise<unknown>).finally(() => {
          if (mounted.current) setRunning(false);
        });
      }
    };

    const busy = loading === true || running;
    return (
      <button
        ref={ref}
        onClick={handleClick}
        className={`
          relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap
          ${size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]"}
          font-medium tracking-[-0.003em]
          rounded-md shadow-[0_1px_0_rgba(0,0,0,0.03)]
          transition-all duration-150
          active:translate-y-[1px] active:duration-[50ms]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]
          ${variantStyles[variant]}
          ${className}
        `}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...props}
      >
        {/* Spinner sits on top and the label just goes invisible, so the
            button keeps its width and nothing jumps around it. */}
        {busy && (
          <Loader2
            className="absolute h-4 w-4 animate-spin"
            aria-hidden
          />
        )}
        <span
          className={`inline-flex items-center gap-2 ${busy ? "invisible" : ""}`}
        >
          {children}
        </span>
      </button>
    );
  }
);

Button.displayName = "Button";
