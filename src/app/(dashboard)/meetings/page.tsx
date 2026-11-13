"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ArrowLeft, AudioLines } from "lucide-react";

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const length = (ms: number) => {
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/** My meetings, as recorded and written up by Echo (see EchoCard on the profile page). */
export default function MeetingsPage() {
  const meetings = useQuery(api.echo.listMine, {});
  const [openId, setOpenId] = useState<Id<"echoMeetings"> | null>(null);

  if (openId) return <MeetingDetail meetingId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Meetings"
        subtitle="Notes and action items from the meetings Echo recorded for you."
      />
      {meetings === undefined ? (
        <p className="text-[15px] text-[var(--text-secondary)]">Loading...</p>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={AudioLines}
          title="No meetings yet"
          description="Add Echo to your browser from your Profile. It records your Google Meet calls by itself and the notes show up here a few minutes after each call."
        />
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {meetings.map((m) => (
            <Card key={m._id} hover onClick={() => setOpenId(m._id)}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">{m.title}</h2>
                <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                  {when(m.startedAt)} · {length(m.durationMs)}
                </span>
              </div>
              {m.summary[0] && (
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">{m.summary[0]}</p>
              )}
              <p className="text-[12px] text-[var(--text-muted)] mt-2">
                {m.actionItems.length} action item{m.actionItems.length === 1 ? "" : "s"}
                {m.attendees.length > 0 && ` · ${m.attendees.map((a) => a.name).join(", ")}`}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-2">{title}</h2>
      {children}
    </Card>
  );
}

function MeetingDetail({
  meetingId,
  onBack,
}: {
  meetingId: Id<"echoMeetings">;
  onBack: () => void;
}) {
  const m = useQuery(api.echo.get, { meetingId });
  const people = m ? [...m.attendees.map((a) => a.name), ...m.seenNames] : [];

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All meetings
      </button>
      {m === undefined ? (
        <p className="text-[15px] text-[var(--text-secondary)]">Loading...</p>
      ) : m === null ? (
        <p className="text-[15px] text-[var(--text-secondary)]">This meeting is not available.</p>
      ) : (
        <>
          <PageHeader
            title={m.title}
            subtitle={`${when(m.startedAt)} · ${length(m.durationMs)}${
              people.length ? ` · ${[...new Set(people)].join(", ")}` : ""
            }`}
          />
          <Section title="Summary">
            <ul className="list-disc pl-5 text-[13px] text-[var(--text-primary)] flex flex-col gap-1">
              {m.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Section>
          <Section title={`Action items (${m.actionItems.length})`}>
            {m.actionItems.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">None found.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {m.actionItems.map((a, i) => (
                  <li key={i} className="py-2 first:pt-0 last:pb-0">
                    <p className="text-[13px] text-[var(--text-primary)]">{a.task}</p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                      {a.ownerName ?? "No owner yet"}
                      {(a.dueDate || a.dueText) && ` · due ${a.dueDate ?? a.dueText}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {m.decisions.length > 0 && (
            <Section title="Decisions">
              <ul className="list-disc pl-5 text-[13px] text-[var(--text-primary)] flex flex-col gap-1">
                {m.decisions.map((d, i) => (
                  <li key={i}>
                    {d.text}
                    {d.by && <span className="text-[var(--text-muted)]"> · {d.by}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {m.openQuestions.length > 0 && (
            <Section title="Open questions">
              <ul className="list-disc pl-5 text-[13px] text-[var(--text-primary)] flex flex-col gap-1">
                {m.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Section>
          )}
          {m.nextMeeting && (
            <Section title="Next meeting">
              <p className="text-[13px] text-[var(--text-primary)]">{m.nextMeeting}</p>
            </Section>
          )}
          <Section title="Transcript">
            <details>
              <summary className="text-[13px] text-[var(--text-secondary)] cursor-pointer">
                Show the full transcript
              </summary>
              <pre className="mt-3 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-primary)] font-sans">
                {m.transcript}
              </pre>
            </details>
          </Section>
        </>
      )}
    </div>
  );
}
