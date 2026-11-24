"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Briefcase, ListTodo } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, PageHeader, Panel, PanelEmpty, SkeletonCards, SkeletonPageHeader, StatStrip, StatTile, StatusBadge } from "@/components/ui";
import { AssignTaskModal } from "@/components/recruitment/AssignTask";
import { Decide, placesOf, useMoveApplicants, type Applicant } from "@/components/recruitment/ApplicantsTable";
import { CandidatePanel } from "@/components/recruitment/CandidatePanel";
import { OpenRoundModal } from "@/components/recruitment/OpenRound";
import { HealthBadge, addDays, fmtDate, isMine, rowTitle, useHrData } from "@/components/recruitment/hrShared";
import { TRACKERS, TRACKER_KEYS } from "@/convex/lib/hrTrackers";
import { ATTENTION, headline, health, radar, tone, type Row } from "@/lib/hrHealth";
import { formatLpa, formatYears, parseCtcLpa, parseYears } from "@/lib/recruitParse";
import { positionStatus } from "@/lib/recruitStages";
import { taskStatusMeta } from "@/lib/status";

const ROW =
  "flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]";
const MAIN = "block truncate text-[13px] font-medium text-[var(--text-primary)]";
const SUB = "block truncate text-[12px] text-[var(--text-muted)]";
/** How many of one kind to list before pointing at its own page. */
const SHOW = 5;

/** The date behind an alert: the one that passed, not just any date on the row. */
function dueFor(row: Row, label: string): string {
  const pick = (...keys: string[]) => keys.map((k) => String(row.fields[k] ?? "")).find(Boolean) ?? "";
  if (row.tracker === "interviews") return label === "Interview overdue" ? pick("date") : pick("feedbackDue");
  if (row.tracker === "assignments") return label === "Review overdue" ? pick("reviewDue") : pick("submissionDue");
  if (row.tracker === "campus") return pick("nextFollowUp");
  if (row.tracker === "interns") return pick("nextReview");
  if (row.tracker === "projects") return label === "Feedback overdue" ? pick("feedbackDue") : pick("nextDue");
  return pick("nextDue");
}

