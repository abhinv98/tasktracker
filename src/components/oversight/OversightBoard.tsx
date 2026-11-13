"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, StatStrip, StatTile, StatusBadge } from "@/components/ui";
import { TaskNavigator } from "@/components/TaskNavigator";
import {
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  CalendarDays,
  X,
} from "lucide-react";
import { taskStatusMeta } from "@/lib/status";
import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { fieldClass, iconButtonClass } from "@/components/ui/classes";

const ICON_BTN = iconButtonClass;
const FIELD = fieldClass;
// Badge variant="warning" as a class, for the one chip here that needs a title attribute.
const WARN_BADGE =
  "inline-flex items-center px-1.5 py-px font-medium text-[11px] leading-[16px] whitespace-nowrap rounded bg-[var(--warning-dim)] text-[var(--warning)]";

function fmt(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const isImg = (n: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(n);

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ApprovedWorkDetail({ taskId }: { taskId: Id<"tasks"> }) {
  const work = useQuery(api.oversight.getApprovedWorkForTask, { taskId });
  if (work === undefined)
    return (
      <p className="text-[12px] text-[var(--text-muted)] py-3">Loading…</p>
    );
  if (work === null)
    return (
      <p className="text-[12px] text-[var(--text-muted)] py-3">
        Not available.
      </p>
    );
  if (work.length === 0)
    return (
      <p className="text-[12px] text-[var(--text-muted)] py-3">
        No approved work recorded for this task.
      </p>
    );
  return (
    <div className="space-y-3 py-2">
      {work.map((d: any) => (
        <div
          key={d._id}
          className="rounded-lg border border-[var(--border)] bg-white p-3"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent-employee-text)]" />
            <span className="text-[12px] font-medium text-[var(--text-primary)]">
              {d.approvalSource === "client"
                ? "Client approved"
                : "Internal approval"}
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">
              · by {d.submitterName} · {fmt(d.approvedAt)}
            </span>
          </div>
          {d.message && (
            <p className="text-[12px] text-[var(--text-secondary)] mb-1.5">
              {d.message}
            </p>
          )}
          {d.clientNote && (
            <p className="text-[12px] text-[var(--accent-employee-text)] bg-[var(--accent-employee-dim)] rounded-md px-2 py-1 mb-1.5">
              “{d.clientNote}”
            </p>
          )}
          {d.reviewNote && (
            <p className="text-[12px] text-[var(--text-muted)] mb-1.5">
              Review note: {d.reviewNote}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {d.link && (
              <a
                href={d.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium text-[var(--accent-admin-text)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Link
              </a>
            )}
            {d.files.map((f: any, i: number) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                {isImg(f.name) ? (
                  <img
                    src={f.url}
                    alt={f.name}
                    className="h-4 w-4 object-cover rounded"
                  />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                <span className="max-w-[160px] truncate">{f.name}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OversightBoard() {
  const [status, setStatus] = useState("");
  const [brandId, setBrandId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Pagination: the board can hold 1000+ rows; render 50 at a time. Any
  // filter change starts back at page 1 (state adjusted during render — the
  // filters live in the query args, so there's no single onChange to hook).
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const filterKey = JSON.stringify([
    status, brandId, managerId, teamId, assigneeId, search, startDate, endDate,
  ]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(0);
  }

  const rangeInvalid = Boolean(
    startDate && endDate && startDate > endDate
  );

  const liveBoard = useQuery(api.oversight.getOversightBoard, {
    ...(status ? { status } : {}),
    ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
    ...(teamId ? { teamId: teamId as Id<"teams"> } : {}),
    ...(managerId ? { managerId: managerId as Id<"users"> } : {}),
    ...(assigneeId ? { assigneeId: assigneeId as Id<"users"> } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(startDate && !rangeInvalid ? { startDate } : {}),
    ...(endDate && !rangeInvalid ? { endDate } : {}),
  });
  // useQuery goes back to undefined on every arg change; keep showing the last
  // result so the filter bar (and the focused search box) stays mounted.
  const [lastBoard, setLastBoard] = useState(liveBoard);
  if (liveBoard !== undefined && liveBoard !== lastBoard) setLastBoard(liveBoard);
  const board = liveBoard ?? lastBoard;

  if (board === undefined)
    return (
      <p className="text-[13px] text-[var(--text-secondary)] py-8">
        Loading...
      </p>
    );
  if (board === null)
    return (
      <p className="text-[13px] text-[var(--text-secondary)] py-8">
        Access denied. Oversight is open to oversight admins, brand managers,
        and team leads.
      </p>
    );

  const s = board.summary;
  const access = board.access;
  const scopeLabel =
    access.kind === "admin"
      ? "Showing every task across the org."
      : (() => {
          const parts: string[] = [];
          if (access.brandCount > 0) {
            parts.push(
              `${access.brandCount} brand${access.brandCount === 1 ? "" : "s"} you manage`
            );
          }
          if (access.teamMemberCount > 0) {
            parts.push(
              `${access.teamMemberCount} team member${access.teamMemberCount === 1 ? "" : "s"} you lead`
            );
          }
          return `Scoped to ${parts.join(" + ")}.`;
        })();

  const pageCount = Math.max(1, Math.ceil(board.rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = board.rows.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE
  );

  return (
    <div>
      <p className="text-[12px] text-[var(--text-muted)] mb-4">{scopeLabel}</p>
      <StatStrip className="mb-4">
        {[
          // Total counts creative deliverables, not rows: a task holding 15
          // creatives counts 15. The per-row CREATIVES tag shows the split.
          { label: "Total", value: s.creativeTotal },
          { label: "Pending", value: s.pending },
          { label: "In Progress", value: s.inProgress },
          { label: "Review", value: s.review },
          { label: "Done", value: s.done },
          { label: "On Hold", value: s.onHold },
        ].map((c) => (
          <StatTile key={c.label} label={c.label} value={c.value} />
        ))}
      </StatStrip>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
          className={FIELD}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
          <option value="on-hold">On Hold</option>
        </select>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          aria-label="Brand"
          className={FIELD}
        >
          <option value="">All brands</option>
          {board.filterOptions.brands.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          aria-label="Brand manager"
          className={FIELD}
        >
          <option value="">All brand managers</option>
          {board.filterOptions.managers.map((m) => (
            <option key={m._id} value={m._id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          aria-label="Employee"
          className={FIELD}
        >
          <option value="">All employees</option>
          {board.filterOptions.assignees.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          aria-label="Team"
          className={FIELD}
          title="Filter by team. Shows tasks owned by anyone on that team"
        >
          <option value="">All teams</option>
          {board.filterOptions.teams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            aria-label="Search"
            className={`${FIELD} pl-8`}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <CalendarDays className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate || undefined}
            aria-label="From date"
            className={FIELD}
            title="From: start of range (inclusive)"
          />
          <span className="text-[12px] text-[var(--text-muted)]">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
            aria-label="To date"
            className={FIELD}
            title="To: end of range (inclusive)"
          />
          <Button
            variant="secondary"
            onClick={() => {
              const t = todayStr();
              setStartDate(t);
              setEndDate(t);
            }}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 6);
              const fmtIso = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              setStartDate(fmtIso(start));
              setEndDate(fmtIso(end));
            }}
          >
            Last 7 days
          </Button>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              title="Clear range"
              aria-label="Clear range"
              className={ICON_BTN}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {rangeInvalid && (
            <span className="text-[12px] font-medium text-[var(--danger)]">
              From must be on or before To
            </span>
          )}
        </div>
        <span className="text-[12px] tabular-nums text-[var(--text-muted)] ml-auto">
          {board.total} task{board.total !== 1 ? "s" : ""}
          {s.multiCreativeTasks > 0 && ` · ${s.creativeTotal} creatives`}
        </span>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-left text-[var(--text-muted)] whitespace-nowrap">
              <th className="px-3 py-2.5 w-6"></th>
              <th className="px-4 py-2.5 font-medium">Task</th>
              <th className="px-4 py-2.5 font-medium">Employee</th>
              <th className="px-4 py-2.5 font-medium">Brand</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Assigned by</th>
              <th className="px-4 py-2.5 font-medium">Brief</th>
              <th className="px-4 py-2.5 font-medium">Assigned</th>
              <th className="px-4 py-2.5 font-medium">Deadline</th>
              <th className="px-4 py-2.5 font-medium">Submitted</th>
              <th className="px-4 py-2.5 font-medium">Completed</th>
              <th className="px-4 py-2.5 font-medium text-right">Changes</th>
              <th className="px-4 py-2.5 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-10 text-center text-[var(--text-muted)]"
                >
                  No tasks match these filters.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const meta = taskStatusMeta(r.status);
                const cfg = { color: meta.dot, label: meta.label };
                const isDone = r.status === "done";
                const isOpen = expanded === r._id;
                return (
                  <FragmentRow
                    key={r._id}
                    isDone={isDone}
                    isOpen={isOpen}
                    onToggle={() =>
                      isDone && setExpanded(isOpen ? null : r._id)
                    }
                    onOpenTask={() => setOpenTaskId(r._id)}
                    r={r}
                    cfg={cfg}
                  />
                );
              })
            )}
          </tbody>
        </table>
        </div>
        <PaginationFooter
          page={clampedPage}
          pageCount={pageCount}
          totalRows={board.rows.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      <TaskNavigator
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}

function FragmentRow({
  r,
  cfg,
  isDone,
  isOpen,
  onToggle,
  onOpenTask,
}: {
  r: any;
  cfg: { color: string; label: string };
  isDone: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onOpenTask: () => void;
}) {
  return (
    <>
      <tr
        onClick={onOpenTask}
        className="border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-primary)] transition-colors"
        title="Open task"
      >
        <td className="px-3 py-3 text-[var(--text-muted)]">
          {isDone ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              title={isOpen ? "Hide approved work" : "Show approved work"}
              aria-label={isOpen ? "Hide approved work" : "Show approved work"}
              aria-expanded={isOpen}
              className={`${ICON_BTN} -my-2 -mx-1.5`}
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--text-primary)] font-medium max-w-[240px]">
          <span className="line-clamp-2">{r.title}</span>
          {r.creativeSlots > 1 && (
            <span
              className="inline-flex mt-1"
              title={`This task holds ${r.creativeSlots} creative deliverables — ${r.creativesSubmitted} submitted`}
            >
              <Badge>
                {r.creativesSubmitted}/{r.creativeSlots} creatives
              </Badge>
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)]">
          {r.assigneeName}
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] whitespace-nowrap">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: r.brandColor }}
            />
            {r.brandName}
          </span>
        </td>
        <td className="px-4 py-3">
          <StatusBadge color={cfg.color} label={cfg.label} />
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)]">
          {r.managerName}
        </td>
        <td className="px-4 py-3 text-[var(--text-muted)] max-w-[160px] truncate">
          {r.briefTitle}
        </td>
        <td
          className="px-4 py-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap"
          title="When this task was assigned to the employee"
        >
          {fmt(r.assignedAt)}
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <span>{fmt(r.deadline)}</span>
            {r.carryOverDays > 0 && (
              <span
                className={WARN_BADGE}
                title="Worklog task rolled forward, not completed by its original deadline"
              >
                Carried over · {r.carryOverDays}d
              </span>
            )}
          </div>
        </td>
        <td
          className="px-4 py-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap"
          title={
            r.lastSubmittedAt
              ? "Most recent deliverable submitted by the employee"
              : "No deliverable submitted yet"
          }
        >
          {fmt(r.lastSubmittedAt)}
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
          {fmt(r.completedAt)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums" title="Number of change-request rounds on this task">
          {r.changesCount > 0 ? (
            <span className="font-medium text-[var(--text-primary)]">
              {r.changesCount}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">0</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {r.deadlineExtended && (
              <Badge>Extended</Badge>
            )}
            {r.isOverdue && (
              <Badge variant="danger">Overdue</Badge>
            )}
            {!r.deadlineExtended && !r.isOverdue && (
              <span className="text-[var(--text-muted)]">-</span>
            )}
          </div>
        </td>
      </tr>
      {isDone && isOpen && (
        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          <td colSpan={12} className="px-6 py-2">
            <p className="text-[12px] font-medium text-[var(--text-muted)] mt-2 mb-1">
              Approved work
            </p>
            <ApprovedWorkDetail taskId={r._id as Id<"tasks">} />
          </td>
        </tr>
      )}
    </>
  );
}
