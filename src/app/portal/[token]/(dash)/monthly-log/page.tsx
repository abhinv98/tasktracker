"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { ClipboardList, Package } from "lucide-react";
import {
  MonthChips,
  PortalCard,
  EmptyState,
  formatDate,
  monthLabel,
} from "@/components/portal/shared";
import { PortalPageHeader, PortalSkeleton, PortalStatusChip } from "@/components/portal/ui";

export default function PortalMonthlyLogPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const log = useQuery(api.clientPortal.getMonthlyLog);
  const [selectedMonth, setSelectedMonth] = useState("");

  const byMonth = useMemo(() => {
    if (!log) return {};
    const entries = selectedMonth ? log.entries.filter((e: any) => e.monthKey === selectedMonth) : log.entries;
    const map: Record<string, any[]> = {};
    for (const e of entries) {
      if (!map[e.monthKey]) map[e.monthKey] = [];
      map[e.monthKey].push(e);
    }
    return map;
  }, [log, selectedMonth]);

  if (!session || log === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-48" />
        <PortalSkeleton rows={5} />
      </div>
    );
  }
  if (!log) return null;

  const bc = session.brand.color;
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-5">
      <PortalPageHeader
        title="Monthly log"
        description="Completed tasks that were requested through this portal, month by month."
      />

      {log.months.length > 1 && (
        <MonthChips months={log.months} selected={selectedMonth} onSelect={setSelectedMonth} brandColor={bc} />
      )}

      {months.length === 0 ? (
        <PortalCard>
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="Nothing completed yet"
            hint="Completed tasks and their deliverables will be logged here."
          />
        </PortalCard>
      ) : (
        /* Month timeline — day markers on a left rule */
        <div className="space-y-6">
          {months.map((month) => (
            <div key={month}>
              <h2 className="p-section mb-3">
                {monthLabel(month)}
                <span className="font-normal text-[var(--p-text-3)]"> · {byMonth[month].length}</span>
              </h2>
              <div className="relative pl-5 border-l border-[var(--p-border)] ml-1.5 space-y-3">
                {byMonth[month].map((e: any) => (
                  <div key={e._id} className="relative">
                    {/* Day marker on the rule */}
                    <span
                      className="absolute -left-[26px] top-4 w-2.5 h-2.5 rounded-full border-2 border-[var(--p-bg)]"
                      style={{ backgroundColor: "var(--p-success)" }}
                    />
                    <PortalCard>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="p-body font-medium truncate">{e.title}</p>
                          <p className="text-[11px] text-[var(--p-text-3)] mt-0.5">
                            {formatDate(e.completedAt)}
                            {e.requestedBy ? ` · Requested by ${e.requestedBy}` : ""}
                            {e.tag ? ` · ${e.tag}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {e.deliverableCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--p-text-2)]">
                              <Package className="h-3 w-3 text-[var(--p-text-3)]" />
                              {e.deliverableCount}
                            </span>
                          )}
                          <PortalStatusChip label="Completed" dotColor="var(--p-success)" />
                        </div>
                      </div>
                    </PortalCard>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
