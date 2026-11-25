"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass } from "@/components/ui/classes";
import { STANDARD } from "@/convex/lib/hirePipeline";
import { POSITION_STATUSES, type PositionStatus } from "@/lib/recruitStages";
import { plainMessage } from "@/components/ui/Toast";
import { PositionOptions } from "./MoveApplicants";
import type { HrData } from "./hrShared";
import { LABEL, StepTrail, movedNote, type Position, type Setup } from "./setupShared";

/** One position: what it is called, whether the website takes applications for it, who hires, and its pipeline. */
export function PositionEditor({
  setup,
  hr,
  position,
  onDirty,
  onCreated,
  onRemoved,
  onNewPipeline,
  onOpenPipeline,
}: {
  setup: Setup;
  hr: HrData;
  /** Without one, the form makes a new position. */
  position?: Position;
  onDirty: (dirty: boolean) => void;
  onCreated?: (id: number) => void;
  onRemoved?: () => void;
  onNewPipeline?: (position: Position) => void;
  onOpenPipeline?: (key: string) => void;
}) {
  // Someone who has left the company shows as nobody, and is not sent back.
  const known = (id: string | undefined) => (hr.people.some((p) => p._id === id) ? id! : "");
  const live = {
    name: position?.name ?? "",
    description: position?.description ?? "",
    parent: String(position?.parent ?? ""),
    hrOwner: known(position?.hrOwner),
    hiringManager: known(position?.hiringManager),
    closesOn: position?.closesOn ?? "",
    open: position?.open ?? true,
    pipeline: "",
    teams: (position?.teams ?? []) as string[],
    divide: position?.divide ?? false,
  };
  // Only what was typed is kept here, over the position as it is now.
  const [edits, setEdits] = useState<Partial<typeof live>>({});
  const draft = { ...live, ...edits };
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const save = useMutation(api.recruitSetup.savePosition);
  const { toast } = useToast();
  const set = (patch: Partial<typeof live>) => {
    setEdits((e) => ({ ...e, ...patch }));
    onDirty(true);
  };
  // Leaving this editor leaves nothing unsaved behind.
  useEffect(() => () => onDirty(false), [onDirty]);

  const roots = setup.positions.filter((p) => !p.removed && p.parent === null);
  const parent = setup.positions.find((p) => String(p.id) === draft.parent);
  const person = (key: "hrOwner" | "hiringManager", label: string, hint: string) => (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <select value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} className={`${fieldClass} w-full`}>
        <option value="">Nobody in particular</option>
        {hr.people.map((p) => (
          <option key={p._id} value={p._id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[12px] text-[var(--text-muted)]">{hint}</span>
    </label>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only what changed, so two people editing one position do not undo each other.
      const changed = (key: keyof typeof live) => !position || draft[key] !== live[key];
      const { id, code, divided } = await save({
        ...(position ? { id: position.id } : { parent: draft.parent ? Number(draft.parent) : null, pipeline: draft.pipeline }),
        ...(changed("name") ? { name: draft.name } : {}),
        ...(changed("description") ? { description: draft.description } : {}),
        ...(changed("open") ? { open: draft.open } : {}),
        ...(changed("closesOn") ? { closesOn: draft.closesOn } : {}),
        ...(changed("hrOwner") ? { hrOwner: (draft.hrOwner || null) as Id<"users"> | null } : {}),
        ...(changed("hiringManager") ? { hiringManager: (draft.hiringManager || null) as Id<"users"> | null } : {}),
        // Together: until now the choice between them may have been the position above's.
        ...(edits.teams ? { teams: edits.teams as Id<"teams">[], divide: edits.teams.length > 1 && draft.divide } : changed("divide") ? { divide: draft.divide } : {}),
      });
      setEdits({});
      onDirty(false);
      if (position) return toast("success", `Saved${divided ? `. ${divided} shortlisted ${divided === 1 ? "person was" : "people were"} divided between the teams` : ""}`);
      toast("success", `${code} created. ${!draft.open ? "It is not on the website form yet." : parent && !parent.open ? `It shows on the website form once ${parent.name} is open.` : "It is on the website form now."}`);
      onCreated?.(id);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not save the position");
    } finally {
      setSaving(false);
    }
  }

  const total = position ? Object.values(position.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="rounded-lg border border-[var(--border)] bg-white p-4">
        <fieldset disabled={saving} className="contents">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)] first-letter:uppercase">{position ? position.name : "New position"}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              {position ? (
                <>
                  <span className="tabular-nums">{position.code}</span>
                  {parent && `  ·  under ${parent.name}`}
                  {"  ·  "}
                  {position.parent === null ? (
                    <Link href={`/recruitment/${position.id}`} className="underline underline-offset-2 hover:text-[var(--text-primary)]">
                      {total.toLocaleString()} {total === 1 ? "applicant" : "applicants"}
                    </Link>
                  ) : (
                    "its applicants are listed under the position above it"
                  )}
                </>
              ) : (
                "It gets its position ID when you create it. An ID is never used twice."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {position && (
              <Button type="button" variant="secondary" onClick={() => setRemoving(true)}>
                <Trash2 size={14} />
                Remove
              </Button>
            )}
            <Button type="submit" loading={saving}>
              {position ? "Save" : "Create position"}
            </Button>
          </div>
        </div>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>
              Name <span className="text-[var(--danger)]">*</span>
            </span>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={80} placeholder="Motion designer" className={`${fieldClass} w-full`} />
          </label>
          {!position && (
            <label className="block">
              <span className={LABEL}>Under</span>
              <select value={draft.parent} onChange={(e) => set({ parent: e.target.value })} className={`${fieldClass} w-full`}>
                <option value="">Nothing, it is its own position</option>
                {roots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className={LABEL}>Last day to apply</span>
            <input type="date" value={draft.closesOn} onChange={(e) => set({ closesOn: e.target.value })} className={`${fieldClass} w-full`} />
            <span className="mt-1 block text-[12px] text-[var(--text-muted)]">Closes itself the day after. Blank means until you close it.</span>
          </label>
          {person("hrOwner", "HR owner", "Shortlisted people go to them.")}
          {person("hiringManager", "Hiring manager", "Filled in on its hiring rounds.")}
          {!position && (
            <label className="block">
              <span className={LABEL}>Hiring pipeline</span>
              <PipelineSelect setup={setup} value={draft.pipeline} blank={blankFor(setup, parent)} onChange={(pipeline) => set({ pipeline })} />
            </label>
          )}
          <fieldset className="sm:col-span-2">
            <legend className={LABEL}>Teams its people join</legend>
            <div className="flex flex-wrap gap-1.5">
              {(parent ? [] : setup.teams).map((t) => {
                const on = draft.teams.includes(t._id);
                return (
                  <button
                    key={t._id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ teams: on ? draft.teams.filter((id) => id !== t._id) : [...draft.teams, t._id] })}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                      on
                        ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-white"
                        : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: t.color }} aria-hidden />
                    {t.name}
                  </button>
                );
              })}
            </div>
            {(parent || draft.teams.length === 0) && (
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                {parent
                  ? parent.usesTeams.length
                    ? `Same as ${parent.name}: ${parent.usesTeams.map((id) => setup.teams.find((t) => t._id === id)?.name).join(", ")}.`
                    : `Same as ${parent.name}, which has none yet.`
                  : "Pick the team, or teams, people hired for it join in the task tracker."}
              </p>
            )}
            {!parent && draft.teams.length > 1 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {(
                  [
                    [false, "Either one: the team someone is shortlisted from has them"],
                    [true, "Divide them: each person goes to the team that has had fewest. It can be changed"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={label} className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-primary)]">
                    <input type="radio" name="divide" checked={draft.divide === value} onChange={() => set({ divide: value })} className="h-4 w-4 accent-[var(--text-primary)]" />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Description, for the team</span>
            <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={2} maxLength={2000} className={`${fieldBaseClass} w-full py-2`} />
          </label>
          <label className="flex cursor-pointer select-none items-start gap-2.5 sm:col-span-2">
            <input type="checkbox" checked={draft.open} onChange={(e) => set({ open: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--text-primary)]" />
            <span className="text-[13px] text-[var(--text-primary)]">
              Show it on the ecultify.com job application form
              <span className="block text-[12px] text-[var(--text-muted)]">
                {parent && !parent.open
                  ? `${parent.name} is closed, and that keeps this one off the form too.`
                  : "The form lists exactly the positions that are on here."}
              </span>
            </span>
          </label>
        </div>
        </fieldset>
      </form>

      {position && (
        <PositionPipeline setup={setup} position={position} onNew={() => onNewPipeline?.(position)} onOpen={(key) => onOpenPipeline?.(key)} />
      )}
      {position && removing && (
        <RemovePosition
          setup={setup}
          position={position}
          onClose={() => setRemoving(false)}
          onRemoved={() => {
            onDirty(false);
            onRemoved?.();
          }}
        />
      )}
    </div>
  );
}

const nameOf = (setup: Setup, key: string) => setup.pipelines.find((p) => p.key === key)?.name ?? "Standard";
/** What having no pipeline of its own means: the role above it's for a role, the standard one for the rest. */
const blankFor = (setup: Setup, parent?: Position) => (parent ? `Same as ${parent.name} (${nameOf(setup, parent.uses)})` : null);

function PipelineSelect({
  setup,
  value,
  blank,
  disabled,
  label,
  onChange,
}: {
  setup: Setup;
  value: string;
  /** What blank says. Null: blank is the standard pipeline. */
  blank: string | null;
  disabled?: boolean;
  label?: string;
  onChange: (key: string) => void;
}) {
  return (
    <select
      value={blank === null && value === STANDARD ? "" : value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldClass} w-full`}
    >
      {blank !== null && <option value="">{blank}</option>}
      {setup.pipelines.map((p) => (
        <option key={p.key} value={blank === null && p.key === STANDARD ? "" : p.key}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/** Which pipeline applies: to the position, and to each of its hiring rounds. Picking one takes effect at once. */
function PositionPipeline({ setup, position, onNew, onOpen }: { setup: Setup; position: Position; onNew: () => void; onOpen: (key: string) => void }) {
  const set = useMutation(api.recruitSetup.setPipeline);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const parent = setup.positions.find((p) => p.id === position.parent);
  const rounds = setup.rounds.filter((r) => r.job === position.id);
  const steps = setup.pipelines.find((p) => p.key === position.uses)?.steps ?? [];

  async function pick(target: { position?: number; round?: Id<"hrRecords"> }, key: string, name: string) {
    setBusy(true);
    try {
      const { moved } = await set({ ...target, key });
      toast("success", `Pipeline changed for ${name}${movedNote(moved)}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not change it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Hiring pipeline</h3>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpen(position.uses)}>
            Edit {nameOf(setup, position.uses)}
          </Button>
          <Button type="button" variant="secondary" onClick={onNew}>
            Make one for this position
          </Button>
        </div>
      </div>
      <label className="block sm:max-w-sm">
        <span className={LABEL}>Everyone hired for {position.name}</span>
        <PipelineSelect
          setup={setup}
          value={position.pipeline}
          blank={blankFor(setup, parent)}
          disabled={busy}
          onChange={(key) => void pick({ position: position.id }, key, position.name)}
        />
      </label>
      <div className="mt-2">
        <StepTrail steps={steps} />
      </div>
      {rounds.length > 0 && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <span className={LABEL}>Its hiring rounds</span>
          <ul className="flex flex-col gap-2">
            {rounds.map((r) => (
              <li key={r._id} className="grid items-center gap-2 sm:grid-cols-[1fr_260px]">
                <Link href={`/recruitment/t/pipeline?view=board&reqId=${r._id}`} className="min-w-0 truncate text-[13px] text-[var(--text-primary)] underline-offset-2 hover:underline">
                  <span className="tabular-nums text-[var(--text-muted)]">{r.code}</span> {r.role}
                  {r.status !== "Open" && <span className="text-[var(--text-muted)]"> ({r.status})</span>}
                </Link>
                <PipelineSelect
                  setup={setup}
                  value={r.pipeline}
                  blank={`Same as the position (${nameOf(setup, position.uses)})`}
                  disabled={busy}
                  label={`Pipeline for ${r.code}`}
                  onChange={(key) => void pick({ round: r._id }, key, r.code)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ── Removing a position ───────────────────────────────────── */

/** Asks before a position goes, and where its applicants go. */
function RemovePosition({ setup, position, onClose, onRemoved }: { setup: Setup; position: Position; onClose: () => void; onRemoved: () => void }) {
  const info = useQuery(api.recruitSetup.removalInfo, { id: position.id });
  const remove = useMutation(api.recruitSetup.removePosition);
  const { toast } = useToast();
  const [mode, setMode] = useState<"move" | "leave">("move");
  const [to, setTo] = useState("");
  // Rejected people usually stay behind; everyone else goes along unless unticked.
  const [off, setOff] = useState<ReadonlySet<PositionStatus>>(new Set(["rejected"]));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  const attached = !!info && (info.total > 0 || info.inPlay > 0 || info.rounds.length > 0);
  const moving = attached && mode === "move";
  const going = info ? POSITION_STATUSES.filter((s) => info.counts[s.value] > 0 && !off.has(s.value)) : [];
  const n = info ? going.reduce((sum, s) => sum + info.counts[s.value], 0) : 0;
  const targets = setup.positions
    .filter((p) => !p.removed && p.id !== position.id && p.parent !== position.id)
    .map((p) => ({ sourceId: p.id, name: p.name, parentSourceId: p.parent }));
  const list = (words: string[]) => words.join(", ");

  async function submit() {
    setSaving(true);
    setProblem("");
    try {
      const { moved, left } = await remove({ id: position.id, moveTo: moving ? Number(to) : null, statuses: going.map((s) => s.value) });
      const target = setup.positions.find((p) => String(p.id) === to)?.name;
      toast(
        "success",
        `${position.name} removed${moved ? `. ${moved} moved to ${target}` : ""}${left ? `. ${left} ${info?.under ? `stay under ${info.under}` : "kept with it"}` : ""}`
      );
      onClose();
      onRemoved();
    } catch (err) {
      // Over the dialog a toast would sit behind it.
      setProblem(plainMessage(err instanceof Error ? err.message : "Could not remove it"));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove ${position.name}?`}
      icon={Trash2}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" loading={saving} disabled={!info || (moving && !to)} onClick={() => void submit()}>
            {moving && n > 0 ? `Move ${n.toLocaleString()} and remove` : "Remove position"}
          </Button>
        </>
      }
    >
      {!info ? (
        <p className="text-[13px] text-[var(--text-muted)]">Looking at who is in it…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            It comes off the website form and out of every list. {position.code} is never used again, and you can restore the position from Setup.
            {info.roles.length > 0 && ` ${list(info.roles)} ${info.roles.length === 1 ? "goes" : "go"} with it.`}
          </p>

          {attached && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
                {info.total > 0
                  ? `${info.total.toLocaleString()} ${info.total === 1 ? "person has" : "people have"} applied for it`
                  : "It still has people or hiring rounds"}
                {info.inPlay > 0 && `, ${info.inPlay} in play on Candidates`}
              </legend>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="radio" name="what" checked={mode === "move"} onChange={() => setMode("move")} className="mt-0.5 h-4 w-4 accent-[var(--text-primary)]" />
                <span className="text-[13px] text-[var(--text-primary)]">Move them to another position</span>
              </label>
              {mode === "move" && (
                <div className="ml-[26px] flex flex-col gap-3">
                  <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Position to move them to" className={`${fieldClass} w-full`}>
                    <option value="">Choose a position</option>
                    <PositionOptions jobs={targets} />
                  </select>
                  {info.total > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {POSITION_STATUSES.filter((s) => info.counts[s.value] > 0).map((s) => (
                        <label key={s.value} className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            checked={!off.has(s.value)}
                            onChange={() => {
                              const next = new Set(off);
                              if (!next.delete(s.value)) next.add(s.value);
                              setOff(next);
                            }}
                            className="h-4 w-4 accent-[var(--text-primary)]"
                          />
                          {s.label} <span className="tabular-nums text-[var(--text-muted)]">{info.counts[s.value].toLocaleString()}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {[
                      "They keep their status and history, and take the matching step of that position's pipeline.",
                      info.rounds.length > 0 && `${info.rounds.length === 1 ? "Hiring round" : "Hiring rounds"} ${list(info.rounds)} ${info.rounds.length === 1 ? "goes" : "go"} along.`,
                      info.templates > 0 && "Its email templates go along.",
                      info.total > n && `The other ${(info.total - n).toLocaleString()} stay ${info.under ? `under ${info.under}` : "with the removed position"}.`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="radio" name="what" checked={mode === "leave"} onChange={() => setMode("leave")} className="mt-0.5 h-4 w-4 accent-[var(--text-primary)]" />
                <span className="text-[13px] text-[var(--text-primary)]">
                  {info.under ? `Leave them under ${info.under}` : "Leave them with the removed position"}
                  <span className="block text-[12px] text-[var(--text-muted)]">
                    {info.under
                      ? "They stay in its list and carry on there."
                      : "Off the board, still found by searching All applicants, and back in place if you restore it."}
                    {info.rounds.length > 0 && ` ${list(info.rounds)} ${info.rounds.length === 1 ? "is" : "are"} closed as cancelled.`}
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {problem && <p role="alert" className="text-[13px] text-[var(--danger)]">{problem}</p>}
          {info.people.length > 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">
              {list(info.people)} {info.people.length === 1 ? "loses" : "lose"} access to it{moving ? ". Give the new position under HR Office, Access" : ""}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
