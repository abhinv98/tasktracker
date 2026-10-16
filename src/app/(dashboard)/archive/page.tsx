"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, EmptyState, PageHeader, SkeletonList, useToast } from "@/components/ui";
import { Archive } from "lucide-react";

export default function ArchivePage() {
  const router = useRouter();
  const archived = useQuery(api.briefs.getArchivedBriefs);
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

      {archived === undefined ? (
        <SkeletonList />
      ) : archived.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Nothing archived"
          description="Archived briefs show up here, and can be restored at any time."
        />
      ) : (
      <div className="flex flex-col gap-4">
        {(archived ?? []).map((brief) => (
          <Card key={brief._id} className="flex flex-row justify-between items-center">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">
                {brief.title}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Archived {(brief as { archivedByName?: string }).archivedByName} ·{" "}
                {(brief as { taskCount?: number }).taskCount ?? 0} tasks ·{" "}
                {(brief as { doneCount?: number }).doneCount ?? 0} completed
              </p>
            </div>
            <Button variant="secondary" onClick={() => handleRestore(brief._id)}>
              Restore
            </Button>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
