"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useToast } from "@/components/ui";
import { plainMessage } from "@/components/ui/Toast";
import type { HrData } from "./hrShared";

type Props = { data: HrData; job: { id: string; name: string; teams?: string[]; divide?: boolean } };

/** The teams a position's people join. With two or more it is shown under each, and each person is one team's. */
export function TeamsButton({ data, job }: Props) {
  const [open, setOpen] = useState(false);
  const n = job.teams?.length ?? 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${n ? "Teams" : "Put under a team"}: ${job.name}`}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] bg-white px-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)]"
      >
        <Users size={12} aria-hidden /> {n ? "Teams" : "Put under a team"}
      </button>
      {open && <TeamsModal data={data} job={job} onClose={() => setOpen(false)} />}
    </>
  );
}

function TeamsModal({ data, job, onClose }: Props & { onClose: () => void }) {
  const [teams, setTeams] = useState<string[]>(job.teams ?? []);
  const [divide, setDivide] = useState(job.divide === true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const save = useMutation(api.recruitSetup.savePosition);
  const { toast } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProblem("");
    try {
      const { divided } = await save({ id: Number(job.id), teams: teams as Id<"teams">[], divide: teams.length > 1 && divide });
      toast(
        "success",
        teams.length === 0
          ? `${job.name} has no team of its own`
          : `${job.name} is under ${teams.map(data.teamName).join(" and ")}${divided ? `. ${divided} shortlisted ${divided === 1 ? "person was" : "people were"} divided between them` : ""}`
      );
      onClose();
    } catch (err) {
      setProblem(plainMessage(err instanceof Error ? err.message : "Could not change the teams"));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Teams for ${job.name}`}
      icon={Users}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="position-teams" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="position-teams" onSubmit={submit} className="flex flex-col gap-4">
        <div role="group" aria-label="Teams its people join" className="grid grid-cols-2 gap-2">
          {data.teams.map((t) => (
            <label key={t._id} className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={teams.includes(t._id)}
                onChange={() => setTeams((was) => (was.includes(t._id) ? was.filter((x) => x !== t._id) : [...was, t._id]))}
                className="h-4 w-4 accent-[var(--text-primary)]"
              />
              <span className="h-2 w-2 rounded-full" style={{ background: t.color }} aria-hidden />
              {t.name}
            </label>
          ))}
        </div>
        {teams.length > 1 && (
          <fieldset className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4">
            <legend className="sr-only">Which team each person goes to</legend>
            {(
              [
                [false, "Either one", "The team you shortlist someone from has them."],
                [true, "Divide", "Each person goes to the team that has had fewest. Everyone already shortlisted is divided now."],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={label} className="flex cursor-pointer items-start gap-2 text-[13px] text-[var(--text-primary)]">
                <input type="radio" name="divide" checked={divide === value} onChange={() => setDivide(value)} className="mt-0.5 h-4 w-4 accent-[var(--text-primary)]" />
                <span>
                  {label}
                  <span className="block text-[12px] text-[var(--text-muted)]">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {problem && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
