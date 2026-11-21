"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { AudioLines } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Card, EmptyState, PageHeader, SkeletonList, SkeletonPageHeader } from "@/components/ui";
import { MeetingDetail, meetingLength, meetingWhen } from "@/components/meetings/MeetingDetail";

/**
 * Interviews and hiring calls that their recorder chose to put into
 * Recruitment, under a position. Nothing lands here by itself.
 */
export default function RecruitmentMeetingsPage() {
  const meetings = useQuery(api.echo.listRecruit, {});
  const [openId, setOpenId] = useState<Id<"echoMeetings"> | null>(null);

  if (openId) return <MeetingDetail meetingId={openId} onBack={() => setOpenId(null)} backLabel="Recruitment meetings" />;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Meetings"
        subtitle="Interviews and hiring calls recorded by Echo and filed under a position. To add one, open it in your own Meetings and pick the position under Recruitment folder."
      />
      {meetings === undefined ? (
        <>
          <SkeletonPageHeader />
          <SkeletonList rows={4} what="meetings" />
        </>
      ) : !meetings || meetings.length === 0 ? (
        <EmptyState
          icon={AudioLines}
          title="No meetings filed yet"
          description="When someone files a recorded interview under a position, its notes and recording show up here."
        />
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          {meetings.map((m) => (
            <Card key={m._id} hover onClick={() => setOpenId(m._id)}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{m.title}</h2>
                <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                  {meetingWhen(m.startedAt)} · {meetingLength(m.durationMs)}
                </span>
              </div>
              {m.firstLine && <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{m.firstLine}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-muted)]">
                <Badge variant="employee">{m.jobName}</Badge>
                <span>Recorded by {m.recordedBy}</span>
                <span>
                  · {m.actionItems} action item{m.actionItems === 1 ? "" : "s"}
                </span>
                {m.people.length > 0 && <span>· {m.people.join(", ")}</span>}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
