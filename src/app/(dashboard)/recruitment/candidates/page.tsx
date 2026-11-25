"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeftRight, Check, Pause, RotateCcw, Users2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, PageHeader, SkeletonPageHeader, SkeletonTable } from "@/components/ui";
import { FilterTray, SearchField, StatChips } from "@/components/ui/Tray";
import { ApplicantsTable, NarrowTray, placesOf, useLast, useMoveApplicants, type Applicant } from "@/components/recruitment/ApplicantsTable";
import { CandidatePanel } from "@/components/recruitment/CandidatePanel";
import { MoveApplicants } from "@/components/recruitment/MoveApplicants";
import { useHrData } from "@/components/recruitment/hrShared";
import { NO_NARROW, narrow, type Narrow } from "@/lib/applicantSearch";
import { POSITION_STATUSES, isPositionStatus, positionStatus, type PositionStatus } from "@/lib/recruitStages";

type Chip = PositionStatus | "all";
const NEWEST = 200;

/**
 * Everyone who applied, across every position. A position's page answers "who
 * applied for this"; this answers "who do we know", which is the question when a
 * role opens and someone good applied for another one six months ago.
 */
export default function AllApplicantsPage() {
  return (
    <Suspense>
      <AllApplicants />
    </Suspense>
  );
}

