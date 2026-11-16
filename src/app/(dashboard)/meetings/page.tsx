"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, EmptyState, PageHeader, Panel, PanelEmpty, Select, useToast } from "@/components/ui";
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

/** One block of the notes: the shared panel frame with padded content. */
function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Panel title={title} count={count}>
      <div className="px-4 py-3.5">{children}</div>
    </Panel>
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
  const brands = useQuery(api.echo.brandOptions, {});
  const setBrand = useMutation(api.echo.setBrand);
  const removeViewer = useMutation(api.echo.removeViewer);
  const recordingUrl = useAction(api.echo.recordingUrl);
  const { toast } = useToast();
  const audio = useRef<HTMLAudioElement>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const people = m ? [...m.attendees.map((a) => a.name), ...m.seenNames] : [];

  /** Loads the recording (the link is made on demand and expires) and plays it from `seconds`. */
  const play = async (seconds = 0) => {
    const el = audio.current;
    if (!el) return;
    if (!recording) {
      const src = await recordingUrl({ meetingId }).catch(() => null);
      if (!src) return toast("error", "The recording is not available");
      el.src = src;
      setRecording(src);
    }
    const start = () => {
      el.currentTime = seconds;
      void el.play();
    };
    if (el.readyState >= 1) start();
    else el.addEventListener("loadedmetadata", start, { once: true });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All meetings
      </button>
      {m === undefined ? (
        <p className="text-[13px] text-[var(--text-secondary)]">Loading...</p>
      ) : m === null ? (
        <p className="text-[13px] text-[var(--text-secondary)]">This meeting is not available.</p>
      ) : (
        <>
          <PageHeader title={m.title} subtitle={`${when(m.startedAt)} · ${length(m.durationMs)}`} />
          {/* The notes on the left; who, where it is filed, and the recording
              with its transcript beside them, so a line can be played while
              reading the summary. Below xl the rail stacks under the notes. */}
          <div className="grid gap-4 xl:grid-cols-5 items-start">
            <div className="min-w-0 flex flex-col gap-4 xl:col-span-3">
              <Section title="Summary">
                <ul className="list-disc pl-5 text-[13px] leading-relaxed text-[var(--text-primary)] flex flex-col gap-1.5">
                  {m.summary.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Section>
              <Panel title="Action items" count={m.actionItems.length}>
                {m.actionItems.length === 0 ? (
                  <PanelEmpty>None found.</PanelEmpty>
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {m.actionItems.map((a, i) => (
                      <li key={i} className="px-4 py-3">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{a.task}</p>
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                          {a.ownerName ?? "No owner yet"}
                          {(a.dueDate || a.dueText) && ` · due ${a.dueDate ?? a.dueText}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              {m.decisions.length > 0 && (
                <Section title="Decisions" count={m.decisions.length}>
                  <ul className="list-disc pl-5 text-[13px] leading-relaxed text-[var(--text-primary)] flex flex-col gap-1.5">
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
                <Section title="Open questions" count={m.openQuestions.length}>
                  <ul className="list-disc pl-5 text-[13px] leading-relaxed text-[var(--text-primary)] flex flex-col gap-1.5">
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
            </div>

            <aside className="min-w-0 flex flex-col gap-4 xl:col-span-2">
              <Panel title="Details">
                <dl className="px-4 py-3.5 grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-[13px]">
                  <dt className="text-[var(--text-muted)]">When</dt>
                  <dd className="text-[var(--text-primary)]">{when(m.startedAt)}</dd>
                  <dt className="text-[var(--text-muted)]">Length</dt>
                  <dd className="text-[var(--text-primary)] tabular-nums">{length(m.durationMs)}</dd>
                  <dt className="text-[var(--text-muted)]">People</dt>
                  <dd className="text-[var(--text-primary)]">
                    {people.length ? [...new Set(people)].join(", ") : "Not known"}
                  </dd>
                  {m.recordedBy && (
                    <>
                      <dt className="text-[var(--text-muted)]">Recorded</dt>
                      <dd className="text-[var(--text-primary)]">
                        by {m.recordedBy}&apos;s Echo. You were in the same call, so the notes are shared with you.
                      </dd>
                    </>
                  )}
                  {m.sharedWith.length > 0 && (
                    <>
                      <dt className="text-[var(--text-muted)]">Shared</dt>
                      <dd className="text-[var(--text-primary)]">
                        <p className="text-[var(--text-secondary)]">
                          Their Echo was in the same call, so they see these notes too.
                        </p>
                        <ul className="mt-1 flex flex-col gap-1">
                          {m.sharedWith.map((p) => (
                            <li key={p.userId} className="flex items-center justify-between gap-2">
                              <span>{p.name}</span>
                              {m.mine && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeViewer({ meetingId, userId: p.userId }).catch((err) =>
                                      toast("error", err instanceof Error ? err.message : "Could not remove them")
                                    )
                                  }
                                  className="text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </>
                  )}
                  {m.continuesSessionId && (
                    <>
                      <dt className="text-[var(--text-muted)]">Note</dt>
                      <dd className="text-[var(--text-primary)]">
                        This carries on from an earlier recording of the same call, made before its recorder left.
                      </dd>
                    </>
                  )}
                </dl>
                <div className="px-4 py-3.5 border-t border-[var(--border-subtle)]">
                  {m.mine ? (
                    <>
                      <Select
                        label="Brand folder"
                        value={m.brandId ?? ""}
                        onChange={(e) =>
                          setBrand({
                            meetingId,
                            brandId: (e.target.value || null) as Id<"brands"> | null,
                          }).catch((err) =>
                            toast("error", err instanceof Error ? err.message : "Could not file it")
                          )
                        }
                        options={[
                          { value: "", label: "Not filed under a brand" },
                          ...(brands ?? []).map((b) => ({ value: b._id, label: b.name })),
                        ]}
                      />
                      <p className="text-[12px] text-[var(--text-muted)] mt-2">
                        {m.brandId
                          ? `${
                              m.brandSource === "auto" ? "Filed by Echo from who was in the meeting. " : ""
                            }The notes are also in this brand's Meeting Minutes, and Echo files the next meeting with these people here by itself.`
                          : "Pick the brand once. Echo remembers the people in this meeting and files their next one by itself."}
                      </p>
                    </>
                  ) : (
                    // Filing belongs to whoever recorded it, so two people cannot file one meeting two ways.
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)]">Brand folder</span>{" "}
                      <span className="font-medium text-[var(--text-primary)]">{m.brandName ?? "Not filed under a brand"}</span>
                      . {m.recordedBy} can change it.
                    </p>
                  )}
                </div>
              </Panel>

              <Panel title="Transcript">
                {m.hasRecording && (
                  <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                    {!recording && (
                      <Button variant="secondary" onClick={() => play()}>
                        Listen to the recording
                      </Button>
                    )}
                    <audio
                      ref={audio}
                      controls
                      className={recording ? "w-full" : "hidden"}
                      // The link expires after a few hours: drop it, so Listen comes back and fetches a new one.
                      onError={() => {
                        if (!recording) return;
                        setRecording(null);
                        toast("error", "The recording stopped loading. Press Listen again.");
                      }}
                    />
                    <p className="text-[12px] text-[var(--text-muted)] mt-2">
                      Click a line below to hear the meeting from that moment.
                    </p>
                  </div>
                )}
                <div className="px-4 py-3 max-h-[60vh] overflow-y-auto flex flex-col text-[12px] leading-5 text-[var(--text-primary)]">
                  {m.transcript.split("\n").map((line, i) => {
                    const at = line.match(/^\[(\d+):(\d\d)\]/);
                    // With a recording, a line plays the meeting from that moment.
                    return at && m.hasRecording ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => play(Number(at[1]) * 60 + Number(at[2]))}
                        className="text-left rounded px-1 -mx-1 hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        {line}
                      </button>
                    ) : (
                      <p key={i}>{line}</p>
                    );
                  })}
                </div>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
