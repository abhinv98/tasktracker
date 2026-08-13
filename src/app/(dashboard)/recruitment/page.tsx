"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  Button,
  SkeletonPageHeader,
  SkeletonList,
} from "@/components/ui";
import {
  UserSearch,
  Search,
  ChevronRight,
  Mail,
  FileText,
  Megaphone,
  X,
} from "lucide-react";

export default function RecruitmentPage() {
  const router = useRouter();
  const jobs = useQuery(api.recruitment.listJobs);
  const stats = useQuery(api.recruitment.getStats);
  const [q, setQ] = useState("");
  const results = useQuery(
    api.recruitment.searchCandidates,
    q.trim().length >= 2 ? { search: q.trim(), limit: 12 } : "skip"
  );

  if (jobs === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonList rows={6} what="open positions" />
      </div>
    );
  }

  const parents = jobs.filter((j) => j.parentSourceId == null);

  return (
    <div className="p-8">
      <PageHeader
        title="Recruitment"
        subtitle="Open positions, candidates and outreach"
        icon={UserSearch}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/recruitment/campaigns">
              <Button variant="secondary">
                <Megaphone size={14} />
                Campaigns
              </Button>
            </Link>
            <Link href="/recruitment/templates">
              <Button variant="secondary">
                <FileText size={14} />
                Templates
              </Button>
            </Link>
            <Link href="/recruitment/activity">
              <Button variant="secondary">
                <Mail size={14} />
                Email activity
              </Button>
            </Link>
          </div>
        }
      />

      {/* Reference counts, kept quiet — the positions below are the work. */}
      {stats && (
        <div className="mb-6 flex flex-wrap items-stretch divide-x divide-[var(--border-subtle)] rounded-lg border border-[var(--border)] bg-white">
          {[
            { label: "Candidates", value: stats.totalCandidates },
            { label: "Active", value: stats.byStatus.active ?? 0 },
            { label: "Rejected", value: stats.byStatus.rejected ?? 0 },
            { label: "Positions", value: stats.totalJobs },
            { label: "Emails sent", value: stats.emailsSent },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 min-w-[120px] px-4 py-3">
              <p className="text-[15px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">
                {value.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Global candidate search */}
      <div className="relative mb-6 max-w-[460px]">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search every candidate by name, email or role…"
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg pl-9 pr-8 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        )}

        {q.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-white shadow-lg overflow-hidden max-h-[320px] overflow-y-auto">
            {results === undefined ? (
              <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">
                No candidate matches “{q.trim()}”
              </p>
            ) : (
              results.map((r) => (
                <button
                  key={r._id}
                  onClick={() =>
                    router.push(`/recruitment/${r.jobSourceId}?highlight=${r._id}`)
                  }
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                      {r.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {r.email}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--text-secondary)]">
                    {r.position || r.jobName}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Positions — sub-positions nested under their parent */}
      <div className="flex flex-col gap-2">
        {parents.map((job) => {
          const subs = jobs.filter((j) => j.parentSourceId === job.sourceId);
          return (
            <div
              key={job._id}
              className="rounded-lg border border-[var(--border)] bg-white overflow-hidden"
            >
              <Link
                href={`/recruitment/${job.sourceId}`}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <span className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                  {job.name}
                </span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                  {job.total} candidate{job.total === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  {job.active > 0 && (
                    <span className="text-[11px] font-medium text-[var(--accent-employee-text)] tabular-nums">
                      {job.active} active
                    </span>
                  )}
                  {job.rejected > 0 && (
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {job.rejected} rejected
                    </span>
                  )}
                  <ChevronRight
                    size={15}
                    className="text-[var(--text-disabled)] group-hover:text-[var(--accent-admin-text)] group-hover:translate-x-0.5 transition-all"
                  />
                </div>
              </Link>

              {subs.length > 0 && (
                <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--bg-primary)]">
                  {subs.map((s) => (
                    <Link
                      key={s._id}
                      href={`/recruitment/${s.sourceId}`}
                      className="group flex items-center gap-3 pl-9 pr-4 py-2 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <span className="text-[12px] text-[var(--text-secondary)] truncate">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {s.total}
                      </span>
                      <ChevronRight
                        size={13}
                        className="ml-auto text-[var(--text-disabled)] group-hover:text-[var(--accent-admin-text)] transition-colors"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stats && stats.undated > 0 && (
        <p className="mt-6 text-[11px] text-[var(--text-muted)]">
          {stats.undated.toLocaleString()} candidates were imported from the older
          application form and carry no submission date, so date filters only
          cover the {(stats.totalCandidates - stats.undated).toLocaleString()} newer records.
        </p>
      )}
    </div>
  );
}
