"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, ClipboardList, Package } from "lucide-react";
import {
  MonthChips,
  PortalCard,
  PortalCardHeader,
  EmptyState,
  formatDate,
  monthLabel,
} from "@/components/portal/shared";

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
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!log) return null;

  const bc = session.brand.color;
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <ClipboardList className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Monthly Log</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">
        Completed tasks that were requested through this portal, month by month.
      </p>

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
        months.map((month) => (
          <PortalCard key={month}>
            <PortalCardHeader
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              title={monthLabel(month)}
              count={byMonth[month].length}
              brandColor={bc}
            />
            <div>
              {byMonth[month].map((e: any, i: number) => (
                <div key={e._id} className={`flex items-center gap-3 px-6 py-3 ${i < byMonth[month].length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10b981]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#171717]">{e.title}</p>
                    {e.requestedBy && <p className="text-[10px] text-[#a3a3a3]">Requested by {e.requestedBy}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.tag && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: bc, backgroundColor: bc + "10" }}>
                        {e.tag}
                      </span>
                    )}
                    {e.deliverableCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: bc, backgroundColor: bc + "10" }}>
                        <Package className="h-3 w-3" />
                        {e.deliverableCount}
                      </span>
                    )}
                    <span className="text-[11px] text-[#737373]">{formatDate(e.completedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </PortalCard>
        ))
      )}
    </div>
  );
}
