"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { MeetingDetail, meetingLength as length, meetingWhen as when } from "@/components/meetings/MeetingDetail";
import { AudioLines } from "lucide-react";

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
                {m.brandName && (
                  <span className="text-[var(--text-secondary)] font-medium">{m.brandName} · </span>
                )}
                {m.recordedBy && <span>Recorded by {m.recordedBy} · </span>}
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
