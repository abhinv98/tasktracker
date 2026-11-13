"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader, Button, EmptyState, SegmentedTabs, StatusBadge, SkeletonPageHeader, SkeletonTable, useToast,
} from "@/components/ui";
import { STAGES, OPEN_STAGES, stageMeta, type Stage } from "@/lib/recruitStages";
import {
  parseCtcLpa, formatLpa, parseYears, formatYears, parseNoticeDays, formatNotice,
} from "@/lib/recruitParse";
import { CandidatePanel } from "@/components/recruitment/CandidatePanel";
import { Users2, Search, SlidersHorizontal, X } from "lucide-react";

/**
 * Every candidate, across every position. The per-position view answers
 * "who applied for this role"; this answers "who do we know" — which is the
 * question when a role opens and someone good applied for a different one
 * six months ago.
 */
export default function AllCandidatesPage() {
  const jobs = useQuery(api.recruitment.listJobs);
  const stats = useQuery(api.recruitment.getStats);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<Stage | "" | "open">("open");
  const [jobFilter, setJobFilter] = useState<number | "">("");
  const [minYears, setMinYears] = useState("");
  const [maxExpected, setMaxExpected] = useState("");
  const [maxNotice, setMaxNotice] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<Id<"recruitCandidates"> | null>(null);

  // Search drives the server query; everything else narrows client-side so the
  // filters stay instant once results are on screen.
  const results = useQuery(
    api.recruitment.searchCandidates,
    q.trim().length >= 2 ? { search: q.trim(), limit: 300 } : "skip"
  );

  const rows = useMemo(() => {
    let list = (results ?? []).map((c) => ({
      c,
      years: parseYears(c.experience),
      expected: parseCtcLpa(c.expectedCtc),
      notice: parseNoticeDays(c.noticePeriod),
    }));
    if (stage === "open") {
      list = list.filter((r) => OPEN_STAGES.includes((r.c.stage ?? "applied") as Stage));
    } else if (stage) {
      list = list.filter((r) => (r.c.stage ?? "applied") === stage);
    }
    if (jobFilter !== "") list = list.filter((r) => r.c.jobSourceId === jobFilter);
    if (minYears) list = list.filter((r) => (r.years ?? -1) >= Number(minYears));
    if (maxExpected) list = list.filter((r) => r.expected != null && r.expected <= Number(maxExpected));
    if (maxNotice) list = list.filter((r) => r.notice != null && r.notice <= Number(maxNotice));
    return list;
  }, [results, stage, jobFilter, minYears, maxExpected, maxNotice]);

  const activeFilters =
    (jobFilter !== "" ? 1 : 0) + (minYears ? 1 : 0) + (maxExpected ? 1 : 0) + (maxNotice ? 1 : 0);

  if (jobs === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={6} what="candidates" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        title="All Candidates"
        subtitle={
          stats
            ? `${stats.totalCandidates.toLocaleString()} people across ${stats.totalJobs} positions`
            : "Search across every position"
        }
        icon={Users2}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[280px] max-w-[420px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or role…"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-9 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium border transition-colors ${
            activeFilters > 0
              ? "border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "border-[var(--border)] bg-white text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
          }`}
        >
          <SlidersHorizontal size={13} />
          Filters
          {activeFilters > 0 && (
            <span className="rounded-full bg-[var(--text-primary)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
              {activeFilters}
            </span>
          )}
        </button>

        <SegmentedTabs<Stage | "" | "open">
          value={stage}
          options={[{ value: "open", label: "In play" }, { value: "", label: "All" }, ...STAGES]}
          onChange={setStage}
          className="flex-wrap"
        />
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-white p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[var(--text-muted)]">Position</span>
            <select
              value={jobFilter === "" ? "" : String(jobFilter)}
              onChange={(e) => setJobFilter(e.target.value === "" ? "" : Number(e.target.value))}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">Any position</option>
              {jobs.map((j) => <option key={j._id} value={j.sourceId}>{j.name}</option>)}
            </select>
          </label>
          {[
            ["Min experience (yrs)", minYears, setMinYears, "e.g. 3"],
            ["Max expected (₹L)", maxExpected, setMaxExpected, "e.g. 8"],
            ["Max notice (days)", maxNotice, setMaxNotice, "e.g. 30"],
          ].map(([label, val, set, ph]) => (
            <label key={label as string} className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-[var(--text-muted)]">{label as string}</span>
              <input
                type="number"
                min="0"
                value={val as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
                placeholder={ph as string}
                className="w-[120px] rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
            </label>
          ))}
          {activeFilters > 0 && (
            <button
              onClick={() => { setJobFilter(""); setMinYears(""); setMaxExpected(""); setMaxNotice(""); }}
              className="pb-1.5 text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {q.trim().length < 2 ? (
        <EmptyState
          icon={Users2}
          title={`Search ${stats?.totalCandidates.toLocaleString() ?? "every"} candidates`}
          description="Type at least two characters. Useful when a role opens and you want someone who applied for a different one months ago."
        />
      ) : results === undefined ? (
        <SkeletonTable rows={6} cols={6} what="candidates" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try widening the stage or clearing a filter."
        />
      ) : (
        <>
          <p className="mb-2 text-[12px] tabular-nums text-[var(--text-muted)]">
            {rows.length} {rows.length === 1 ? "match" : "matches"}
          </p>
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                    {["Candidate", "Position", "Exp", "Expected", "Notice", "Stage"].map((h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap h-8 px-3 text-[12px] font-medium text-[var(--text-muted)] ${
                          // Numbers sit right, so their headings do too.
                          h === "Exp" || h === "Expected" || h === "Notice" ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, years, expected, notice }) => {
                    const meta = stageMeta((c.stage ?? "applied") as Stage);
                    const dash = <span className="text-[var(--text-disabled)]">—</span>;
                    return (
                      <tr key={c._id} className="border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-primary)]">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setOpenId(c._id)}
                            title={c.name}
                            className="block max-w-[220px] truncate text-left text-[13px] font-medium text-[var(--text-primary)] hover:underline underline-offset-2"
                          >
                            {c.name}
                          </button>
                          <span className="block max-w-[220px] truncate text-[12px] text-[var(--text-muted)]">
                            {c.email}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[13px] text-[var(--text-secondary)]">
                          {c.jobName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-[13px] tabular-nums text-[var(--text-secondary)]">
                          {years == null ? dash : formatYears(years)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-[13px] tabular-nums text-[var(--text-primary)]">
                          {expected == null ? dash : formatLpa(expected)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-[13px] tabular-nums text-[var(--text-secondary)]">
                          {notice == null ? dash : formatNotice(notice)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <StatusBadge color={meta.color} label={meta.label} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {openId && (
        <CandidatePanel
          candidateId={openId}
          onClose={() => setOpenId(null)}
          onOpenOther={(id) => setOpenId(id)}
        />
      )}
    </div>
  );
}
