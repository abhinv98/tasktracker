"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { TrackerView } from "@/components/recruitment/TrackerView";
import { isTracker } from "@/convex/lib/hrTrackers";

/** /recruitment/t/<tracker>: any one of the HR trackers. */
export default function TrackerPage() {
  const key = String(useParams().tracker ?? "");
  if (!isTracker(key)) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState title="No such tracker" description="Pick one from the menu on the left." />
      </div>
    );
  }
  return (
    <Suspense>
      <TrackerView key={key} tracker={key} />
    </Suspense>
  );
}
