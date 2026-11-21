"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, PageHeader, SkeletonPageHeader, SkeletonTable, useConfirm, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { FilterTray, SearchField, StatChips } from "@/components/ui/Tray";
import { TRACKERS, TRACKER_KEYS, maxLength, type Field, type TrackerKey } from "@/convex/lib/hrTrackers";
import { ATTENTION, derived, health, isLive, type Row } from "@/lib/hrHealth";
import { HealthBadge, fieldsOf, fmtDate, rowTitle, show, useHrData, type HrData } from "./hrShared";

type Chip = "all" | "attention" | "live" | "done";
type Draft = Record<string, string>;
type Editing = { row: Row | null; draft: Draft };

/** ponytail: the list draws at most this many rows; add paging if a tracker outgrows it. */
const MAX_ROWS = 400;

const draftOf = (row: Row): Draft =>
  Object.fromEntries(Object.entries(row.fields).map(([key, value]) => [key, value === null ? "" : String(value)]));

/**
 * One HR tracker: its list, its filters and its form. Every tracker in
 * convex/lib/hrTrackers.ts is drawn by this one screen.
 */
export function TrackerView({ tracker }: { tracker: TrackerKey }) {
  const meta = TRACKERS[tracker];
  const fields = fieldsOf(tracker);
  const data = useHrData();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [chip, setChip] = useState<Chip>("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Editing | null>(null);

  // ?new=1&candidateId=… opens a prefilled form; ?open=<id> opens a row. Both
  // come from links elsewhere (the dashboard, a candidate's linked records).
  const paramKey = params.toString();
  useEffect(() => {
    const open = params.get("open");
    if (!data || !(open || params.get("new"))) return;
    if (params.get("new")) {
      const draft: Draft = {};
      for (const f of fields) {
        const given = params.get(f.key);
        if (given) draft[f.key] = given;
        else if (f.initial) draft[f.key] = f.initial;
      }
      setEditing({ row: null, draft });
    } else {
      const row = data.byId.get(open ?? "");
      if (row && row.tracker === tracker) setEditing({ row, draft: draftOf(row) });
    }
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey, data === undefined]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.book[tracker]
      .map((row) => ({ row, label: health(row, data.book, data.today) }))
      .sort((a, b) =>
        tracker === "log"
          ? String(b.row.fields.date ?? "").localeCompare(String(a.row.fields.date ?? ""))
          : b.row.code.localeCompare(a.row.code)
      );
  }, [data, tracker]);

  if (!data) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    );
  }
  if (meta.hrOnly && !data.full) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState title={`${meta.label} is for HR`} description="Ask HR or a super admin if you need to see it." />
      </div>
    );
  }

  const columns = fields.filter((f) => f.column);
  const filterFields = columns.filter((f) => f.type === "select").slice(0, 3);
  const inChip = (label: string, which: Chip) =>
    which === "all" ||
    (which === "attention" && ATTENTION[tracker].includes(label)) ||
    (which === "live" && isLive(label)) ||
    (which === "done" && !isLive(label));
  const needle = search.trim().toLowerCase();
  const visible = rows.filter(
    ({ row, label }) =>
      inChip(label, chip) &&
      filterFields.every((f) => !picked[f.key] || row.fields[f.key] === picked[f.key]) &&
      (!needle ||
        `${row.code} ${columns.map((f) => show(f, row, data)).join(" ")}`.toLowerCase().includes(needle))
  );
  const filtersOn = !!needle || chip !== "all" || Object.values(picked).some(Boolean);

  const startNew = () =>
    setEditing({
      row: null,
      draft: Object.fromEntries(fields.filter((f) => f.initial).map((f) => [f.key, f.initial as string])),
    });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={meta.label}
        subtitle={meta.blurb}
        actions={
          <Button onClick={startNew}>
            <Plus size={14} />
            New {meta.one}
          </Button>
        }
      />

      {tracker !== "log" && (
        <StatChips<Chip>
          label={`Filter ${meta.label.toLowerCase()} by health`}
          className="mb-3"
          value={chip}
          onChange={setChip}
          options={(
            [
              ["all", "All"],
              ["attention", "Needs attention"],
              ["live", "Live"],
              ["done", "Closed"],
            ] as const
          ).map(([value, label]) => ({ value, label, count: rows.filter((r) => inChip(r.label, value)).length }))}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder={`Search ${meta.label.toLowerCase()}`} label={`Search ${meta.label}`} />
        {filterFields.map((f) => (
          <FilterTray
            key={f.key}
            label={f.label}
            allLabel="All"
            value={picked[f.key] ?? ""}
            options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
            onChange={(value) => setPicked((p) => ({ ...p, [f.key]: value }))}
          />
        ))}
        {filtersOn && (
          <button
            onClick={() => {
              setSearch("");
              setChip("all");
              setPicked({});
            }}
            className="text-[12px] font-medium text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] tabular-nums text-[var(--text-muted)]">
          {visible.length} of {rows.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? `No ${meta.label.toLowerCase()} yet` : "Nothing matches"}
          description={rows.length === 0 ? meta.blurb : "Change or clear the filters to see more."}
          action={rows.length === 0 ? <Button onClick={startNew}>New {meta.one}</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[12px] text-[var(--text-muted)]">
                <th className="whitespace-nowrap px-3 py-2 font-medium">ID</th>
                {columns.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
                {tracker !== "log" && <th className="whitespace-nowrap px-3 py-2 font-medium">Health</th>}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, MAX_ROWS).map(({ row, label }) => (
                <tr
                  key={row._id}
                  tabIndex={0}
                  onClick={() => setEditing({ row, draft: draftOf(row) })}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setEditing({ row, draft: draftOf(row) });
                  }}
                  className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)]"
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text-muted)]">{row.code}</td>
                  {columns.map((f, i) => (
                    <td
                      key={f.key}
                      className={`max-w-[260px] truncate px-3 py-2 ${
                        i === 0 ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                      } ${f.type === "date" || f.type === "time" || f.type === "number" ? "whitespace-nowrap tabular-nums" : ""}`}
                    >
                      {show(f, row, data) || <span className="text-[var(--text-disabled)]">–</span>}
                    </td>
                  ))}
                  {tracker !== "log" && (
                    <td className="whitespace-nowrap px-3 py-2">
                      <HealthBadge label={label} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > MAX_ROWS && (
            <p className="border-t border-[var(--border-subtle)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
              Showing the first {MAX_ROWS}. Search or filter to narrow it down.
            </p>
          )}
        </div>
      )}

      {editing && (
        <RecordPanel
          key={editing.row?._id ?? "new"}
          tracker={tracker}
          editing={editing}
          data={data}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** The form for one row, with its calculated values and the rows linked to it. */
function RecordPanel({
  tracker,
  editing,
  data,
  onClose,
}: {
  tracker: TrackerKey;
  editing: Editing;
  data: HrData;
  onClose: () => void;
}) {
  const meta = TRACKERS[tracker];
  const fields = fieldsOf(tracker);
  const { row } = editing;
  const [draft, setDraft] = useState<Draft>(editing.draft);
  const [saving, setSaving] = useState(false);
  const save = useMutation(api.hrOps.save);
  const remove = useMutation(api.hrOps.remove);
  const { toast } = useToast();
  const askConfirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const values: Record<string, string | number | null> = {};
      for (const f of fields) {
        if (f.stamp) continue;
        const raw = (draft[f.key] ?? "").trim();
        // On an edit, only what this person changed goes up (see hrOps.save).
        if (row && raw === (editing.draft[f.key] ?? "").trim()) continue;
        values[f.key] = raw === "" ? null : f.type === "number" ? Number(raw) : raw;
      }
      await save({ tracker, id: row?._id as Id<"hrRecords"> | undefined, fields: values });
      toast("success", row ? "Saved" : `${meta.one[0].toUpperCase()}${meta.one.slice(1)} added`);
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  // Rows in other trackers that point at this one, and what could be added next.
  const linked = row
    ? TRACKER_KEYS.flatMap((key) => data.book[key].filter((other) => Object.values(other.fields).includes(row._id)))
    : [];
  const addable = row
    ? TRACKER_KEYS.flatMap((key) =>
        (!TRACKERS[key].hrOnly || data.full)
          ? fieldsOf(key)
              .filter((f) => f.type === "ref" && f.ref === tracker)
              .map((f) => ({ key, field: f.key }))
          : []
      )
    : [];
  const resume = row?.fields.resume;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={row ? `${meta.one} ${row.code}` : `New ${meta.one}`}
        className="animate-slidePanelIn fixed right-0 top-0 z-50 flex h-full w-full max-w-[720px] flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {row ? rowTitle(row, data) || row.code : `New ${meta.one}`}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              {row ? `${row.code} · ${meta.label}` : "It gets its ID when you save."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {row && (
              <button
                type="button"
                aria-label={`Delete ${row.code}`}
                className={iconButtonDangerClass}
                onClick={() =>
                  askConfirm({
                    title: `Delete ${row.code}?`,
                    message: "This row is removed for everyone. It cannot be undone.",
                    onConfirm: async () => {
                      await remove({ id: row._id as Id<"hrRecords"> });
                      onClose();
                    },
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            )}
            <button type="button" aria-label="Close panel" className={iconButtonClass} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {row && (
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2.5 text-[12px]">
                <HealthBadge label={health(row, data.book, data.today)} />
                {derived(row, data.book, data.today)
                  // These two count onboarding rows, which only HR can see.
                  .filter((d) => data.full || !["Joined", "Vacancies left"].includes(d.label))
                  .map((d) => (
                  <span key={d.label} className="text-[var(--text-muted)]">
                    {d.label} <span className="font-medium tabular-nums text-[var(--text-primary)]">{d.value}</span>
                  </span>
                ))}
                {fields
                  .filter((f) => f.stamp && row.fields[f.key])
                  .map((f) => (
                    <span key={f.key} className="text-[var(--text-muted)]">
                      {f.label}{" "}
                      <span className="font-medium text-[var(--text-primary)]">
                        {fmtDate(String(row.fields[f.key]), data.today)}
                      </span>
                    </span>
                  ))}
                {typeof resume === "string" && (
                  <a
                    href={resume}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[var(--accent-admin-text)] hover:underline"
                  >
                    Resume <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {fields
                .filter((f) => !f.stamp)
                .map((f) => (
                  <label key={f.key} className={`block ${f.type === "long" ? "sm:col-span-2" : ""}`}>
                    <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
                      {f.label}
                      {f.required && <span className="text-[var(--danger)]"> *</span>}
                    </span>
                    <FieldInput
                      field={f}
                      value={draft[f.key] ?? ""}
                      onChange={(value) => setDraft((d) => ({ ...d, [f.key]: value }))}
                      data={data}
                    />
                  </label>
                ))}
            </div>

            {row && (linked.length > 0 || addable.length > 0) && (
              <div className="mt-6">
                <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Linked records</h3>
                {linked.length > 0 && (
                  <ul className="mb-2 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)]">
                    {linked.map((other) => (
                      <li key={other._id}>
                        <button
                          type="button"
                          onClick={() => router.push(`/recruitment/t/${other.tracker}?open=${other._id}`)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)]"
                        >
                          <span className="w-24 shrink-0 tabular-nums text-[var(--text-muted)]">{other.code}</span>
                          <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">
                            {TRACKERS[other.tracker].label}
                            {other.tracker === "interviews" && other.fields.round ? ` · ${other.fields.round}` : ""}
                            {other.tracker === "pipeline" ? ` · ${rowTitle(other, data)}` : ""}
                          </span>
                          <HealthBadge label={health(other, data.book, data.today)} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  {addable.map(({ key, field }) => (
                    <Button
                      key={`${key}-${field}`}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/recruitment/t/${key}?new=1&${field}=${row._id}`)}
                    >
                      <Plus size={13} />
                      {TRACKERS[key].one}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-6 py-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {row ? "Save" : `Add ${meta.one}`}
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  data,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  data: HrData;
}) {
  const common = { value, required: field.required, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (field.type === "long") {
    return <textarea {...common} rows={3} maxLength={maxLength(field)} className={`${fieldBaseClass} w-full py-2`} />;
  }
  if (field.type === "select" || field.type === "user" || field.type === "ref") {
    const options =
      field.type === "select"
        ? (field.options ?? []).map((o) => ({ value: o, label: o }))
        : field.type === "user"
          ? data.people.map((p) => ({ value: p._id, label: p.name }))
          : data.book[field.ref as TrackerKey].map((r) => ({ value: r._id, label: `${r.code} · ${rowTitle(r, data)}` }));
    return (
      <select {...common} className={`${fieldClass} w-full`}>
        <option value="">{field.required ? "Select…" : "–"}</option>
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
      type={field.type === "text" ? "text" : field.type}
      min={field.type === "number" ? 0 : undefined}
      step={field.type === "number" ? "any" : undefined}
      maxLength={field.type === "text" ? maxLength(field) : undefined}
      className={`${fieldClass} w-full`}
    />
  );
}
