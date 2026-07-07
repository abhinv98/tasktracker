"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Activity, Inbox } from "lucide-react";
import {
  TASK_STATUS,
  StatusIcon,
  MonthChips,
  PortalCard,
  PortalCardHeader,
  EmptyState,
  daysUntil,
  formatDate,
} from "@/components/portal/shared";
import {
  PortalPageHeader,
  PortalSkeleton,
  PortalStatusChip,
} from "@/components/portal/ui";

export default function PortalPendingAgencyPage() {
  const params = useParams();
  const token = params.token as string;
  const session = useQuery(api.clientPortal.getPortalSession);
  const pending = useQuery(api.clientPortal.getEcultifyPendingWork);
  const [selectedMonth, setSelectedMonth] = useState("");

  const requests = useMemo(() => {
    if (!pending) return [];
    const filtered = selectedMonth
      ? pending.openRequests.filter((r: any) => r.monthKey === selectedMonth)
      : pending.openRequests;
    // Overdue items pinned on top.
    const isOverdue = (r: any) => !!r.finalDeadline && daysUntil(r.finalDeadline).overdue;
    return [...filtered].sort((a: any, b: any) => Number(isOverdue(b)) - Number(isOverdue(a)));
  }, [pending, selectedMonth]);

  if (!session || pending === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-56" />
        <PortalSkeleton rows={4} />
      </div>
    );
  }
  if (!pending) return null;

  const bc = session.brand.color;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-5">
      <PortalPageHeader
        title="With the Ecultify team"
        description="Your accepted requests that the team is currently working on."
      />

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
            title="In progress"
            count={requests.length}
          />
          <div>
            {requests.map((r: any) => {
              const info = TASK_STATUS[r.status] ?? { label: "Accepted", color: "var(--p-info)" };
              const due = r.finalDeadline ? daysUntil(r.finalDeadline) : null;
              return (
                <div
                  key={r._id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-[var(--p-border)] last:border-b-0"
                >
                  <StatusIcon status={r.status} brandColor={bc} />
                  <div className="flex-1 min-w-0">
                    <p className="p-body font-medium truncate">{r.title}</p>
                    <p className="text-[11px] mt-0.5 text-[var(--p-text-3)]">
                      {r.finalDeadline ? (
                        <>
                          Committed for {formatDate(r.finalDeadline)}
                          {due && (
                            <span
                              className={
                                due.overdue
                                  ? "text-[var(--p-danger)] font-medium"
                                  : due.urgent
                                    ? "text-[var(--p-warning)] font-medium"
                                    : ""
                              }
                            >
                              {" "}
                              · {due.text}
                            </span>
                          )}
                        </>
                      ) : (
                        "No committed date yet"
                      )}
                      {r.tag ? ` · ${r.tag}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PortalStatusChip label={info.label} dotColor={info.color} overdue={due?.overdue} />
                    <Link
                      href={`/portal/${token}/jsr`}
                      className="hidden sm:inline-flex items-center h-8 px-3 rounded-[var(--p-radius-sm)] text-[12px] font-semibold text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                    >
                      View in JSR
                    </Link>
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
