interface SegmentedTabsProps<K extends string> {
  value: K;
  options: readonly { value: K; label: string }[];
  onChange: (value: K) => void;
  className?: string;
}

/**
 * Compact segmented control for scope/filter tabs. Use instead of
 * hand-rolling the pill cluster per page so density and states stay
 * identical everywhere.
 */
export function SegmentedTabs<K extends string>({
  value,
  options,
  onChange,
  className = "",
}: SegmentedTabsProps<K>) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`px-3 py-1 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors duration-150 ${
            o.value === value
              ? "bg-white text-[var(--text-primary)] border border-[var(--border)]"
              : "text-[var(--text-muted)] border border-transparent hover:text-[var(--text-primary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
