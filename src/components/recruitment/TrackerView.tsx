"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useAuthToken } from "@convex-dev/auth/react";
import { ChevronDown, ChevronUp, ExternalLink, FileText, KanbanSquare, List, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, PageHeader, SkeletonPageHeader, SkeletonTable, useConfirm, useToast } from "@/components/ui";
import { iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { FilterTray, SearchField, StatChips } from "@/components/ui/Tray";
import { TRACKERS, TRACKER_KEYS, type TrackerKey } from "@/convex/lib/hrTrackers";
import { webLink } from "@/convex/lib/links";
import { ATTENTION, derived, health, isLive, type Row } from "@/lib/hrHealth";
import { CandidateWorkspace } from "./CandidateWorkspace";
import { FieldGrid, toValues } from "./hrFields";
import { HealthBadge, fieldsOf, fmtDate, isMine, rowTitle, show, startingValues, stepNames, useHrData, type HrData } from "./hrShared";
import { looseRounds } from "./RoundsMatch";
import { TrackerBoard } from "./TrackerBoard";

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
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    // A link can arrive already filtered: ?reqId=<round> shows one round's candidates.
    Object.fromEntries(fields.filter((f) => params.get(f.key) && !params.get("new")).map((f) => [f.key, params.get(f.key) as string]))
  );
  const [mine, setMine] = useState(false);
  const board = "board" in meta ? meta.board : undefined;
  const [view, setView] = useState<"table" | "board">(board && params.get("view") === "board" ? "board" : "table");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  // ?new=1&candidateId=… opens a prefilled form; ?open=<id> opens a row. Both
  // come from links elsewhere (the dashboard, a candidate's linked records).
  const paramKey = params.toString();
  useEffect(() => {
    const open = params.get("open");
    if (!data || !(open || params.get("new"))) return;
    if (params.get("new")) {
      const given = Object.fromEntries(fields.filter((f) => params.get(f.key)).map((f) => [f.key, params.get(f.key) as string]));
      setEditing({ row: null, draft: startingValues(tracker, data, given) });
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
  // Filter by the listed dropdowns, and by what a row belongs to (a candidate's position).
  const filterFields = [
    ...columns.filter((f) => f.type === "ref" || f.type === "job"),
    ...columns.filter((f) => f.type === "select").slice(0, 3),
  ];
  const optionsOf = (f: (typeof fields)[number]) =>
    f.type === "ref"
      ? data.book[f.ref as TrackerKey].map((r) => ({ value: r._id, label: `${r.code} · ${rowTitle(r, data)}` }))
      : f.type === "job"
        ? data.jobs.map((j) => ({ value: j.id, label: j.name }))
        : f.free
          ? (tracker === "pipeline"
              ? [...stepNames(data.book.pipeline, data), ...TRACKERS.pipeline.boardClosed]
              : [...new Set(data.book[tracker].map((r) => String(r.fields[f.key] ?? "")))].filter(Boolean)
            ).map((o) => ({ value: o, label: o }))
          : (f.options ?? []).map((o) => ({ value: o, label: o }));
  const inChip = (label: string, which: Chip) =>
    which === "all" ||
    (which === "attention" && ATTENTION[tracker].includes(label)) ||
    (which === "live" && isLive(label)) ||
    (which === "done" && !isLive(label));
  const needle = search.trim().toLowerCase();
  // Everything but the health chip, so the chips count what the other filters leave.
  const narrowed = rows.filter(
    ({ row }) =>
      (!mine || isMine(row, data)) &&
      filterFields.every((f) => !picked[f.key] || row.fields[f.key] === picked[f.key]) &&
      (!needle ||
        `${row.code} ${columns.map((f) => show(f, row, data)).join(" ")}`.toLowerCase().includes(needle))
  );
  const sorting = sort && columns.find((f) => f.key === sort.key);
  const keyed = narrowed.filter(({ label }) => inChip(label, chip));
  const visible = sorting
    ? keyed
        .map((r) => ({ r, v: sorting.type === "date" || sorting.type === "number" ? (r.row.fields[sorting.key] ?? "") : show(sorting, r.row, data).toLowerCase() }))
        .sort((a, b) =>
          // Blank last, whichever way it is sorted.
          a.v === "" || b.v === "" ? Number(a.v === "") - Number(b.v === "") : (typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v))) * sort.dir
        )
        .map(({ r }) => r)
    : keyed;
  const filtersOn = !!needle || mine || chip !== "all" || Object.values(picked).some(Boolean);

  // A new row starts inside what the list is narrowed to (the round being looked
  // at), but not with a status someone happened to be filtering by.
  const startNew = () =>
    setEditing({
      row: null,
      draft: startingValues(
        tracker,
        data,
        Object.fromEntries(
          fields.filter((f) => (f.type === "ref" || f.type === "job") && picked[f.key]).map((f) => [f.key, picked[f.key]])
        )
      ),
    });
  const open = (row: Row) => setEditing({ row, draft: draftOf(row) });
  // The round whose candidates are on screen, when the list is narrowed to one.
  const round = tracker === "pipeline" && picked.reqId ? data.byId.get(picked.reqId) : undefined;
  // Empty because nothing exists yet, not because a filter hid it: the tracker
  // has no rows, or the only thing narrowing the list is the round.
  const fresh =
    rows.length === 0 ||
    (!!round &&
      !needle &&
      !mine &&
      chip === "all" &&
      Object.entries(picked).every(([key, value]) => key === "reqId" || !value) &&
      !rows.some(({ row }) => row.fields.reqId === round._id));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={round ? `${String(round.fields.role ?? "")} candidates` : meta.label}
        subtitle={
          round
            ? `${round.code} · ${String(round.fields.hiringStatus ?? "")}${
                derived(round, data.book, data.today).find((d) => d.label === "Vacancies left")?.value !== "–" && data.full
                  ? ` · ${derived(round, data.book, data.today).find((d) => d.label === "Vacancies left")?.value} to fill`
                  : ""
              }. Drag a card to move someone along, or open it to plan the next step.`
            : meta.blurb
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {round && webLink(String(round.fields.submitLink ?? "")) && (
              <a
                href={webLink(String(round.fields.submitLink))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-control items-center gap-1.5 rounded-control border border-[var(--border)] bg-white px-3 text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
              >
                Submissions <ExternalLink size={13} aria-hidden />
              </a>
            )}
            <Button onClick={startNew}>
              <Plus size={14} />
              New {meta.one}
            </Button>
          </div>
        }
      />

      {/* Nobody goes into a round that is tied to no position. */}
      {data.full && (tracker === "rounds" || (tracker === "pipeline" && !round)) && looseRounds(data).length > 0 && (
        <p className="mb-3 rounded-lg bg-[var(--warning-dim)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
          {looseRounds(data).length} hiring {looseRounds(data).length === 1 ? "round is" : "rounds are"} not tied to a position, so no candidate goes into{" "}
          {looseRounds(data).length === 1 ? "it" : "them"}.{" "}
          <Link href="/recruitment/setup?rounds=1" className="font-medium underline underline-offset-2">
            Match them
          </Link>
        </p>
      )}

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
          ).map(([value, label]) => ({ value, label, count: narrowed.filter((r) => inChip(r.label, value)).length }))}
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
            options={optionsOf(f)}
            onChange={(value) => setPicked((p) => ({ ...p, [f.key]: value }))}
          />
        ))}
        {fields.some((f) => f.type === "user") && (
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => setMine((v) => !v)}
            className={`h-control rounded-control border px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
              mine
                ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]"
                : "border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            Mine
          </button>
        )}
        {filtersOn && (
          <button
            onClick={() => {
              setSearch("");
              setChip("all");
              setMine(false);
              setPicked({});
            }}
            className="text-[12px] font-medium text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] tabular-nums text-[var(--text-muted)]">
          {visible.length === rows.length ? `${rows.length}` : `${visible.length} of ${rows.length}`}
        </span>
        {board && (
          <div role="group" aria-label="View" className="flex rounded-control border border-[var(--border)] bg-white p-0.5">
            {(
              [
                ["table", "List", List],
                ["board", "Board", KanbanSquare],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                  view === value ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon size={13} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        fresh ? (
          // Nothing has been added here yet (to this tracker, or to the round
          // being looked at): say so and offer the first one.
          <EmptyState
            title={round ? `No candidates in ${String(round.fields.role ?? round.code)} yet` : `No ${meta.label.toLowerCase()} yet`}
            description={
              tracker === "pipeline" && !round
                ? "Go to Positions, open one and shortlist people. They show up here, whatever they applied for."
                : round
                ? "Add the first one here, or go to Positions, tick the people worth a look and use Add to open position."
                : meta.blurb
            }
            action={<Button onClick={startNew}>New {meta.one}</Button>}
          />
        ) : (
          <EmptyState title="Nothing matches" description="Change or clear the filters to see more." />
        )
      ) : board && view === "board" ? (
        <TrackerBoard
          tracker={tracker}
          items={visible}
          data={data}
          skip={Object.keys(picked).filter((key) => picked[key])}
          columns={tracker === "pipeline" ? stepNames(visible.map((v) => v.row), data) : undefined}
          onOpen={open}
          onShowClosed={(value) => {
            setPicked((p) => ({ ...p, [board]: value }));
            setView("table");
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[12px] text-[var(--text-muted)]">
                <th className="whitespace-nowrap px-3 py-2 font-medium">ID</th>
                {columns.map((f) => (
                  <th
                    key={f.key}
                    aria-sort={sort?.key === f.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                  >
                    {/* Newest first for a date, A to Z for the rest; a second press turns it round, a third clears it. */}
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) => {
                          const first = f.type === "date" ? -1 : 1;
                          return s?.key !== f.key ? { key: f.key, dir: first } : s.dir === first ? { key: f.key, dir: first === 1 ? -1 : 1 } : null;
                        })
                      }
                      className={`inline-flex items-center gap-1 hover:text-[var(--text-primary)] ${sort?.key === f.key ? "text-[var(--text-primary)]" : ""}`}
                    >
                      {f.label}
                      {sort?.key === f.key && (sort.dir === 1 ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)}
                    </button>
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
                  onClick={() => open(row)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    open(row);
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
                      {f.type === "link" && webLink(show(f, row, data)) ? (
                        <a
                          href={webLink(show(f, row, data))}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-medium text-[var(--accent-admin-text)] hover:underline"
                        >
                          Open <ExternalLink size={12} aria-hidden />
                        </a>
                      ) : (
                        show(f, row, data) || <span className="text-[var(--text-disabled)]">–</span>
                      )}
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

      {editing &&
        (tracker === "pipeline" && editing.row ? (
          // The live row, not the one that was clicked: a stage move shows at once.
          data.byId.get(editing.row._id) && (
            <CandidateWorkspace
              key={editing.row._id}
              row={data.byId.get(editing.row._id) as Row}
              data={data}
              onClose={() => setEditing(null)}
            />
          )
        ) : (
          <RecordPanel
            key={editing.row?._id ?? "new"}
            tracker={tracker}
            editing={editing}
            data={data}
            onClose={() => setEditing(null)}
          />
        ))}
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
  const authToken = useAuthToken();
  const [makingLetter, setMakingLetter] = useState(false);

  /** The appointment letter for this offer, as a Word file (see /api/appointment-letter). */
  async function downloadLetter() {
    if (!row) return;
    setMakingLetter(true);
    try {
      const res = await fetch("/api/appointment-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ offerId: row._id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not make the letter");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Appointment Letter.docx";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not make the letter");
    } finally {
      setMakingLetter(false);
    }
  }

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
      const values = toValues(fields, draft, row ? editing.draft : undefined);
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
                {tracker === "rounds" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/recruitment/t/pipeline?view=board&reqId=${row._id}`)}
                  >
                    <KanbanSquare size={13} />
                    Candidates board
                  </Button>
                )}
                {tracker === "offers" && (
                  <Button type="button" size="sm" variant="secondary" loading={makingLetter} onClick={downloadLetter}>
                    <FileText size={13} />
                    Appointment letter
                  </Button>
                )}
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

            <FieldGrid
              fields={fields.filter((f) => !f.stamp && !f.more)}
              draft={draft}
              onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
              data={data}
            />
            {fields.some((f) => f.more) && (
              <details className="mt-4" open={fields.some((f) => f.more && !!editing.draft[f.key])}>
                <summary className="cursor-pointer select-none text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  More details
                </summary>
                <div className="mt-3">
                  <FieldGrid
                    fields={fields.filter((f) => !f.stamp && f.more)}
                    draft={draft}
                    onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
                    data={data}
                  />
                </div>
              </details>
            )}

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
