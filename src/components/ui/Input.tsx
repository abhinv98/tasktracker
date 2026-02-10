import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="font-medium text-[13px] text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg
            text-[var(--text-primary)] text-[14px]
            px-3 py-2
            placeholder:text-[var(--text-disabled)]
            focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] focus:ring-offset-1 focus:ring-offset-white focus:border-transparent
            transition-all duration-150
            ${error ? "ring-2 ring-[var(--danger)]" : ""}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-[12px] font-medium text-[var(--danger)]">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
