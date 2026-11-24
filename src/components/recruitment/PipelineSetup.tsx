"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, GripVertical, Minus, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useConfirm, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { MAX_STEPS, STANDARD, STEP_KINDS, fitStage, newStep, reshape, shapeOf, type Shape, type Step, type StepKind } from "@/convex/lib/hirePipeline";
import { plainMessage } from "@/components/ui/Toast";
import type { HrData } from "./hrShared";
import { LABEL, movedNote, type Setup } from "./setupShared";

const MAX_INTERVIEWS = 6;
type Saved = Setup["pipelines"][number];
type Draft = {
  name: string;
  steps: Step[];
  /** The steps it was made from, and when those were saved. */
  before: readonly Step[];
  from: number;
  /** Taken out since, oldest first. */
  gone: Step[];
  /** Where the assignment was asked for, while there are too few interviews for it. */
  wish?: Shape["assignment"];
  /** Saved, and waiting for the saved version to arrive. */
  done?: boolean;
};

/**
 * One hiring pipeline. Three questions shape it; the steps underneath say who
 * does each, how long it takes and what to send. People follow a step that is
 * renamed or moved; one that goes asks where the people at it go.
 */
export function PipelineEditor({
  setup,
  hr,
  saved,
  seed,
  onDirty,
  onSaved,
  onCopy,
  onGone,
}: {
  setup: Setup;
  hr: HrData;
  /** The pipeline being changed. Without one, `seed` starts a new one. */
  saved?: Saved;
  seed?: { name: string; steps: Step[] };
  onDirty: (dirty: boolean) => void;
  onSaved?: (key: string) => Promise<void> | void;
  onCopy?: (key: string) => void;
  onGone?: () => void;
}) {
  // Someone who has left the company is not an owner any more: a save naming them is refused.
  const here = (list: readonly Step[]) => list.map((s) => (s.owner && !hr.people.some((p) => p._id === s.owner) ? { ...s, owner: undefined } : s));
  // Untouched, the screen follows the saved pipeline. The first change starts a draft of it.
  const [draft, setDraft] = useState<Draft | null>(null);
  if (draft?.done && saved?.updatedAt === draft.from) setDraft(null);
  const now: Draft = draft ?? {
    name: saved?.name ?? seed!.name,
    steps: here(saved?.steps ?? seed!.steps),
    before: saved?.steps ?? [],
    from: saved?.updatedAt ?? 0,
    gone: [],
  };
  const { name, steps, before } = now;
  /** Saved by someone else since the draft began. Saving over it would undo their change. */
  const stale = !!saved && !!draft && !draft.done && saved.updatedAt !== draft.from;
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [asking, setAsking] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const save = useMutation(api.recruitSetup.savePipeline);
  const remove = useMutation(api.recruitSetup.deletePipeline);
  const askConfirm = useConfirm();
  const { toast } = useToast();

  const standard = saved?.key === STANDARD;
  const shape = shapeOf(steps);
  const interviews = steps.filter((s) => s.kind === "interview");
  const peopleAt = (id: string) => {
    const was = before.find((s) => s.id === id);
    return (was && saved?.inPlay.find((x) => x.stage === was.name)?.n) || 0;
  };
  /** Steps that go although people are at them. */
  const leaving = before.filter((s) => peopleAt(s.id) > 0 && !steps.some((x) => x.id === s.id));

  const update = (patch: Partial<Draft>) => {
    setDraft({ ...now, ...patch, done: false });
    onDirty(true);
  };
  /** New steps. What drops out of them is kept, so asking for it again gives the same step back. */
  const change = (next: Step[], wish?: Draft["wish"]) =>
    update({ steps: next, wish, gone: [...now.gone.filter((g) => !next.some((s) => s.id === g.id)), ...steps.filter((s) => !next.some((x) => x.id === s.id)).reverse()] });
  const edit = (id: string, patch: Partial<Step>) => change(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const answer = (patch: Partial<Shape>) => {
    // Fewer interviews pull the assignment forward; more put it back where it was asked for.
    const assignment = patch.assignment ?? now.wish ?? shape.assignment;
    change(reshape(steps, { ...shape, assignment, ...patch }, now.gone), assignment);
  };
  // Leaving this editor leaves nothing unsaved behind.
  useEffect(() => () => onDirty(false), [onDirty]);
  const moveTo = (id: string, to: number) => {
    const step = steps.find((s) => s.id === id);
    if (!step || to < 0 || to >= steps.length) return;
    const rest = steps.filter((s) => s.id !== id);
    rest.splice(to, 0, step);
    change(rest);
  };

  async function submit(moves: Record<string, string>) {
    setSaving(true);
    setProblem("");
    try {
      const result = await save({
        key: saved?.key ?? null,
        name,
        steps: steps.map((s) => ({ ...s, owner: s.owner as Id<"users"> | undefined })),
        moves,
        from: now.from,
      });
      setAsking(null);
      // Stays up until the saved version arrives, so nothing flickers back.
      setDraft({ ...now, before: steps, from: result.updatedAt, gone: [], done: true });
      onDirty(false);
      toast("success", `${saved ? "Saved" : `${name.trim()} created`}${result.moved ? `. ${result.moved} ${result.moved === 1 ? "person" : "people"} moved with it` : ""}`);
      await onSaved?.(result.key);
    } catch (err) {
      const why = plainMessage(err instanceof Error ? err.message : "Could not save the pipeline");
      // Over the dialog a toast would sit behind it.
      if (asking) setProblem(why);
      else toast("error", why);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (leaving.length === 0) return void submit({});
        setProblem("");
        setAsking(
          Object.fromEntries(leaving.map((s) => [s.id, steps.find((x) => x.name === fitStage(s.name, before, steps))?.id ?? steps[0]?.id ?? ""]))
        );
      }}
    >
      {stale && (
        <p className="mb-3 rounded-lg bg-[var(--warning-dim)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
          Someone else changed this pipeline while you were editing it.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => {
              setDraft(null);
              onDirty(false);
            }}
          >
            Load their version
          </button>
          , then make your change again.
        </p>
      )}
      <fieldset disabled={saving} className="contents">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-[220px] flex-1 sm:max-w-sm">
          <span className={LABEL}>Pipeline</span>
          <input
            value={name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={standard}
            required
            maxLength={60}
            placeholder="Design roles"
            className={`${fieldClass} w-full font-medium`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {saved && onCopy && (
            <Button type="button" variant="secondary" onClick={() => onCopy(saved.key)}>
              <Copy size={14} />
              Make a copy
            </Button>
          )}
          {saved && !standard && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                askConfirm({
                  title: `Delete the ${saved.name} pipeline?`,
                  message: "What uses it goes back to what it would have without one: a hiring round to its position's, a role to the position above it's, the rest to Standard. Their people take the matching step. Its steps cannot be brought back.",
                  onConfirm: async () => {
                    const { moved } = await remove({ key: saved.key });
                    onDirty(false);
                    toast("success", `${saved.name} deleted${movedNote(moved)}`);
                    onGone?.();
                  },
                })
              }
            >
              <Trash2 size={14} />
              Delete
            </Button>
          )}
          <Button type="submit" loading={saving} disabled={stale}>
            {saved ? "Save pipeline" : "Create pipeline"}
          </Button>
        </div>
      </div>

      {saved && <UsedBy setup={setup} saved={saved} />}

      {/* The shape of it, in three answers. */}
      <div className="mb-4 grid gap-4 rounded-lg border border-[var(--border)] bg-white p-4 sm:grid-cols-3">
        <div>
          <span className={LABEL}>Screening first</span>
          <div role="group" aria-label="Screening first" className="inline-flex rounded-control border border-[var(--border)] p-0.5">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={shape.screening === on}
                onClick={() => answer({ screening: on })}
                className={`h-[26px] rounded-[7px] px-3 text-[12px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                  shape.screening === on ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {on ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={LABEL}>Interview rounds</span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="One interview round less"
              disabled={shape.interviews === 0}
              onClick={() => answer({ interviews: shape.interviews - 1 })}
              className={`${iconButtonClass} border border-[var(--border)] disabled:opacity-30`}
            >
              <Minus size={14} />
            </button>
            <output className="w-8 text-center text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">{shape.interviews}</output>
            <button
              type="button"
              aria-label="One more interview round"
              disabled={shape.interviews >= MAX_INTERVIEWS || steps.length >= MAX_STEPS}
              onClick={() => answer({ interviews: shape.interviews + 1 })}
              className={`${iconButtonClass} border border-[var(--border)] disabled:opacity-30`}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <label className="block">
          <span className={LABEL}>The assignment is given</span>
          <select
            value={String(shape.assignment)}
            onChange={(e) => answer({ assignment: e.target.value === "none" || e.target.value === "first" ? e.target.value : Number(e.target.value) })}
            className={`${fieldClass} w-full`}
          >
            <option value="none">Never</option>
            <option value="first">{interviews.length ? "Before the first interview" : "After screening"}</option>
            {interviews.map((s, i) => (
              <option key={s.id} value={i + 1}>
                After {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The steps themselves. */}
      <ol className="mb-3 flex flex-col gap-1.5" aria-label="Steps">
        {steps.map((s, i) => {
          const open = openStep === s.id;
          const people = peopleAt(s.id);
          return (
            <li
              key={s.id}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) moveTo(dragging, i);
                setDragging(null);
              }}
              className={`rounded-lg border bg-white ${dragging === s.id ? "border-[var(--accent-admin)] opacity-60" : "border-[var(--border)]"}`}
            >
              <div className="flex flex-wrap items-center gap-2 px-2 py-2">
                <span
                  draggable
                  aria-hidden
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", s.id);
                    setDragging(s.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className="cursor-grab text-[var(--text-disabled)] hover:text-[var(--text-muted)]"
                >
                  <GripVertical size={15} />
                </span>
                <span className="w-5 text-right text-[12px] tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                <input
                  value={s.name}
                  onChange={(e) => edit(s.id, { name: e.target.value })}
                  aria-label={`Name of step ${i + 1}`}
                  required
                  maxLength={40}
                  className={`${fieldClass} min-w-[130px] flex-1 font-medium`}
                />
                <select
                  value={s.kind}
                  onChange={(e) => edit(s.id, { kind: e.target.value as StepKind })}
                  aria-label={`${s.name}: kind of step`}
                  className={`${fieldClass} w-[130px]`}
                >
                  {Object.entries(STEP_KINDS).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={s.owner ?? ""}
                  onChange={(e) => edit(s.id, { owner: e.target.value || undefined })}
                  aria-label={`${s.name}: who does it`}
                  className={`${fieldClass} w-[150px]`}
                >
                  <option value="">Anyone</option>
                  {hr.people.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={s.days ?? ""}
                    onChange={(e) => edit(s.id, { days: e.target.value ? Number(e.target.value) : undefined })}
                    aria-label={`${s.name}: days it should take`}
                    placeholder="–"
                    className={`${fieldClass} w-14 text-right tabular-nums`}
                  />
                  days
                </label>
                <span className="ml-auto flex items-center">
                  {/* Keeps its width, so the rows line up whoever is where. */}
                  <span className="mr-1 w-[70px] text-right text-[12px] tabular-nums text-[var(--text-secondary)]">{people > 0 && `${people} here`}</span>
                  <button type="button" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => moveTo(s.id, i - 1)} className={`${iconButtonClass} disabled:opacity-30`}>
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${s.name} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => moveTo(s.id, i + 1)}
                    className={`${iconButtonClass} disabled:opacity-30`}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${s.name}: instructions and link`}
                    onClick={() => setOpenStep(open ? null : s.id)}
                    className={iconButtonClass}
                  >
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    disabled={steps.length === 1}
                    onClick={() => change(steps.filter((x) => x.id !== s.id))}
                    className={`${iconButtonDangerClass} disabled:opacity-30`}
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
              {open ? (
                <div className="grid gap-3 border-t border-[var(--border-subtle)] p-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>{s.kind === "assignment" ? "The assignment" : "What to do or check"}</span>
                    <textarea
                      value={s.note ?? ""}
                      onChange={(e) => edit(s.id, { note: e.target.value || undefined })}
                      rows={3}
                      maxLength={2000}
                      placeholder={s.kind === "assignment" ? "Redesign one landing page section in Figma" : "Portfolio, notice period, expected pay"}
                      className={`${fieldBaseClass} w-full py-2`}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>{s.kind === "assignment" ? "Assignment link (optional)" : "Link (optional)"}</span>
                    <input
                      value={s.link ?? ""}
                      onChange={(e) => edit(s.id, { link: e.target.value || undefined })}
                      inputMode="url"
                      maxLength={500}
                      placeholder="https://docs.google.com/…"
                      className={`${fieldClass} w-full`}
                    />
                    <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
                      {s.kind === "assignment" ? "Filled in by itself when you send the assignment to a candidate." : "Shown on the candidate while they are at this step."}
                    </span>
                  </label>
                </div>
              ) : (
                (s.note || s.link || s.kind === "assignment") && (
                  <button
                    type="button"
                    onClick={() => setOpenStep(s.id)}
                    className="block w-full truncate rounded-b-lg px-11 pb-2 text-left text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                  >
                    {[s.note, s.link].filter(Boolean).join("  ·  ") || "Add the assignment and its link"}
                  </button>
                )
              )}
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="secondary"
        disabled={steps.length >= MAX_STEPS}
        onClick={() => {
          change([...steps, newStep(steps, "other", "New step", [...now.gone, ...before])]);
        }}
      >
        <Plus size={14} />
        Add a step
      </Button>
      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
        Every pipeline ends in Joined, Rejected, Withdrawn or On Hold. Reaching a step puts its person and its date on the candidate&apos;s next action.
      </p>
      </fieldset>

      {asking && (
        <Modal
          open
          onClose={() => setAsking(null)}
          title="Where do they go?"
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button type="button" loading={saving} onClick={() => void submit(asking)}>
                Move and save
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-[var(--text-secondary)]">People are at steps you removed. Pick the step each group goes to.</p>
            {problem && <p role="alert" className="text-[13px] text-[var(--danger)]">{problem}</p>}
            {leaving.map((s) => (
              <label key={s.id} className="block">
                <span className={LABEL}>
                  {peopleAt(s.id)} at {s.name}
                </span>
                <select value={asking[s.id] ?? ""} onChange={(e) => setAsking({ ...asking, [s.id]: e.target.value })} className={`${fieldClass} w-full`}>
                  {steps.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </form>
  );
}

/** The positions and hiring rounds a pipeline applies to, and a way to give it to another. */
function UsedBy({ setup, saved }: { setup: Setup; saved: Saved }) {
  const set = useMutation(api.recruitSetup.setPipeline);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const standard = saved.key === STANDARD;
  const positions = setup.positions.filter((p) => !p.removed);
  const on = {
    positions: positions.filter((p) => p.uses === saved.key),
    rounds: setup.rounds.filter((r) => r.uses === saved.key),
  };

  /** `done` says what happened, for the toast. */
  async function give(target: { position?: number; round?: Id<"hrRecords"> }, key: string, done: string) {
    setBusy(true);
    try {
      const { moved } = await set({ ...target, key });
      toast("success", `${done}${movedNote(moved)}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not change it");
    } finally {
      setBusy(false);
    }
  }
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] bg-white pl-2.5 text-[12px] text-[var(--text-primary)]";
  const drop = (label: string, onClick: () => void, can: boolean) =>
    can ? (
      <button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={onClick}
        className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <X size={12} />
      </button>
    ) : (
      <span className="pr-1" />
    );

  const count = (n: number, one: string) => (n ? `${n} ${one}${n === 1 ? "" : "s"}` : "");
  return (
    // The standard one is used for nearly everything: its list opens on request.
    <details open={!standard} className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4">
      <summary className="cursor-pointer select-none text-[13px] font-semibold text-[var(--text-primary)]">
        Used for{" "}
        <span className="font-normal text-[var(--text-secondary)]">
          {[count(on.positions.length, "position"), count(on.rounds.length, "hiring round")].filter(Boolean).join(" and ") || "nothing yet"}
        </span>
      </summary>
      <p className="mb-3 mt-2 text-[12px] text-[var(--text-muted)]">
        {standard
          ? "Every position that has not been given another pipeline. A hiring round can use a different one from its position."
          : "A position's pipeline applies to everyone hired for it. A hiring round can use a different one, just for the people in it."}
      </p>
      {(
        [
          ["Positions", on.positions.map((p) => ({ id: String(p.id), label: p.name, hint: p.code, can: p.pipeline === saved.key, off: () => give({ position: p.id }, "", p.parent === null ? `${p.name} is back on Standard` : `${p.name} goes by the position above it now`) }))],
          ["Hiring rounds", on.rounds.map((r) => ({ id: r._id as string, label: r.role, hint: r.code, can: r.pipeline === saved.key, off: () => give({ round: r._id }, "", `${r.code} goes by its position's pipeline now`) }))],
        ] as const
      ).map(([title, items]) => (
        <div key={title} className="mb-3">
          <span className={LABEL}>
            {title} <span className="font-normal tabular-nums text-[var(--text-muted)]">{items.length}</span>
          </span>
          {items.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">None.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {items.map((x) => (
                <span key={x.id} className={chip}>
                  {x.label} <span className="tabular-nums text-[var(--text-muted)]">{x.hint}</span>
                  {drop(`Stop using it for ${x.label}`, x.off, x.can)}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <label className="block sm:max-w-sm">
        <span className={LABEL}>Use it for another</span>
        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":");
            if (kind === "p") {
              const p = positions.find((x) => String(x.id) === id)!;
              // Main positions have the standard one by having none.
              void give({ position: p.id }, standard && p.parent === null ? "" : saved.key, `${p.name} uses ${saved.name} now`);
            } else {
              const r = setup.rounds.find((x) => x._id === id)!;
              void give({ round: r._id }, saved.key, `${r.code} uses ${saved.name} now`);
            }
          }}
          className={`${fieldClass} w-full`}
        >
          <option value="">Choose a position or a hiring round</option>
          <optgroup label="Positions">
            {positions
              .filter((p) => p.uses !== saved.key)
              .map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Hiring rounds">
            {setup.rounds
              .filter((r) => r.uses !== saved.key)
              .map((r) => (
                <option key={r._id} value={`r:${r._id}`}>
                  {r.code} · {r.role}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
    </details>
  );
}
