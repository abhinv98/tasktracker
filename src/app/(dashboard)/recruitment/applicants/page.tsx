"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, PageHeader, Panel, SkeletonPageHeader, SkeletonTable, StatStrip, StatTile, useToast } from "@/components/ui";
import { SearchField } from "@/components/ui/Tray";
import { CandidatePanel } from "@/components/recruitment/CandidatePanel";
import { useLast } from "@/components/recruitment/ApplicantsTable";
import { Rounds } from "@/components/recruitment/OpenRound";
import { useHrData } from "@/components/recruitment/hrShared";
import { POSITION_STATUSES, positionStatus } from "@/lib/recruitStages";

const COUNTS = [
  ["fresh", "New", "new"],
  ["shortlisted", "Shortlisted", "shortlisted"],
  ["onHold", "On hold", "on_hold"],
  ["rejected", "Rejected", "rejected"],
] as const;

/**
 * The roles people apply for on ecultify.com, and where their applications
 * stand. A number opens the position at that list; a hiring round can be opened
 * from here as well.
 */
export default function PositionsPage() {
  const router = useRouter();
  const jobs = useQuery(api.recruitment.listJobs);
  const data = useHrData();
  const setJobOpen = useMutation(api.recruitment.setJobOpen);
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [panel, setPanel] = useState<Id<"recruitCandidates"> | null>(null);
  const needle = q.trim().toLowerCase();
  const people = useLast(useQuery(api.recruitment.searchCandidates, needle.length >= 2 ? { search: needle, limit: 12 } : "skip"));

  if (jobs === undefined) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={6} what="positions" />
      </div>
    );
  }

  // Opening and closing a role on the website is HR's call.
  const full = data?.full === true;
  type Job = (typeof jobs)[number];
  const isRole = (j: Job) => j.parentSourceId != null && jobs.some((p) => p.sourceId === j.parentSourceId);
  const hit = (j: Job) => !needle || j.name.toLowerCase().includes(needle);
  const roles = jobs.filter(isRole);
  // A position, then the roles under it. Whoever has people waiting comes first.
  const positions = jobs
    .filter((j) => !isRole(j))
    .filter((j) => hit(j) || roles.some((s) => s.parentSourceId === j.sourceId && hit(s)))
    .sort((a, b) => b.fresh - a.fresh || b.total - a.total);
  const sum = (key: (typeof COUNTS)[number][0]) => jobs.reduce((n, j) => n + j[key], 0);
  /** A role's applicants are filed under its position: that page, narrowed to the role. */
  const entry = (j: Job, more = "") => {
    const q = [isRole(j) ? `role=${encodeURIComponent(j.name)}` : "", more].filter(Boolean).join("&");
    return `/recruitment/${isRole(j) ? j.parentSourceId : j.sourceId}${q ? `?${q}` : ""}`;
  };

  const cells = (j: Job) =>
    COUNTS.map(([key, label, status]) => (
      <td key={key} className="px-1 py-1 text-right">
        {j[key] > 0 ? (
          <Link
            href={entry(j, `status=${status}`)}
            aria-label={`${j.name}: ${j[key]} ${label.toLowerCase()}`}
            onClick={(e) => e.stopPropagation()}
            className={`inline-block min-w-[44px] rounded-md px-2 py-1 text-[13px] tabular-nums hover:bg-[var(--bg-hover)] ${
              key === "fresh" ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
            }`}
          >
            {j[key].toLocaleString()}
          </Link>
        ) : (
          <span className="px-2 text-[13px] text-[var(--text-disabled)]">–</span>
        )}
      </td>
    ));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Positions"
        subtitle="Everyone who applied on ecultify.com, by position. Shortlist, hold or reject here; shortlisted people carry on under Candidates."
        actions={
          full && (
            <Button onClick={() => router.push("/recruitment/setup?new=position")}>
              <Plus size={14} />
              New position
            </Button>
          )
        }
      />

      <StatStrip className="mb-4">
        {COUNTS.map(([key, label, status]) => (
          <StatTile key={key} label={label} value={sum(key).toLocaleString()} href={`/recruitment/candidates?status=${status}`} />
        ))}
      </StatStrip>

      <div className="mb-4 flex">
        <SearchField value={q} onChange={setQ} placeholder="A position, or anyone's name, email or phone" label="Search positions and people" className="sm:!max-w-md" />
      </div>

      {needle.length >= 2 && people && people.length > 0 && (
        <Panel title="People" count={people.length} action={{ label: "See all", href: `/recruitment/candidates?q=${encodeURIComponent(q.trim())}` }} className="mb-4">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {people.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => setPanel(p._id)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{p.name}</span>
                    <span className="block truncate text-[12px] text-[var(--text-muted)]">{[p.email, p.number].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-[var(--text-secondary)]">
                    {p.position || p.jobName}
                    <span className="block text-[var(--text-muted)]">
                      {POSITION_STATUSES.find((s) => s.value === positionStatus(p.stage))?.label}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {positions.length === 0 ? (
        <EmptyState
          title={jobs.length === 0 ? "No positions yet" : "No position by that name"}
          description={jobs.length === 0 ? "HR can give you the ones you are hiring for, under HR Office, Access." : people?.length ? "The people above match, though." : "Nobody by that name either. Try fewer letters."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)] text-[12px] text-[var(--text-muted)]">
                <th className="h-8 px-4 text-left font-medium">Position</th>
                {COUNTS.map(([key, label]) => (
                  <th key={key} className="whitespace-nowrap px-3 text-right font-medium">
                    {label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 text-left font-medium">Hiring rounds</th>
                {full && <th className="whitespace-nowrap px-4 text-right font-medium">On the website</th>}
              </tr>
            </thead>
            <tbody>
              {positions.map((job) => {
                const subs = roles.filter((s) => s.parentSourceId === job.sourceId && (hit(s) || hit(job)));
                const shown = open.has(job.sourceId) || (!!needle && !job.name.toLowerCase().includes(needle));
                const closed = job.status === "closed";
                return (
                  <Fragment key={job._id}>
                    <tr
                      onClick={() => router.push(entry(job))}
                      className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-primary)]"
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {subs.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={shown}
                              aria-label={`${shown ? "Hide" : "Show"} roles under ${job.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen((was) => {
                                  const next = new Set(was);
                                  if (!next.delete(job.sourceId)) next.add(job.sourceId);
                                  return next;
                                });
                              }}
                              className="-ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                            >
                              {shown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                          <Link
                            href={entry(job)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[14px] font-medium text-[var(--text-primary)] underline-offset-2 first-letter:uppercase hover:underline"
                          >
                            {job.name}
                          </Link>
                        </span>
                        <span className="block text-[12px] tabular-nums text-[var(--text-muted)]">
                          {job.total.toLocaleString()} in all
                          {job.lastApplied > 0 &&
                            `, last one ${new Date(job.lastApplied).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        </span>
                      </td>
                      {cells(job)}
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Rounds data={data} job={job} />
                      </td>
                      {full && (
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!closed}
                            aria-label={`${job.name}: take applications on the website`}
                            onClick={() =>
                              setJobOpen({ jobId: job._id, open: closed }).catch((err) =>
                                toast("error", err instanceof Error ? err.message : "Could not change it")
                              )
                            }
                            className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors ${
                              closed
                                ? "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                                : "border-[var(--accent-employee)] bg-[var(--accent-employee-dim)] text-[var(--accent-employee-text)]"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${closed ? "bg-[var(--text-disabled)]" : "bg-[var(--accent-employee)]"}`} aria-hidden />
                            {closed ? "Closed" : "Open"}
                          </button>
                        </td>
                      )}
                    </tr>
                    {shown &&
                      subs.map((s) => (
                        <tr
                          key={s._id}
                          onClick={() => router.push(entry(s))}
                          className="cursor-pointer border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] last:border-0 hover:bg-[var(--bg-hover)]"
                        >
                          <td className="py-2 pl-9 pr-4">
                            <span className="mr-2 inline-block h-3 w-3 rounded-bl border-b border-l border-[var(--border-strong)]" aria-hidden />
                            <Link href={entry(s)} onClick={(e) => e.stopPropagation()} className="text-[13px] text-[var(--text-secondary)] hover:underline">
                              {s.name}
                            </Link>
                          </td>
                          {cells(s)}
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <Rounds data={data} job={s} />
                          </td>
                          {full && <td />}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panel && (
        <CandidatePanel
          candidateId={panel}
          order={(people ?? []).map((p) => p._id)}
          onGo={(id) => setPanel((p) => p && id)}
          onClose={() => setPanel(null)}
          onOpenOther={setPanel}
        />
      )}
    </div>
  );
}
