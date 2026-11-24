"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useToast } from "@/components/ui";
import { plainMessage } from "@/components/ui/Toast";
import { fieldClass } from "@/components/ui/classes";

type Job = { sourceId: number; name: string; parentSourceId?: number | null };

/** Positions as options, roles indented under theirs. */
export function PositionOptions({ jobs, not }: { jobs: readonly Job[]; not?: (job: Job) => boolean }) {
  const roots = jobs.filter((j) => j.parentSourceId == null || !jobs.some((p) => p.sourceId === j.parentSourceId));
  return roots
    .flatMap((r) => [r, ...jobs.filter((j) => j.parentSourceId === r.sourceId)])
    .filter((j) => !not?.(j))
    .map((j) => (
      <option key={j.sourceId} value={j.sourceId}>
        {roots.includes(j) ? "" : "\u00a0\u00a0\u00a0"}
        {j.name}
      </option>
    ));
}

/** Put one or more applicants under another position, with everything already known about them. */
export function MoveApplicants({
  ids,
  who,
  from,
  onClose,
  onMoved,
}: {
  ids: Id<"recruitCandidates">[];
  /** Their name, when it is one person. */
  who?: string;
  /** The position they are all in, if they are in one. */
  from?: number;
  onClose: () => void;
  onMoved?: () => void;
}) {
  const jobs = useQuery(api.recruitment.listJobs);
  const move = useMutation(api.recruitSetup.moveApplicants);
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  // A position with roles under it stays on the list: people move between those too.
  const hasRoles = jobs?.some((j) => j.parentSourceId === from);
  const here = (j: Job) => j.sourceId === from && !hasRoles;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProblem("");
    try {
      const { moved, twice } = await move({ candidateIds: ids, to: Number(to) });
      const name = jobs?.find((j) => j.sourceId === Number(to))?.name ?? "the position";
      const subject = who ?? `${moved} ${moved === 1 ? "person" : "people"}`;
      toast(
        "success",
        moved === 0
          ? `Already in ${name}`
          : `${subject} moved to ${name}${twice ? `. ${who ? "They" : twice} had applied there too, so there are two applications` : ""}`
      );
      onMoved?.();
      onClose();
    } catch (err) {
      // Over the dialog a toast would sit behind it.
      setProblem(plainMessage(err instanceof Error ? err.message : "Could not move them"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move ${who ?? `${ids.length} ${ids.length === 1 ? "person" : "people"}`} to another position`}
      icon={ArrowLeftRight}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="move-applicants" loading={saving} disabled={!to}>
            Move
          </Button>
        </>
      }
    >
      <form id="move-applicants" onSubmit={submit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">Position</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} required className={`${fieldClass} w-full`}>
            <option value="">{jobs ? "Choose one" : "Loading…"}</option>
            {jobs && <PositionOptions jobs={jobs} not={here} />}
          </select>
        </label>
        {jobs && !jobs.some((j) => !here(j)) && <p className="text-[13px] text-[var(--text-primary)]">There is no other position you can move them to.</p>}
        {problem && <p role="alert" className="text-[13px] text-[var(--danger)]">{problem}</p>}
        <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
          Status, notes, emails and tasks go along. Anyone on Candidates takes the matching step of that position&apos;s pipeline, and joins
          its hiring round if one is open.
        </p>
      </form>
    </Modal>
  );
}
