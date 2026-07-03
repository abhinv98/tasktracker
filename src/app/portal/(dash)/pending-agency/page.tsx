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

const REQUEST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  accepted: { label: "Accepted", color: "#047857", bg: "#ecfdf5" },
  in_progress: { label: "In Progress", color: "#1d4ed8", bg: "#eff6ff" },
};

export default function PortalPendingAgencyPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const pending = useQuery(api.clientPortal.getEcultifyPendingWork);
  const [selectedMonth, setSelectedMonth] = useState("");

  const tasks = useMemo(() => {
    if (!pending) return [];
    return selectedMonth
      ? pending.openTasks.filter((t: any) => t.monthKey === selectedMonth)
      : pending.openTasks;
  }, [pending, selectedMonth]);

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
      <p className="text-[13px] text-[#737373] -mt-2">Everything currently in flight on the Ecultify side.</p>

      {pending.months.length > 1 && (
        <MonthChips months={pending.months} selected={selectedMonth} onSelect={setSelectedMonth} brandColor={bc} />
      )}

      {tasks.length === 0 && requests.length === 0 ? (
        <PortalCard>
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="Nothing in progress"
            hint="Open tasks and accepted requests will appear here while the team works on them."
          />
        </PortalCard>
      ) : (
        <>
          {tasks.length > 0 && (
            <PortalCard>
              <PortalCardHeader
                icon={<Activity className="h-3.5 w-3.5" />}
                title="Open Tasks"
                count={tasks.length}
                brandColor={bc}
              />
              <div>
                {tasks.map((t: any, i: number) => {
                  const info = TASK_STATUS[t.status] ?? { label: t.status, color: "#a3a3a3" };
                  return (
                    <div key={t._id} className={`flex items-center gap-3 px-6 py-3 ${i < tasks.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                      <StatusIcon status={t.status} brandColor={bc} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#171717]">{t.title}</p>
                        <p className="text-[10px] text-[#a3a3a3]">{t.briefTitle}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.deadline && <span className="text-[11px] text-[#737373]">{formatDate(t.deadline)}</span>}
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

          {requests.length > 0 && (
            <PortalCard>
              <PortalCardHeader
                icon={<Inbox className="h-3.5 w-3.5" />}
                title="Accepted Requests"
                count={requests.length}
                brandColor={bc}
              />
              <div>
                {requests.map((r: any, i: number) => {
                  const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.accepted;
                  return (
                    <div key={r._id} className={`flex items-center gap-3 px-6 py-3 ${i < requests.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#171717]">{r.title}</p>
                        {r.finalDeadline && (
                          <p className="text-[10px] text-[#a3a3a3]">Committed for {formatDate(r.finalDeadline)}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: meta.color, backgroundColor: meta.bg }}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </PortalCard>
          )}
        </>
      )}
    </div>
  );
}
