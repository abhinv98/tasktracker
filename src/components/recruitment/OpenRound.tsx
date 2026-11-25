"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { Briefcase, Link2, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useToast } from "@/components/ui";
import { Tray, TrayItem } from "@/components/ui/Tray";
import { positionCode } from "@/convex/lib/hirePipeline";
import { fieldClass } from "@/components/ui/classes";
import type { Row } from "@/lib/hrHealth";
import { applyLink } from "@/lib/applyLink";
import { guessPosition } from "@/lib/recruitTeams";
import { CopyLink } from "./CopyLink";
import { FieldGrid, toValues } from "./hrFields";
import { seenFields, startingValues, type HrData } from "./hrShared";

/** All it takes to open one. The rest is there for whoever wants it. */
const BASIC = ["job", "openings"];
const MORE = ["role", "employmentType", "hiringManager", "targetJoinDate", "priority", "pipeline", "team", "submitLink", "budgetLpa"];
const isOpen = (r: Row) => !String(r.fields.hiringStatus ?? "").startsWith("Closed");

/** Who a position's setup says it is hired by. */
const peopleOf = (data: HrData, id: number) => {
  const job = data.jobs.find((j) => j.id === String(id));
  return { ...(job?.hrOwner ? { hrOwner: job.hrOwner } : {}), ...(job?.hiringManager ? { hiringManager: job.hiringManager } : {}) };
};

/** Why a hiring round has no application link to give out, if it has none. */
export function noLink(data: HrData, round: Row): string | undefined {
  if (!round.fields.job) return "Tie the round to a position first";
  if (round.fields.hiringStatus !== "Open") return "The round is not open";
  return data.jobs.find((j) => j.id === String(round.fields.job))?.open ? undefined : "The position is not on the website";
}

/** Hiring rounds (open positions) still running for a website position. */
export const roundsFor = (data: HrData | undefined, jobId: number, team?: string) =>
  (data?.book.rounds ?? []).filter((r) => r.fields.job === String(jobId) && isOpen(r) && (!team || !r.team || r.team === team));

/** The rounds a position has been through and closed. One from the old log that was never tied counts by its name. */
export const earlierRounds = (data: HrData | undefined, jobId: number) =>
  (data?.book.rounds ?? []).filter(
    (r) => !isOpen(r) && (r.fields.job ? r.fields.job === String(jobId) : guessPosition(String(r.fields.role ?? ""), data!.jobs)?.id === String(jobId))
  );

/** The rounds running for a position, each leading to its candidates, how many it has had, and a way to open or continue one. */
export function Rounds({ data, job, team }: { data: HrData | undefined; job: { sourceId: number; name: string }; team?: string }) {
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const rounds = roundsFor(data, job.sourceId, team);
  const earlier = earlierRounds(data, job.sourceId);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {rounds.map((r) => (
        <Link
          key={r._id}
          href={`/recruitment/t/pipeline?view=board&reqId=${r._id}`}
          title={`${String(r.fields.role ?? "")}: ${String(r.fields.hiringStatus ?? "")}. Opens its candidates.`}
          className="inline-flex h-6 items-center rounded-full border border-[var(--border)] bg-white px-2 text-[12px] font-medium tabular-nums text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {r.code}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] bg-white px-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Plus size={12} aria-hidden /> Hiring round
      </button>
      {earlier.length > 0 && (
        <span
          title={`Closed: ${earlier.map((r) => `${r.code} ${String(r.fields.role ?? "")}`).join(", ")}. Use "Hiring round" to continue one.`}
          className="whitespace-nowrap text-[12px] tabular-nums text-[var(--text-muted)]"
        >
          {earlier.length} earlier
        </span>
      )}
      {adding && <OpenRoundModal data={data} job={job} team={team} onClose={() => setAdding(false)} />}
    </span>
  );
}

/** The application links of a position: its own, and one for each of its rounds. */
export function ApplyLinks({ data, job, team }: { data: HrData; job: { sourceId: number; name: string }; team?: string }) {
  const { toast } = useToast();
  const rounds = roundsFor(data, job.sourceId, team).filter((r) => !noLink(data, r));
  if (!data.jobs.find((j) => j.id === String(job.sourceId))?.open) return null;
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(applyLink(code));
      toast("success", `Link for ${code} copied. The form opens with only this position.`);
    } catch {
      toast("error", `Could not copy. The link is ${applyLink(code)}`);
    }
  };
  return (
    <Tray label="Application link" icon={Link2} align="end" title="Copy a link to the form, for this position only">
      {rounds.map((r) => (
        <TrayItem key={r._id} label={`${r.code} · ${String(r.fields.role ?? "")}`} onSelect={() => void copy(r.code)} />
      ))}
      <TrayItem label={`Any round (${positionCode(job.sourceId)})`} onSelect={() => void copy(positionCode(job.sourceId))} />
    </Tray>
  );
}

/**
 * Open a hiring round for a position: a new one, or one that was never tied
 * to a position. Everyone already shortlisted for the
 * position can go straight in.
 */
