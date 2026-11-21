"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, SkeletonCards, SkeletonPageHeader } from "@/components/ui";
import { ChartCard, SparkStat } from "@/components/ui/Charts";
import { HealthBadge, fmtDate, useHrData } from "@/components/recruitment/hrShared";
import { derived, headline, health, radar } from "@/lib/hrHealth";

const TH = "whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium text-[var(--text-muted)]";
const TD = "px-3 py-2 text-[13px]";
const NUM = `${TD} text-right tabular-nums`;

/**
 * The founders' command centre: the first tab of the recruitment workbook.
 * Nothing is typed here; every number comes from the trackers.
 */
export default function RecruitmentOverview() {
  const data = useHrData();
  const router = useRouter();

  // The dashboard is for HR and super admins. Anyone with delegated access
  // works from the hiring rounds.
  useEffect(() => {
    if (data && !data.full) router.replace("/recruitment/today");
  }, [data, router]);

  if (!data || !data.full) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonCards />
      </div>
    );
  }

  const { book, today } = data;
  const top = headline(book, today);
  const lines = radar(book, today);
  const logAge = top.lastLog ? Math.round((Date.parse(today) - Date.parse(top.lastLog)) / 86_400_000) : null;
  const open = (tracker: string, id?: string) => router.push(`/recruitment/t/${tracker}${id ? `?open=${id}` : ""}`);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Overview"
        subtitle="What is open, what needs attention and who is waiting on whom. HR updates the trackers; this page adds them up."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SparkStat label="Active hiring cycles" value={top.activeCycles} hint="Open or on hold" />
        <SparkStat label="Vacant seats" value={top.vacantSeats} hint="Across those rounds" />
        <SparkStat label="Verified active candidates" value={top.activeCandidates} hint="Excludes unverified history" />
        <SparkStat label="Approvals waiting" value={top.approvals} hint="Waiting on a decision" bad={top.approvals > 0} />
        <SparkStat
          label="Latest HR log entry"
          value={top.lastLog ? fmtDate(top.lastLog, today) : "Not logged"}
          hint={logAge === null ? "HR logs at end of day" : logAge <= 1 ? "Up to date" : `${logAge} days ago`}
          bad={logAge === null || logAge > 1}
        />
      </div>

      {(top.roundsToConfirm > 0 || top.candidatesToVerify > 0) && (
        <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--warning-dim)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
          <span className="font-medium">Import check.</span>{" "}
          <Link href="/recruitment/t/rounds" className="underline underline-offset-2">
            {top.roundsToConfirm} hiring {top.roundsToConfirm === 1 ? "round needs its" : "rounds need their"} status confirmed
          </Link>{" "}
          and{" "}
          <Link href="/recruitment/t/pipeline" className="underline underline-offset-2">
            {top.candidatesToVerify} {top.candidatesToVerify === 1 ? "candidate needs" : "candidates need"} checking by HR
          </Link>
          . Until then they are not counted as live.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <ChartCard title="Activity and bottlenecks" description="One line per workstream. Click a line to open its tracker.">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={TH}>Workstream</th>
                  <th className={`${TH} text-right`}>Open</th>
                  <th className={`${TH} text-right`}>Needs attention</th>
                  <th className={`${TH} hidden md:table-cell`}>What to check</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.key}
                    tabIndex={0}
                    onClick={() => open(line.key)}
                    onKeyDown={(e) => e.key === "Enter" && open(line.key)}
                    className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                  >
                    <td className={`${TD} font-medium text-[var(--text-primary)]`}>{line.label}</td>
                    <td className={`${NUM} text-[var(--text-primary)]`}>{line.open}</td>
                    <td className={`${NUM} ${line.attention > 0 ? "font-semibold text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                      {line.attention}
                    </td>
                    <td className={`${TD} hidden text-[var(--text-muted)] md:table-cell`}>{line.check}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="HR processes" description="Long-running work that must keep moving even during peak hiring.">
          {book.projects.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">No HR projects yet.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Process</th>
                    <th className={TH}>Stage</th>
                    <th className={TH}>Owner</th>
                    <th className={TH}>Next due</th>
                    <th className={TH}>Health</th>
                  </tr>
                </thead>
                <tbody>
                  {book.projects.map((p) => (
                    <tr
                      key={p._id}
                      tabIndex={0}
                      onClick={() => open("projects", p._id)}
                      onKeyDown={(e) => e.key === "Enter" && open("projects", p._id)}
                      className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                    >
                      <td className={`${TD} font-medium text-[var(--text-primary)]`}>{String(p.fields.name ?? "")}</td>
                      <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{String(p.fields.stage ?? "–")}</td>
                      <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>
                        {data.personName(String(p.fields.owner ?? "")) || "–"}
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums text-[var(--text-secondary)]`}>
                        {p.fields.nextDue ? fmtDate(String(p.fields.nextDue), today) : "–"}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <HealthBadge label={health(p, book, today)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        className="mt-4"
        title="Hiring rounds"
        description="Each row is one hiring cycle. A blocker, where there is one, replaces the health label."
      >
        {book.rounds.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">No hiring rounds yet.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={TH}>Req ID</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Seats</th>
                  <th className={`${TH} text-right`}>Left</th>
                  <th className={`${TH} text-right`}>Verified</th>
                  <th className={`${TH} text-right`}>Interviews</th>
                  <th className={TH}>Next due</th>
                  <th className={TH}>Health / blocker</th>
                </tr>
              </thead>
              <tbody>
                {book.rounds.map((r) => {
                  const d = Object.fromEntries(derived(r, book, today).map((x) => [x.label, x.value]));
                  return (
                    <tr
                      key={r._id}
                      tabIndex={0}
                      onClick={() => open("rounds", r._id)}
                      onKeyDown={(e) => e.key === "Enter" && open("rounds", r._id)}
                      className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                    >
                      <td className={`${TD} whitespace-nowrap tabular-nums text-[var(--text-muted)]`}>{r.code}</td>
                      <td className={`${TD} font-medium text-[var(--text-primary)]`}>{String(r.fields.role ?? "")}</td>
                      <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{String(r.fields.hiringStatus ?? "–")}</td>
                      <td className={NUM}>{r.fields.openings ?? "–"}</td>
                      <td className={NUM}>{d["Vacancies left"]}</td>
                      <td className={NUM}>{d["Verified candidates"]}</td>
                      <td className={NUM}>{d["Interviews completed"]}</td>
                      <td className={`${TD} whitespace-nowrap tabular-nums text-[var(--text-secondary)]`}>
                        {r.fields.nextDue ? fmtDate(String(r.fields.nextDue), today) : "–"}
                      </td>
                      <td className={`${TD} max-w-[280px]`}>
                        {r.fields.blocker ? (
                          <span className="line-clamp-2 text-[var(--danger)]">{String(r.fields.blocker)}</span>
                        ) : (
                          <HealthBadge label={health(r, book, today)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
