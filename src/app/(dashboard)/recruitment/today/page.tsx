"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader, Panel, PanelEmpty, SkeletonCards, SkeletonPageHeader } from "@/components/ui";
import { HealthBadge, addDays, fmtDate, isMine, rowTitle, useHrData } from "@/components/recruitment/hrShared";
import { TRACKERS, TRACKER_KEYS } from "@/convex/lib/hrTrackers";
import { ATTENTION, health, tone, type Row } from "@/lib/hrHealth";

const ROW =
  "flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]";
/** The date behind an alert: the one that passed, not just any date on the row. */
function dueFor(row: Row, label: string): string {
  const pick = (...keys: string[]) => keys.map((k) => String(row.fields[k] ?? "")).find(Boolean) ?? "";
  if (row.tracker === "interviews") return label === "Interview overdue" ? pick("date") : pick("feedbackDue");
  if (row.tracker === "assignments") return label === "Review overdue" ? pick("reviewDue") : pick("submissionDue");
  if (row.tracker === "tasks") return label === "Overdue" ? pick("dueDate") : pick("nextDue", "dueDate");
  if (row.tracker === "campus") return pick("nextFollowUp");
  if (row.tracker === "interns") return pick("nextReview");
  if (row.tracker === "projects") return label === "Feedback overdue" ? pick("feedbackDue") : pick("nextDue");
  return pick("nextDue");
}

/** How many of one kind to list before pointing at its tracker. */
const SHOW = 6;

/**
 * The working day in recruitment: what is late or stuck, who is being
 * interviewed this week, and which roles have applications nobody has read.
 * Everything here is a link to the row it is about.
 */
export default function RecruitmentToday() {
  const data = useHrData();
  const jobs = useQuery(api.recruitment.listJobs);
  const router = useRouter();
  const [everyone, setEveryone] = useState<boolean | null>(null);

  if (!data) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonCards />
      </div>
    );
  }

  const { book, today } = data;
  const open = (row: Row) => router.push(`/recruitment/t/${row.tracker}?open=${row._id}`);
  // Everything that is late, stuck or missing its next date, worst first.
  const flagged = TRACKER_KEYS.flatMap((key) =>
    book[key].map((row) => ({ row, label: health(row, book, today) })).filter(({ label }) => ATTENTION[key].includes(label))
  ).sort((a, b) => Number(tone(b.label) === "bad") - Number(tone(a.label) === "bad"));
  const anyMine = flagged.some(({ row }) => isMine(row, data));
  // Until someone picks: your own list if you have one, otherwise everyone's.
  const all = everyone ?? !anyMine;
  const shown = flagged.filter(({ row }) => all || isMine(row, data));

  const week = addDays(today, 7);
  const interviews = book.interviews
    .filter((r) => r.fields.status === "Planned" && String(r.fields.date ?? "") >= today && String(r.fields.date ?? "") <= week)
    .filter((r) => all || isMine(r, data))
    .sort((a, b) => `${a.fields.date} ${a.fields.time ?? ""}`.localeCompare(`${b.fields.date} ${b.fields.time ?? ""}`));

  // Applications still sitting at Applied: in play, but nobody has moved them.
  const unread = (jobs ?? [])
    .filter((j) => j.parentSourceId == null)
    .map((j) => ({ id: j.sourceId, name: j.name, waiting: j.inPlay - j.moving }))
    .filter((j) => j.waiting > 0)
    .sort((a, b) => b.waiting - a.waiting);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Today"
        subtitle="What is late, stuck or waiting in recruitment. Click anything to open it."
        actions={
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
                className={`h-[26px] rounded-[7px] px-3 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                  all === value ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Needs attention" count={shown.length}>
          {shown.length === 0 ? (
            <PanelEmpty>
              {all ? "Nothing is late or stuck. " : "Nothing of yours is late or stuck. "}
              Rows show up here when a due date passes, an update is more than five days old, or a next step has no date.
            </PanelEmpty>
          ) : (
            TRACKER_KEYS.filter((key) => shown.some(({ row }) => row.tracker === key)).map((key) => {
              const mine = shown.filter(({ row }) => row.tracker === key);
              return (
                <section key={key} className="border-b border-[var(--border-subtle)] last:border-0">
                  <h3 className="flex items-baseline justify-between px-4 pb-1 pt-3 text-[12px] font-semibold text-[var(--text-secondary)]">
                    <span>
                      {TRACKERS[key].label} <span className="font-normal tabular-nums text-[var(--text-muted)]">{mine.length}</span>
                    </span>
                    {mine.length > SHOW && (
                      <Link href={`/recruitment/t/${key}`} className="font-medium text-[var(--accent-admin-text)] underline-offset-2 hover:underline">
                        See all
                      </Link>
                    )}
                  </h3>
                  <ul>
                    {mine.slice(0, SHOW).map(({ row, label }) => {
                      const due = dueFor(row, label);
                      return (
                        <li key={row._id}>
                          <button type="button" onClick={() => open(row)} className={ROW}>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                                {rowTitle(row, data) || row.code}
                              </span>
                              <span className="block truncate text-[12px] text-[var(--text-muted)]">
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
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Interviews in the next 7 days" count={interviews.length}>
            {interviews.length === 0 ? (
              <PanelEmpty>
                None planned. Open a candidate and use Schedule interview: the interviewer is told and gets a calendar invite.
              </PanelEmpty>
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
                        <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{rowTitle(row, data)}</span>
                        <span className="block truncate text-[12px] text-[var(--text-muted)]">
                          {[row.fields.round, data.personName(String(row.fields.interviewer ?? "")), row.fields.mode].filter(Boolean).join("  ·  ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Applications nobody has read" count={unread.reduce((sum, j) => sum + j.waiting, 0)}>
            {jobs === undefined ? (
              <PanelEmpty>Counting…</PanelEmpty>
            ) : unread.length === 0 ? (
              <PanelEmpty>Every application from the website has been looked at.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {unread.map((job) => (
                  <li key={job.id}>
                    <Link href={`/recruitment/${job.id}`} className={ROW}>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">{job.name}</span>
                      <span className="text-[13px] tabular-nums text-[var(--text-secondary)]">{job.waiting.toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
