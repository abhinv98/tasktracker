"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  SkeletonPageHeader,
  SkeletonList,
  StatStrip,
  StatTile,
} from "@/components/ui";
import {
  UserSearch,
  Search,
  ChevronRight,
  X,
} from "lucide-react";

export default function RecruitmentPage() {
  const router = useRouter();
  const jobs = useQuery(api.recruitment.listJobs);
  const stats = useQuery(api.recruitment.getStats);
  const setJobOpen = useMutation(api.recruitment.setJobOpen);
  // Opening and closing a role on the website is HR's call.
  const me = useQuery(api.users.getCurrentUser);
  const full = me?.isHR === true || me?.isSuperAdmin === true;
  const [q, setQ] = useState("");
  const results = useQuery(
    api.recruitment.searchCandidates,
    q.trim().length >= 2 ? { search: q.trim(), limit: 12 } : "skip"
  );

  if (jobs === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonList rows={6} what="positions" />
      </div>
    );
  }

  const parents = jobs.filter((j) => j.parentSourceId == null);

  return (
    <div className="p-8">
      <PageHeader
        title="Positions"
        subtitle="Everyone who applied through the form on ecultify.com, by position. Open a position and shortlist people: they go straight to Candidates."
        icon={UserSearch}
      />

      {/* Reference counts, kept quiet — the positions below are the work. */}
      {stats && (
        <StatStrip className="mb-4">
          {/* The funnel, not a pile of totals — this answers "where is everyone". */}
          {[
            { label: "Applied", value: stats.byStage?.applied ?? 0 },
            { label: "Shortlisted", value: stats.byStage?.screened ?? 0 },
            { label: "On hold", value: stats.byStage?.on_hold ?? 0 },
            { label: "Rejected", value: stats.byStage?.rejected ?? 0 },
          ].map(({ label, value }) => (
            <StatTile key={label} label={label} value={value.toLocaleString()} />
          ))}
        </StatStrip>
      )}

      {/* Global candidate search */}
      <div className="relative mb-4 max-w-[460px]">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search every candidate by name, email or role…"
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md pl-9 pr-8 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
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
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                      {r.name}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)] truncate">
                      {r.email}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
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
              <div className="flex items-center">
              <Link
                href={`/recruitment/${job.sourceId}`}
                className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-[var(--bg-primary)] transition-colors"
              >
                <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                  {job.name}
                </span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                  {job.total} candidate{job.total === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  {job.moving > 0 && (
                    <span className="text-[12px] font-medium text-[var(--text-primary)] tabular-nums">
                      {job.moving} moving
                    </span>
                  )}
                  {job.inPlay > 0 ? (
                    <span className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                      {job.inPlay} in play
                    </span>
                  ) : (
                    <span className="text-[12px] text-[var(--text-muted)]">all closed out</span>
                  )}
                  <ChevronRight
                    size={15}
                    className="text-[var(--text-disabled)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-[color,transform]"
                  />
                </div>
              </Link>
              {/* Whether the website form offers this role (and its sub-roles). */}
              {full && <button
                type="button"
                role="switch"
                aria-checked={job.status !== "closed"}
                aria-label={`${job.name}: accept applications on the website`}
                title={job.status === "closed" ? "Closed: not on the website form" : "Open: on the website form"}
                onClick={() => setJobOpen({ jobId: job._id, open: job.status === "closed" })}
                className={`mr-3 inline-flex h-control shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-[12px] font-medium transition-colors ${
                  job.status === "closed"
                    ? "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    : "border-[var(--accent-employee)] bg-[var(--accent-employee-dim)] text-[var(--accent-employee-text)]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${job.status === "closed" ? "bg-[var(--text-disabled)]" : "bg-[var(--accent-employee)]"}`}
                  aria-hidden
                />
                {job.status === "closed" ? "Closed" : "Open"}
              </button>}
              </div>

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
                      <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                        {s.total}
                      </span>
                      <ChevronRight
                        size={13}
                        className="ml-auto text-[var(--text-disabled)] group-hover:text-[var(--text-primary)] transition-colors"
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
        <p className="mt-4 text-[12px] text-[var(--text-muted)]">
          {stats.undated.toLocaleString()} candidates were imported from the older
          application form and carry no submission date, so date filters only
          cover the {(stats.totalCandidates - stats.undated).toLocaleString()} newer records.
        </p>
      )}
    </div>
  );
}
