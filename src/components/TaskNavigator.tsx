"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { AlertTriangle } from "lucide-react";

/**
 * Given a taskId, resolves where the task lives and navigates there:
 *  - a normal brief → the brief page
 *  - a content-calendar task → the Content Calendar at the right brand + month
 *  - a deleted/archived brief → a popup explaining exactly why the task
 *    can't be opened (and why it still shows in Worklog / My Tasks /
 *    Oversight but not under Briefs).
 *
 * Drop it in with a `taskId` state: clicking a task row sets the id, this
 * component resolves + routes (or shows the popup), then calls onClose.
 */
export function TaskNavigator({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const loc = useQuery(
    api.tasks.getTaskLocation,
    taskId ? { taskId: taskId as Id<"tasks"> } : "skip"
  );

  useEffect(() => {
    if (!taskId || loc === undefined || !loc.ok) return;
    if (loc.kind === "content_calendar") {
      const params = new URLSearchParams();
      if (loc.brandId) params.set("brand", loc.brandId);
      if (loc.month) params.set("month", loc.month);
      const qs = params.toString();
      router.push(`/content-calendar${qs ? `?${qs}` : ""}`);
    } else {
      router.push(`/brief/${loc.briefId}`);
    }
    onClose();
  }, [taskId, loc, router, onClose]);

  // Loading, or about to navigate — render nothing.
  if (!taskId || loc === undefined || loc.ok) return null;

  // Couldn't resolve a location — show the exact reason.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-[var(--border)] w-full max-w-md p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
            Can't open this task
          </h3>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          {loc.reason}
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin-strong)] hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
