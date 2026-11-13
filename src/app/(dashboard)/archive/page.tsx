"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, PageHeader, SkeletonList, useToast } from "@/components/ui";
import { Archive } from "lucide-react";

export default function ArchivePage() {
  const router = useRouter();
  // 208 archived briefs and counting: load 25 at a time, newest first.
  const { results: archived, status, loadMore } = usePaginatedQuery(
    api.briefs.getArchivedBriefs,
    {},
    { initialNumItems: 25 }
  );
  const restoreBrief = useMutation(api.briefs.restoreBrief);

  const { toast } = useToast();

  async function handleRestore(briefId: Id<"briefs">) {
    try {
      await restoreBrief({ briefId });
      toast("success", "Brief restored");
      router.push(`/brief/${briefId}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to restore");
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Archive" subtitle="Restore archived briefs" />

      {status === "LoadingFirstPage" ? (
        <SkeletonList />
      ) : archived.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Nothing archived"
          description="Archived briefs show up here, and can be restored at any time."
        />
      ) : (
      <div className="flex flex-col gap-4">
        {/* One frame, hairline dividers: a list to scan, not a stack of cards. */}
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden divide-y divide-[var(--border-subtle)]">
        {archived.map((brief) => (
          <div key={brief._id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-primary)] transition-colors">
            <div className="min-w-0">
              <h3 className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                {brief.title}
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                Archived {(brief as { archivedByName?: string }).archivedByName} ·{" "}
                {(brief as { taskCount?: number }).taskCount ?? 0} tasks ·{" "}
                {(brief as { doneCount?: number }).doneCount ?? 0} completed
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={() => handleRestore(brief._id)}>
              Restore
            </Button>
          </div>
        ))}
        </div>
        {status !== "Exhausted" && (
          <div className="flex justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => loadMore(25)}
              disabled={status === "LoadingMore"}
            >
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
