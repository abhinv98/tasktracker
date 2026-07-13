"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Footer pager for client-side paginated tables. Renders nothing when
 * everything fits on one page, so callers can include it unconditionally.
 */
export function PaginationFooter({
  page,
  pageCount,
  totalRows,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  totalRows: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-[var(--border)] bg-[var(--bg-primary)]">
      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
        {from}–{to} of {totalRows}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-white text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-admin)]/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="px-2 text-[11px] text-[var(--text-muted)] tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount - 1}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-white text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-admin)]/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