function AllApplicants() {
  const params = useSearchParams();
  const asked = params.get("status");
  const jobs = useQuery(api.recruitment.listJobs);
  const hr = useHrData();
  const move = useMoveApplicants();
  const [chip, setChip] = useState<Chip>(isPositionStatus(asked) ? asked : params.get("q") ? "all" : "new");
  const [filter, setFilter] = useState<Narrow>({ ...NO_NARROW, search: params.get("q") ?? "" });
  const [job, setJob] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [panel, setPanel] = useState<{ id: Id<"recruitCandidates">; order: Id<"recruitCandidates">[] } | null>(null);

  // The newest of the list picked, or a search of everyone. The last answer
  // stays up while the next one loads, so typing never empties the page.
  const search = filter.search.trim();
  const searching = search.length >= 2;
  const newest = useQuery(
    api.recruitment.recentApplicants,
    searching ? "skip" : { limit: NEWEST, ...(chip === "all" ? {} : { status: chip }), ...(job ? { jobSourceId: Number(job) } : {}) }
  );
  const found = useQuery(api.recruitment.searchCandidates, searching ? { search, limit: 300 } : "skip");
  const list = useLast((searching ? found : newest) as Applicant[] | undefined, searching ? "search" : `${chip} ${job}`);

  const places = useMemo(() => placesOf(hr), [hr]);
  /** The position someone is for: the role they named, where they named one (the server works it out). */
  const at = (a: Applicant) => String((a as Applicant & { positionId?: number }).positionId ?? a.jobSourceId);
  const rows = useMemo(
    () =>
      // Matched here too: while the next answer loads, the last one is narrowed to what is typed now.
      narrow(list ?? [], searching ? filter : { ...filter, search: "" })
        .filter((a) => !job || at(a) === job)
        .filter((a) => chip === "all" || positionStatus(a.stage) === chip),
    [list, filter, job, chip, searching]
  );
  const picks = useMemo(() => new Set(rows.filter((r) => selected.has(r._id)).map((r) => r._id as string)), [rows, selected]);

  if (jobs === undefined) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={6} what="applicants" />
      </div>
    );
  }

  const total = (key: "fresh" | "shortlisted" | "onHold" | "rejected" | "total") =>
    jobs.filter((j) => !job || String(j.sourceId) === job).reduce((n, j) => n + j[key], 0);
  const matching = narrow(list ?? [], filter).filter((a) => !job || at(a) === job);
  const found_ = (c: Chip) => (list ? matching.filter((a) => c === "all" || positionStatus(a.stage) === c).length : undefined);
  const ids = [...picks] as Id<"recruitCandidates">[];
  const reset = (fn: () => void) => {
    fn();
    setSelected(new Set());
  };
  async function moveSelected(to: PositionStatus) {
    if (ids.length && (await move(ids, to))) setSelected(new Set());
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="All applicants" subtitle="Everyone who applied, across every position." icon={Users2} />

      <StatChips<Chip>
        className="mb-3"
        label="Filter by decision"
        value={chip}
        onChange={(c) => reset(() => setChip(c))}
        options={(
          [
            ["new", "fresh"],
            ["shortlisted", "shortlisted"],
            ["on_hold", "onHold"],
            ["rejected", "rejected"],
          ] as const
        )
          .map(([value, key]) => {
            const s = POSITION_STATUSES.find((x) => x.value === value)!;
            return { value: value as Chip, label: s.label, dot: s.color, count: searching ? found_(value) : total(key) };
          })
          .concat({ value: "all" as Chip, label: "All", dot: "", count: searching ? found_("all") : total("total") })
          .map((o) => ({ ...o, dot: o.dot || undefined }))}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchField
          value={filter.search}
          onChange={(text) => reset(() => setFilter((f) => ({ ...f, search: text })))}
          placeholder="Name, email, phone or role"
          label="Search all applicants"
        />
        <FilterTray
          label="Position"
          allLabel="Any position"
          value={job}
          // A role sits under its position, and is picked like one.
          options={jobs.map((j) => ({ value: String(j.sourceId), label: `${j.parentSourceId != null ? "\u2003" : ""}${j.name}` }))}
          onChange={(v) => reset(() => setJob(v))}
        />
        <NarrowTray pay={hr?.pay !== false} value={filter} onChange={(n) => reset(() => setFilter(n))} />
        <span className="ml-auto text-[12px] tabular-nums text-[var(--text-muted)]">
          {list === undefined
            ? "Looking…"
            : searching
            ? `${rows.length}${list.length === 300 ? "+" : ""} ${rows.length === 1 ? "match" : "matches"}`
            : list.length === NEWEST
              ? `The newest ${NEWEST}. Search to reach everyone.`
              : `${rows.length}`}
        </span>
      </div>

      {picks.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 shadow-sm">
          <span className="text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{picks.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button onClick={() => moveSelected("shortlisted")}>
              <Check size={14} />
              Shortlist
            </Button>
            <Button variant="secondary" onClick={() => moveSelected("on_hold")}>
              <Pause size={14} />
              Hold
            </Button>
            <Button variant="secondary" onClick={() => moveSelected("rejected")}>
              <X size={14} />
              Reject
            </Button>
            <Button variant="secondary" onClick={() => moveSelected("new")}>
              <RotateCcw size={14} />
              Back to New
            </Button>
            <Button variant="secondary" onClick={() => setMoving(true)}>
              <ArrowLeftRight size={14} />
              Move
            </Button>
          </div>
        </div>
      )}

      {list === undefined ? (
        <SkeletonTable rows={8} cols={6} what="applicants" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users2} title="Nobody matches" description="Try fewer letters, another list above, or clear the filters." />
      ) : (
        <ApplicantsTable
          rows={rows}
          roleColumn={{ label: "Position", of: (a) => a.jobName ?? "" }}
          selected={picks}
          onSelect={setSelected}
          onOpen={(id, order) => setPanel({ id, order })}
          onMove={(a, to) => move([a._id], to, a.name)}
          places={places}
          // The server has left the figures out already; this only drops the empty columns.
          pay={hr?.pay !== false}
        />
      )}

      {moving && (
        <MoveApplicants
          ids={ids}
          who={ids.length === 1 ? rows.find((r) => r._id === ids[0])?.name : undefined}
          onClose={() => setMoving(false)}
          onMoved={() => setSelected(new Set())}
        />
      )}

      {panel && (
        <CandidatePanel
          candidateId={panel.id}
          order={panel.order}
          onGo={(id) => setPanel((p) => p && { ...p, id })}
          onClose={() => setPanel(null)}
          onOpenOther={(id) => setPanel((p) => p && { ...p, id })}
        />
      )}
    </div>
  );
}
