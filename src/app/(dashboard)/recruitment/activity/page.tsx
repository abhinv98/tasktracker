"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  SkeletonPageHeader,
  SkeletonTable,
} from "@/components/ui";
import { Mail, ArrowLeft } from "lucide-react";

function fmt(ts: number) {
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "2-digit",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function RecruitmentActivityPage() {
  const logs = useQuery(api.recruitment.listEmailLogs, { limit: 200 });
  const stats = useQuery(api.recruitment.getStats);

  if (logs === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={10} cols={5} what="email activity" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link
        href="/recruitment/applicants"
        className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={13} />
        Recruitment
      </Link>

      <PageHeader
        title="Email Activity"
        subtitle={
          stats
            ? `${stats.emailsSent.toLocaleString()} delivered · ${stats.emailsFailed} failed — most recent 200 shown`
            : "Candidate outreach history"
        }
        icon={Mail}
      />

      {logs.length === 0 ? (
        <EmptyState icon={Mail} title="Nothing sent yet" />
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                  {["Sent", "Candidate", "Position", "Template", "Result"].map((h) => (
                    <th
                      key={h}
                      className="h-8 px-3 text-left font-medium text-[12px] text-[var(--text-muted)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr
                    key={l._id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] transition-colors"
                  >
                    <td className="px-3 py-2 text-[12px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                      {fmt(l.sentAt)}
                    </td>
                    <td className="px-3 py-2 text-[13px] whitespace-nowrap">
                      <span className="text-[var(--text-primary)]">{l.contactName || "—"}</span>
                      <span className="block text-[12px] text-[var(--text-muted)]">
                        {l.contactEmail}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[13px] text-[var(--text-secondary)] whitespace-nowrap">
                      {l.jobName || "—"}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-[var(--text-secondary)] whitespace-nowrap">
                      {l.templateName || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.status === "sent" ? (
                        <StatusBadge color="var(--accent-employee)" label="Delivered" />
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 font-medium text-[12px] text-[var(--danger)]"
                          // The provider's raw reason is the only thing that
                          // explains a bounce — surface it rather than hide it.
                          title={l.error}
                        >
                          <span className="inline-block w-2 h-2 rounded-full bg-[var(--danger)]" />
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
