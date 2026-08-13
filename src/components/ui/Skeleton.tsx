/**
 * Loading placeholders shaped like the thing that's coming.
 *
 * The app used to render a grey "Loading..." string on 21 pages, so every
 * navigation read as a stall and then a snap. A skeleton in the real layout's
 * shape makes the identical wait feel roughly half as long, because the
 * structure arrives before the data does.
 *
 * Rule: match the real layout. A skeleton that doesn't reflow into the loaded
 * content is worse than none — it makes the page jump at the moment of arrival.
 */

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={`animate-shimmer rounded bg-[var(--bg-hover)] ${className}`}
    />
  );
}

/** Screen-reader announcement for any skeleton block — they're aria-hidden. */
function LoadingLabel({ what }: { what: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      Loading {what}
    </span>
  );
}

/** Matches the PageHeader block so the title area doesn't jump on arrival. */
export function SkeletonPageHeader() {
  return (
    <div className="flex items-center justify-between gap-3 pb-4 mb-6 border-b border-[var(--border-subtle)]">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[22px] w-[180px]" />
        <Skeleton className="h-[13px] w-[260px]" />
      </div>
      <Skeleton className="h-[34px] w-[140px] rounded-md" />
    </div>
  );
}

/** Card grid, e.g. the request boards. */
export function SkeletonCards({
  count = 6,
  what = "cards",
}: {
  count?: number;
  what?: string;
}) {
  return (
    <>
      <LoadingLabel what={what} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            // Cards stagger by 60ms so the grid reads as filling in rather than
            // flashing as one block. Caps at 5 so a long list doesn't crawl.
            style={{ animationDelay: `${(i % 5) * 60}ms` }}
            className="animate-fadeIn rounded-xl border border-[var(--border)] bg-white p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-[13px] w-[110px]" />
                <Skeleton className="h-[11px] w-[70px]" />
              </div>
              <Skeleton className="h-[16px] w-[64px] rounded-full" />
            </div>
            <Skeleton className="mt-4 h-[15px] w-[80%]" />
            <Skeleton className="mt-2 h-[12px] w-[95%]" />
            <Skeleton className="mt-1.5 h-[12px] w-[55%]" />
            <div className="mt-5 flex gap-2 border-t border-[var(--border-subtle)] pt-3">
              <Skeleton className="h-[30px] w-[88px] rounded-md" />
              <Skeleton className="h-[30px] w-[88px] rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Table body, e.g. Users & Teams. */
export function SkeletonTable({
  rows = 8,
  cols = 5,
  what = "table",
}: {
  rows?: number;
  cols?: number;
  what?: string;
}) {
  return (
    <>
      <LoadingLabel what={what} />
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="flex gap-4 border-b border-[var(--border)] bg-[var(--bg-hover)] px-4 py-2.5">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-[11px] flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className="flex gap-4 border-b border-[var(--border-subtle)] px-4 py-3"
          >
            {Array.from({ length: cols }, (_, c) => (
              <div key={c} className="flex-1">
                {/* Ragged, deterministic widths. Uniform bars read as a
                    progress meter; uneven ones read as text about to land. */}
                <Skeleton
                  className="h-[13px]"
                  style={{ width: `${55 + ((r * 7 + c * 23) % 40)}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Stacked rows of text, for list and detail panes. */
export function SkeletonList({
  rows = 5,
  what = "list",
}: {
  rows?: number;
  what?: string;
}) {
  const widths = ["85%", "70%", "92%", "60%", "78%"];
  return (
    <>
      <LoadingLabel what={what} />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border)] bg-white p-3"
          >
            <Skeleton className="h-[13px]" />
            <Skeleton
              className="mt-2 h-[11px]"
              style={{ width: widths[i % widths.length] }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
