import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="font-medium text-[13px] text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg
            text-[var(--text-primary)] text-[14px]
            px-3 py-2 min-h-[100px]
            placeholder:text-[var(--text-disabled)]
            focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] focus:ring-offset-1 focus:ring-offset-white focus:border-transparent
            transition-all duration-150
            resize-y
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

Textarea.displayName = "Textarea";
