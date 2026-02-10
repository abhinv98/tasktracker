import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-admin)] text-white hover:bg-[#c4684d] shadow-sm",
  secondary:
    "bg-white text-[var(--text-primary)] border border-[var(--border)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]",
  destructive:
    "bg-[var(--danger)] text-white hover:bg-[#a93225] shadow-sm",
  ghost:
    "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-2 px-4 py-2
          font-medium text-[13px]
          rounded-lg
          transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]
          ${variantStyles[variant]}
          ${className}
        `}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
