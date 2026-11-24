"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { Briefcase, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useToast } from "@/components/ui";
import { fieldClass } from "@/components/ui/classes";
import type { Row } from "@/lib/hrHealth";
import { FieldGrid, toValues } from "./hrFields";
import { fieldsOf, startingValues, type HrData } from "./hrShared";

const KEYS = ["role", "job", "openings", "employmentType", "priority", "hiringManager", "targetJoinDate", "budgetLpa"];
const isOpen = (r: Row) => !String(r.fields.hiringStatus ?? "").startsWith("Closed");

/** Hiring rounds (open positions) still running for a website position. */
export const roundsFor = (data: HrData | undefined, jobId: number) =>
  (data?.book.rounds ?? []).filter((r) => r.fields.job === String(jobId) && isOpen(r));

/** The rounds running for a position, each leading to its candidates, and a way to open one. */
export function Rounds({ data, job }: { data: HrData | undefined; job: { sourceId: number; name: string } }) {
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const rounds = roundsFor(data, job.sourceId);
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
      {adding && <OpenRoundModal data={data} job={job} onClose={() => setAdding(false)} />}
    </span>
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
  onClose,
}: {
  data: HrData;
  job?: { sourceId: number; name: string };
  onClose: () => void;
}) {
  const save = useMutation(api.hrOps.save);
  const place = useMutation(api.hrOps.placeShortlisted);
  const { toast } = useToast();
  const [draft, setDraft] = useState(() =>
    startingValues("rounds", data, job ? { role: job.name, job: String(job.sourceId) } : {})
  );
  const [existing, setExisting] = useState("");
  const [bring, setBring] = useState(true);
  const [saving, setSaving] = useState(false);
  const loose = job ? data.book.rounds.filter((r) => !r.fields.job && isOpen(r)) : [];
  const fields = KEYS.flatMap((key) => fieldsOf("rounds").find((f) => f.key === key) ?? []).filter((f) => !(job && f.key === "job"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const id = existing
        ? await save({ tracker: "rounds", id: existing as Id<"hrRecords">, fields: { job: draft.job, ...(reopen(existing) ? { hiringStatus: "Open" } : {}) } })
        : await save({ tracker: "rounds", fields: toValues(fieldsOf("rounds"), draft) });
      const { placed } = bring && draft.job ? await place({ roundId: id }) : { placed: 0 };
      toast("success", `Hiring round open${placed ? `. ${placed} shortlisted ${placed === 1 ? "person is" : "people are"} in it` : ""}`);
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not open the round");
    } finally {
      setSaving(false);
    }
  }
  const reopen = (id: string) => data.byId.get(id)?.fields.hiringStatus !== "Open";

  return (
    <Modal
      open
      onClose={onClose}
      title={job ? `Hiring round: ${job.name}` : "Open a hiring round"}
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
        {!existing && <FieldGrid fields={fields} draft={draft} onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))} data={data} />}
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
