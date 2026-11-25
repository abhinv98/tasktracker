"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass } from "@/components/ui/classes";
import { maxLength, type Field, type TrackerKey } from "@/convex/lib/hrTrackers";
import type { Row } from "@/lib/hrHealth";
import { CLOSING } from "@/convex/lib/hirePipeline";
import { webLink } from "@/convex/lib/links";
import { rowTitle, seenFields, startingValues, type HrData } from "./hrShared";

/** The steps someone being filled in would go through. */
function stepsIn(draft: Record<string, string>, data: HrData) {
  const round = data.byId.get(draft.reqId ?? "");
  return round && (round.fields.job || round.fields.pipeline) ? data.stepsOf(round) : data.stepsFor(data.positionOf(draft)?.id);
}

/** The teams to pick from: the position's when it has some, else all of them. The one picked stays on the list. */
function teamsIn(draft: Record<string, string>, value: string, data: HrData) {
  const of = data.positionOf(draft)?.teams ?? [];
  return data.teams.filter((t) => !of.length || of.includes(t._id) || t._id === value).map((t) => ({ value: t._id, label: t.name }));
}

/** One field's control, by its kind. Values travel as text; the save turns numbers back. */
export function FieldInput({
  field,
  value,
  onChange,
  data,
  draft = {},
  autoFocus,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  data: HrData;
  /** The rest of the form. */
  draft?: Record<string, string>;
  autoFocus?: boolean;
}) {
  const common = {
    value,
    required: field.required,
    autoFocus,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  if (field.type === "long") {
    return <textarea {...common} rows={3} maxLength={maxLength(field)} className={`${fieldBaseClass} w-full py-2`} />;
  }
  if (field.type === "link") {
    const href = webLink(value);
    return (
      <span className="flex items-center gap-2">
        <input {...common} aria-label={field.label} inputMode="url" placeholder="Optional. Paste a link" maxLength={maxLength(field)} className={`${fieldClass} min-w-0 flex-1`} />
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${field.label.toLowerCase()}`}
            className="inline-flex h-control items-center gap-1 rounded-control border border-[var(--border)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            Open <ExternalLink size={12} aria-hidden />
          </a>
        )}
      </span>
    );
  }
  // A candidate's stage: the steps of their hiring round's pipeline, else their position's.
  const stage = field.free && field.key === "stage";
  if (field.free && !stage) {
    const steps = [...new Set([...(field.options ?? []), ...data.book.pipeline.flatMap((r) => data.stepsOf(r)).filter((s) => s.kind === "interview").map((s) => s.name)])];
    return (
      <>
        <input {...common} list={`free-${field.key}`} maxLength={300} className={`${fieldClass} w-full`} />
        <datalist id={`free-${field.key}`}>
          {steps.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </>
    );
  }
  if (["select", "user", "ref", "job", "pipeline", "team"].includes(field.type)) {
    const options =
      field.type === "select"
        ? (stage ? [...stepsIn(draft, data).map((s) => s.name), ...CLOSING] : (field.options ?? [])).map((o) => ({ value: o, label: o }))
        : field.type === "job"
          ? data.jobs.map((j) => ({ value: j.id, label: j.name }))
          : field.type === "pipeline"
            ? data.pipelines.map((p) => ({ value: p.key, label: p.name }))
          : field.type === "team"
            ? teamsIn(draft, value, data)
          : field.type === "user"
            ? data.people.map((p) => ({ value: p._id, label: p.name }))
            : data.book[field.ref as TrackerKey].map((r) => ({ value: r._id, label: `${r.code} · ${rowTitle(r, data)}` }));
    return (
      <select {...common} className={`${fieldClass} w-full`}>
        <option value="">
          {field.required ? "Select…" : stage ? "Where their pipeline starts" : field.type === "pipeline" ? "The position's own" : field.type === "team" ? "As the position says" : "–"}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      {...common}
      type={field.type === "date" || field.type === "time" || field.type === "number" ? field.type : "text"}
      min={field.type === "number" ? 0 : undefined}
      step={field.type === "number" ? "any" : undefined}
      maxLength={field.type === "text" ? maxLength(field) : undefined}
      className={`${fieldClass} w-full`}
    />
  );
}

/** A labelled grid of fields, two across. Long text takes the full width. */
export function FieldGrid({
  fields,
  draft,
  onChange,
  data,
}: {
  fields: readonly Field[];
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
  data: HrData;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.key} className={`block ${f.type === "long" ? "sm:col-span-2" : ""}`}>
          <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
            {f.label}
            {f.required && <span className="text-[var(--danger)]"> *</span>}
          </span>
          <FieldInput field={f} value={draft[f.key] ?? ""} onChange={(value) => onChange(f.key, value)} data={data} draft={draft} />
        </label>
      ))}
    </div>
  );
}

/** Text from a form, as the save wants it: blanks cleared, numbers as numbers. */
export function toValues(fields: readonly Field[], draft: Record<string, string>, before?: Record<string, string>) {
  const values: Record<string, string | number | null> = {};
  for (const f of fields) {
    if (f.stamp || f.auto) continue;
    const raw = (draft[f.key] ?? "").trim();
    // On an edit, only what this person changed goes up (see hrOps.save).
    if (before && raw === (before[f.key] ?? "").trim()) continue;
    values[f.key] = raw === "" ? null : f.type === "number" ? Number(raw) : raw;
  }
  return values;
}

/** Change a few fields of a row, with the result reported as a toast. */
export function useQuickSave() {
  const save = useMutation(api.hrOps.save);
  const { toast } = useToast();
  return async (row: Row, fields: Record<string, string | number | null>, done?: string) => {
    try {
      await save({ tracker: row.tracker, id: row._id as Id<"hrRecords">, fields });
      if (done) toast("success", done);
      return true;
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not save");
      return false;
    }
  };
}

/**
 * A short form that adds a row to another tracker without leaving the page:
 * an interview from a candidate, say. `preset` carries the link back.
 */
export function InlineAdd({
  tracker,
  keys,
  required = [],
  preset,
  data,
  submitLabel,
  onSaved,
  onDone,
}: {
  tracker: TrackerKey;
  keys: string[];
  /** Fields this short form insists on, even where the tracker itself does not. */
  required?: string[];
  preset: Record<string, string>;
  data: HrData;
  submitLabel: string;
  /** With what was typed, once it is saved and before the form goes. */
  onSaved?: (values: Record<string, string>) => void;
  onDone: () => void;
}) {
  const fields = keys
    .map((key) => seenFields(tracker, data).find((f) => f.key === key))
    .filter((f): f is Field => !!f)
    .map((f) => (required.includes(f.key) ? { ...f, required: true } : f));
  const [draft, setDraft] = useState(() => startingValues(tracker, data, preset));
  const [saving, setSaving] = useState(false);
  const save = useMutation(api.hrOps.save);
  const { toast } = useToast();

  return (
    <form
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await save({ tracker, fields: toValues(seenFields(tracker, data), draft) });
          toast("success", "Added");
          onSaved?.(draft);
          onDone();
        } catch (err) {
          toast("error", err instanceof Error ? err.message : "Could not save");
        } finally {
          setSaving(false);
        }
      }}
    >
      <FieldGrid fields={fields} draft={draft} onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))} data={data} />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
