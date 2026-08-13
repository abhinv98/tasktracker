"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import {
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
        href="/recruitment"
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Mail size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">
            Nothing sent yet
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-hover)]">
                  {["Sent", "Candidate", "Position", "Template", "Result"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-[var(--text-secondary)] whitespace-nowrap"
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
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                      {fmt(l.sentAt)}
                    </td>
                    <td className="px-3 py-2 text-[12px] whitespace-nowrap">
                      <span className="text-[var(--text-primary)]">{l.contactName || "—"}</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        {l.contactEmail}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                      {l.jobName || "—"}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                      {l.templateName || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.status === "sent" ? (
                        <StatusBadge color="#059669" label="Delivered" />
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