export function OpenRoundModal({
  data,
  job,
  team,
  onClose,
}: {
  data: HrData;
  job?: { sourceId: number; name: string };
  /** The team it is for, where the position hires into several. */
  team?: string;
  onClose: () => void;
}) {
  const save = useMutation(api.hrOps.save);
  const place = useMutation(api.hrOps.placeShortlisted);
  const { toast } = useToast();
  const [draft, setDraft] = useState(() =>
    // Opened by HR or a founder, it is approved.
    startingValues("rounds", data, {
      ...(data.full ? { approvalStatus: "Approved" } : {}),
      openings: "1",
      ...(job ? { role: job.name, job: String(job.sourceId), ...peopleOf(data, job.sourceId), ...(team ? { team } : {}) } : {}),
    })
  );
  const nameOf = (id: string) => data.jobs.find((j) => j.id === id)?.name ?? "";
  /** Picking a position names the round after it, unless it was given a name of its own. */
  const change = (key: string, value: string) =>
    setDraft((d) => ({
      ...d,
      // Another position: its team is not the old one's.
      ...(key === "job" ? { team: "", ...peopleOf(data, Number(value)), ...(!d.role || d.role === nameOf(d.job ?? "") ? { role: nameOf(value) } : {}) } : {}),
      [key]: value,
    }));
  const [existing, setExisting] = useState("");
  const [bring, setBring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<{ id: string; placed: number } | null>(null);
  const made = opened ? data.byId.get(opened.id) : undefined;
  // What can be taken up again instead of starting afresh: one tied to nothing yet, or one this position closed.
  const loose = job ? [...data.book.rounds.filter((r) => !r.fields.job && isOpen(r)), ...earlierRounds(data, job.sourceId)] : [];
  const pick = (keys: string[]) =>
    keys
      .flatMap((key) => seenFields("rounds", data).find((f) => f.key === key) ?? [])
      .filter((f) => !(job && f.key === "job") && !(f.key === "team" && (data.jobs.find((j) => j.id === draft.job)?.teams?.length ?? 0) < 2))
      // Without a position nobody shortlisted would ever land in it.
      .map((f) => (f.key === "job" ? { ...f, label: "Position", required: true } : f.key === "openings" ? { ...f, label: "How many to hire" } : f.key === "role" ? { ...f, label: "Name of the round", required: false } : f));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const id = existing
        ? await save({ tracker: "rounds", id: existing as Id<"hrRecords">, fields: { job: draft.job, ...(team ? { team } : {}), ...(reopen(existing) ? { hiringStatus: "Open" } : {}) } })
        : await save({ tracker: "rounds", fields: toValues(seenFields("rounds", data), { ...draft, role: draft.role?.trim() || nameOf(draft.job ?? "") }) });
      const { placed } = bring && draft.job ? await place({ roundId: id }) : { placed: 0 };
      // Stays up with the round's application link. A toast would be behind it.
      setOpened({ id: String(id), placed });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not open the round");
    } finally {
      setSaving(false);
    }
  }
  const reopen = (id: string) => data.byId.get(id)?.fields.hiringStatus !== "Open";

  if (opened) {
    const off = made && noLink(data, made);
    return (
      <Modal open onClose={onClose} title={`${made?.code ?? "The hiring round"} is open`} icon={Briefcase} footer={<Button type="button" onClick={onClose}>Done</Button>}>
        {opened.placed > 0 && (
          <p className="mb-3 text-[13px] text-[var(--text-secondary)]">
            {opened.placed} shortlisted {opened.placed === 1 ? "person is" : "people are"} in it.
          </p>
        )}
        {made && !off ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-[var(--text-secondary)]">
              Its application link. The form opens with only this position, and whoever applies through it goes into this round once shortlisted.
            </p>
            <input readOnly value={applyLink(made.code)} aria-label="Application link" onFocus={(e) => e.target.select()} className={`${fieldClass} w-full`} />
            <div>
              <CopyLink code={made.code} label="Copy link" />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-secondary)]">{off ? `${off}, so it has no application link.` : "One moment…"}</p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={job ? `Hiring round: ${job.name}${team ? ` for ${data.teamName(team)}` : ""}` : "Open a hiring round"}
      icon={Briefcase}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="open-round" loading={saving}>
            {existing ? "Continue this round" : "Open round"}
          </Button>
        </>
      }
    >
      <form id="open-round" onSubmit={submit} className="flex flex-col gap-4">
        {loose.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">Start a new round, or continue an earlier one</span>
            <select value={existing} onChange={(e) => setExisting(e.target.value)} className={`${fieldClass} w-full`}>
              <option value="">Start a new round</option>
              {loose.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.code} · {String(r.fields.role ?? "")} ({String(r.fields.hiringStatus ?? "")})
                </option>
              ))}
            </select>
          </label>
        )}
        {!existing && (
          <>
            <FieldGrid fields={pick(BASIC)} draft={draft} onChange={change} data={data} />
            {!job && data.full && (
              <p className="-mt-2 text-[12px] text-[var(--text-muted)]">
                Not on the list? Add the position first, under{" "}
                <Link href="/recruitment/setup?new=position" className="font-medium underline underline-offset-2">
                  Positions, Setup
                </Link>
                .
              </p>
            )}
            <details>
              <summary className="cursor-pointer select-none text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                More options
              </summary>
              <div className="mt-3">
                <FieldGrid fields={pick(MORE)} draft={draft} onChange={change} data={data} />
              </div>
            </details>
          </>
        )}
        {draft.job && (
          <label className="flex cursor-pointer select-none items-start gap-2.5">
            <input
              type="checkbox"
              checked={bring}
              onChange={(e) => setBring(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--text-primary)]"
            />
            <span className="text-[13px] text-[var(--text-primary)]">
              Bring in everyone already shortlisted for this position
              <span className="block text-[12px] text-[var(--text-muted)]">
                Only people who are not in a round yet. Anyone shortlisted from now on goes in by itself.
              </span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}