const ago = (ts: number) => {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/**
 * Where recruitment opens: the numbers, who just applied (decide on them right
 * here), what is late, who is being interviewed, who has which task. Every
 * number and line leads to the page behind it.
 */
export default function RecruitmentOverview() {
  const data = useHrData();
  const stats = useQuery(api.recruitment.getStats);
  const recent = useQuery(api.recruitment.recentApplicants, { limit: 8 });
  const tasks = useQuery(api.recruitTasks.open);
  const move = useMoveApplicants();
  const router = useRouter();
  const [everyone, setEveryone] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<{ id: Id<"recruitCandidates">; order: Id<"recruitCandidates">[] } | null>(null);
  const [dialog, setDialog] = useState<"round" | "task" | null>(null);

  if (!data || stats === undefined) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonCards />
      </div>
    );
  }

  const { book, today } = data;
  const top = headline(book, today);
  const places = placesOf(data);
  const open = (row: Row) => router.push(`/recruitment/t/${row.tracker === "rounds" ? "pipeline" : row.tracker}?open=${row._id}`);

  // Everything late, stuck or missing its next date, worst first.
  const flagged = TRACKER_KEYS.flatMap((key) =>
    book[key].map((row) => ({ row, label: health(row, book, today) })).filter(({ label }) => ATTENTION[key].includes(label))
  ).sort((a, b) => Number(tone(b.label) === "bad") - Number(tone(a.label) === "bad"));
  // Until someone picks: your own list if you have one, otherwise everyone's.
  const all = everyone ?? !flagged.some(({ row }) => isMine(row, data));
  const shown = flagged.filter(({ row }) => all || isMine(row, data));

  const week = addDays(today, 7);
  const interviews = book.interviews
    .filter((r) => r.fields.status === "Planned" && String(r.fields.date ?? "") >= today && String(r.fields.date ?? "") <= week)
    .sort((a, b) => `${a.fields.date} ${a.fields.time ?? ""}`.localeCompare(`${b.fields.date} ${b.fields.time ?? ""}`));
  const rounds = book.rounds
    .filter((r) => !String(r.fields.hiringStatus ?? "").startsWith("Closed"))
    .map((r) => ({ r, people: book.pipeline.filter((c) => c.fields.reqId === r._id && c.fields.status === "Active").length }))
    .sort((a, b) => Number(b.r.fields.hiringStatus === "Open") - Number(a.r.fields.hiringStatus === "Open") || b.people - a.people);
  const offers = book.offers.filter((r) => !["Declined", "Withdrawn"].includes(String(r.fields.stage ?? "")) && !r.fields.actualJoin).length;
  const lateTasks = (tasks ?? []).filter((t) => t.deadline !== null && t.deadline < Date.parse(`${today}T00:00:00+05:30`)).length;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Recruitment"
        subtitle="Who applied, who is moving and what is waiting on whom."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog("task")}>
              <ListTodo size={14} />
              Assign a task
            </Button>
            <Button onClick={() => setDialog("round")}>
              <Briefcase size={14} />
              Open a hiring round
            </Button>
          </>
        }
      />

      <StatStrip className="mb-4">
        <StatTile
          label="New applicants"
          value={(stats?.byStage.applied ?? 0).toLocaleString()}
          hint={`${stats?.thisWeek ?? 0} this week`}
          href="/recruitment/candidates?status=new"
        />
        <StatTile label="Candidates" value={top.activeCandidates} hint="Shortlisted and moving" href="/recruitment/t/pipeline" />
        <StatTile label="Interviews" value={interviews.length} hint="In the next 7 days" href="/recruitment/t/interviews" />
        <StatTile label="Offers" value={offers} hint="Out or being agreed" href="/recruitment/t/offers" />
        <StatTile
          label="Hiring rounds"
          value={rounds.length}
          hint={top.roundsToConfirm > 0 ? `${top.roundsToConfirm} to confirm` : "Open or on hold"}
          href="/recruitment/t/pipeline"
        />
        <StatTile label="Tasks" value={tasks?.length ?? "–"} hint={lateTasks ? `${lateTasks} late` : "Open"} bad={lateTasks > 0} href="#tasks" />
      </StatStrip>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Recent applicants" action={{ label: "All applicants", href: "/recruitment/candidates" }}>
            {recent === undefined ? (
              <PanelEmpty>Loading…</PanelEmpty>
            ) : recent.length === 0 ? (
              <PanelEmpty>Nobody has applied yet.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {recent.map((a) => {
                  const place = positionStatus(a.stage) === "shortlisted" ? places.get(a._id) : undefined;
                  return (
                    <li key={a._id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 hover:bg-[var(--bg-hover)]">
                      <button
                        type="button"
                        onClick={() => setPanel({ id: a._id, order: recent.map((r) => r._id) })}
                        className="min-w-[180px] flex-1 text-left focus:outline-none focus-visible:underline"
                      >
                        <span className={MAIN}>{a.name}</span>
                        <span className={SUB}>
                          {[
                            a.position || a.jobName,
                            formatYears(parseYears(a.experience)),
                            parseCtcLpa(a.expectedCtc) !== null && `wants ${formatLpa(parseCtcLpa(a.expectedCtc))}`,
                            a.createdAt && ago(a.createdAt),
                          ]
                            .filter(Boolean)
                            .join("  ·  ")}
                        </span>
                      </button>
                      {place && (
                        <Link
                          href={`/recruitment/t/pipeline?open=${place.id}`}
                          className="text-[12px] text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
                        >
                          On Candidates: {place.stage}
                        </Link>
                      )}
                      <Decide stage={a.stage} name={a.name} onMove={(to) => move([(a as Applicant)._id], to, a.name)} />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
              <Button variant="secondary" onClick={() => router.push("/recruitment/applicants")}>
                Positions
              </Button>
              <Button variant="secondary" onClick={() => router.push("/recruitment/t/pipeline?view=board")}>
                Candidates board
              </Button>
            </div>
          </Panel>

          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
            <div className="flex h-11 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text-primary)]">
                Needs attention
                <span className="font-normal tabular-nums text-[var(--text-muted)]">{shown.length}</span>
              </h2>
              <div role="group" aria-label="Whose work" className="flex rounded-control border border-[var(--border)] bg-white p-0.5">
                {(
                  [
                    [false, "Mine"],
                    [true, "Everyone"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={all === value}
                    onClick={() => setEveryone(value)}
                    className={`h-[24px] rounded-[7px] px-2.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                      all === value ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? (
              <PanelEmpty>
                {all ? "Nothing is late or stuck. " : "Nothing of yours is late or stuck. "}
                Rows show up here when a due date passes, an update is more than five days old, or a next step has no date.
              </PanelEmpty>
            ) : (
              TRACKER_KEYS.filter((key) => shown.some(({ row }) => row.tracker === key)).map((key) => {
                const these = shown.filter(({ row }) => row.tracker === key);
                return (
                  <section key={key} className="border-b border-[var(--border-subtle)] last:border-0">
                    <h3 className="flex items-baseline justify-between px-4 pb-1 pt-3 text-[12px] font-semibold text-[var(--text-secondary)]">
                      <span>
                        {TRACKERS[key].label} <span className="font-normal tabular-nums text-[var(--text-muted)]">{these.length}</span>
                      </span>
                      {these.length > SHOW && (
                        <Link href={`/recruitment/t/${key}`} className="font-medium text-[var(--accent-admin-text)] underline-offset-2 hover:underline">
                          See all
                        </Link>
                      )}
                    </h3>
                    <ul>
                      {these.slice(0, SHOW).map(({ row, label }) => {
                        const due = dueFor(row, label);
                        return (
                          <li key={row._id}>
                            <button type="button" onClick={() => open(row)} className={ROW}>
                              <span className="min-w-0 flex-1">
                                <span className={MAIN}>{rowTitle(row, data) || row.code}</span>
                                <span className={SUB}>
                                  {[row.code, row.fields.nextAction && String(row.fields.nextAction), due && `due ${fmtDate(due, today)}`]
                                    .filter(Boolean)
                                    .join("  ·  ")}
                                </span>
                              </span>
                              <HealthBadge label={label} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Interviews in the next 7 days" count={interviews.length} action={{ label: "Interviews", href: "/recruitment/t/interviews" }}>
            {interviews.length === 0 ? (
              <PanelEmpty>None planned. Open a candidate and use Schedule interview: the interviewer is told and gets a calendar invite.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {interviews.map((row) => (
                  <li key={row._id}>
                    <button type="button" onClick={() => open(row)} className={ROW}>
                      <span className="w-[86px] shrink-0 text-[12px] tabular-nums text-[var(--text-secondary)]">
                        {String(row.fields.date) === today ? "Today" : fmtDate(String(row.fields.date), today)}
                        {row.fields.time ? ` ${row.fields.time}` : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={MAIN}>{rowTitle(row, data)}</span>
                        <span className={SUB}>
                          {[row.fields.round, data.personName(String(row.fields.interviewer ?? "")), row.fields.mode].filter(Boolean).join("  ·  ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div id="tasks" className="scroll-mt-4">
            <Panel title="Tasks" count={tasks?.length} action={{ label: "Briefs", href: "/briefs" }}>
              {tasks === undefined ? (
                <PanelEmpty>Loading…</PanelEmpty>
              ) : tasks.length === 0 ? (
                <PanelEmpty>None open. Assign one here or from a candidate; it goes into that person&apos;s own task list.</PanelEmpty>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {tasks.slice(0, 10).map((t) => (
                    <li key={t._id}>
                      <Link href={`/brief/${t.briefId}?task=${t._id}&returnTo=/recruitment/overview`} className={ROW}>
                        <span className="min-w-0 flex-1">
                          <span className={MAIN}>{t.title}</span>
                          <span className={SUB}>
                            {[t.candidate, t.assignee, t.deadline && `due ${fmtDate(new Date(t.deadline + 5.5 * 3_600_000).toISOString().slice(0, 10), today)}`]
                              .filter(Boolean)
                              .join("  ·  ")}
                          </span>
                        </span>
                        <StatusBadge color={taskStatusMeta(t.status).dot} label={taskStatusMeta(t.status).label} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Hiring rounds" count={rounds.length} action={{ label: "Candidates", href: "/recruitment/t/pipeline" }}>
            {rounds.length === 0 ? (
              <PanelEmpty>None open. Open a hiring round above, or from a position.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {rounds.slice(0, 8).map(({ r, people }) => (
                  <li key={r._id}>
                    <Link href={`/recruitment/t/pipeline?view=board&reqId=${r._id}`} className={ROW}>
                      <span className="min-w-0 flex-1">
                        <span className={MAIN}>{String(r.fields.role ?? "")}</span>
                        <span className={SUB}>{[r.code, r.fields.hiringStatus, !r.fields.job && "not tied to a position yet"].filter(Boolean).join("  ·  ")}</span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-secondary)]">
                        {people} {people === 1 ? "candidate" : "candidates"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.full && (
            <Panel title="Everything HR runs">
              <ul className="divide-y divide-[var(--border-subtle)]">
                {radar(book, today).map((line) => (
                  <li key={line.key}>
                    <Link href={`/recruitment/t/${line.key}`} title={line.check} className={ROW}>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">{line.label}</span>
                      <span className="w-16 text-right text-[12px] tabular-nums text-[var(--text-muted)]">{line.open} open</span>
                      <span
                        className={`w-20 text-right text-[12px] tabular-nums ${line.attention > 0 ? "font-semibold text-[var(--danger)]" : "text-[var(--text-disabled)]"}`}
                      >
                        {line.attention > 0 ? `${line.attention} stuck` : "fine"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {panel && (
        <CandidatePanel
          candidateId={panel.id}
          order={panel.order}
          onGo={(id) => setPanel((p) => p && { ...p, id })}
          onClose={() => setPanel(null)}
          onOpenOther={(id) => setPanel((p) => p && { ...p, id })}
        />
      )}
      {dialog === "round" && <OpenRoundModal data={data} onClose={() => setDialog(null)} />}
      {dialog === "task" && <AssignTaskModal data={data} onClose={() => setDialog(null)} />}
    </div>
  );
}
