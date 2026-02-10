"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card } from "@/components/ui";

export default function ArchivePage() {
  const router = useRouter();
  const archived = useQuery(api.briefs.getArchivedBriefs);
  const restoreBrief = useMutation(api.briefs.restoreBrief);

  async function handleRestore(briefId: Id<"briefs">) {
    try {
      await restoreBrief({ briefId });
      router.push(`/brief/${briefId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="p-8">
      <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight mb-2">
        Archive
      </h1>
      <p className="text-[14px] text-[var(--text-secondary)] mb-8">
        Restore archived briefs
      </p>

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
    </div>
  );
}
