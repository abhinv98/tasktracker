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
import { CopyLink } from "./CopyLink";
import { FieldGrid, toValues } from "./hrFields";
import { seenFields, startingValues, type HrData } from "./hrShared";

const KEYS = ["role", "job", "pipeline", "team", "submitLink", "openings", "employmentType", "priority", "hiringManager", "targetJoinDate", "budgetLpa"];
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

/** The rounds running for a position, each leading to its candidates, and a way to open one. */
export function Rounds({ data, job, team }: { data: HrData | undefined; job: { sourceId: number; name: string }; team?: string }) {
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const rounds = roundsFor(data, job.sourceId, team);
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
 * Open a hiring round for a position: a new one, or one already in Open
 * Positions that was never tied to it. Everyone already shortlisted for the
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
    startingValues("rounds", data, job ? { role: job.name, job: String(job.sourceId), ...peopleOf(data, job.sourceId), ...(team ? { team } : {}) } : {})
  );
  const [existing, setExisting] = useState("");
  const [bring, setBring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<{ id: string; placed: number } | null>(null);
  const made = opened ? data.byId.get(opened.id) : undefined;
  const loose = job ? data.book.rounds.filter((r) => !r.fields.job && isOpen(r)) : [];
  const fields = KEYS.flatMap((key) => seenFields("rounds", data).find((f) => f.key === key) ?? []).filter((f) => !(job && f.key === "job"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const id = existing
        ? await save({ tracker: "rounds", id: existing as Id<"hrRecords">, fields: { job: draft.job, ...(team ? { team } : {}), ...(reopen(existing) ? { hiringStatus: "Open" } : {}) } })
        : await save({ tracker: "rounds", fields: toValues(seenFields("rounds", data), draft) });
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
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="open-round" loading={saving}>
            {existing ? "Use this one" : "Open round"}
          </Button>
        </>
      }
    >
      <form id="open-round" onSubmit={submit} className="flex flex-col gap-4">
        {loose.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">New, or one already in Open Positions</span>
            <select value={existing} onChange={(e) => setExisting(e.target.value)} className={`${fieldClass} w-full`}>
              <option value="">Start a new one</option>
              {loose.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.code} · {String(r.fields.role ?? "")} ({String(r.fields.hiringStatus ?? "")})
                </option>
              ))}
            </select>
          </label>
        )}
        {!existing && <FieldGrid fields={fields} draft={draft} onChange={(key, value) => setDraft((d) => ({ ...d, ...(key === "job" ? peopleOf(data, Number(value)) : {}), [key]: value }))} data={data} />}
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
