"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Activity, Inbox } from "lucide-react";
import {
  TASK_STATUS,
  StatusIcon,
  MonthChips,
  PortalCard,
  PortalCardHeader,
  EmptyState,
  formatDate,
} from "@/components/portal/shared";

export default function PortalPendingAgencyPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const pending = useQuery(api.clientPortal.getEcultifyPendingWork);
  const [selectedMonth, setSelectedMonth] = useState("");

  const requests = useMemo(() => {
    if (!pending) return [];
    return selectedMonth
      ? pending.openRequests.filter((r: any) => r.monthKey === selectedMonth)
      : pending.openRequests;
  }, [pending, selectedMonth]);

  if (!session || pending === undefined) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!pending) return null;

  const bc = session.brand.color;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Activity className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Ecultify Pending Work</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">
        Your accepted requests that the team is currently working on.
      </p>

      {pending.months.length > 1 && (
        <MonthChips months={pending.months} selected={selectedMonth} onSelect={setSelectedMonth} brandColor={bc} />
      )}

      {requests.length === 0 ? (
        <PortalCard>
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="Nothing in progress"
            hint="Once the team accepts one of your requests, it will show here until it is delivered."
          />
        </PortalCard>
      ) : (
        <PortalCard>
          <PortalCardHeader
            icon={<Activity className="h-3.5 w-3.5" />}
            title="In Progress with Ecultify"
            count={requests.length}
            brandColor={bc}
          />
          <div>
            {requests.map((r: any, i: number) => {
              const info = TASK_STATUS[r.status] ?? { label: "Accepted", color: "#0f766e" };
              return (
                <div key={r._id} className={`flex items-center gap-3 px-6 py-3 ${i < requests.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                  <StatusIcon status={r.status} brandColor={bc} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#171717]">{r.title}</p>
                    {r.finalDeadline && (
                      <p className="text-[10px] text-[#a3a3a3]">Committed for {formatDate(r.finalDeadline)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.tag && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: bc, backgroundColor: bc + "10" }}>
                        {r.tag}
                      </span>
                    )}
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: info.color, backgroundColor: info.color + "12" }}>
                      {info.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </PortalCard>
      )}
    </div>
  );
}
