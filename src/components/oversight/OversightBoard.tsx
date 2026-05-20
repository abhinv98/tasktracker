"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui";
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
import { TASK_STATUS_CONFIG } from "@/lib/statusColors";

const STATUS = TASK_STATUS_CONFIG as Record<
  string,
  { color: string; label: string }
>;

function fmt(ts: number | null): string {
  if (!ts) return "—";
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
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-[11px] font-medium text-[var(--text-primary)]">
              {d.approvalSource === "client"
                ? "Client approved"
                : "Internal approval"}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              · by {d.submitterName} · {fmt(d.approvedAt)}
            </span>
          </div>
          {d.message && (
            <p className="text-[12px] text-[var(--text-secondary)] italic mb-1.5">
              {d.message}
            </p>
          )}
          {d.clientNote && (
            <p className="text-[12px] text-emerald-700 bg-emerald-50 rounded px-2 py-1 mb-1.5">
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
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--accent-admin)] border border-[var(--border)] hover:bg-[var(--bg-hover)]"
              >
                <ExternalLink className="h-3 w-3" />
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
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]"
              >
                {isImg(f.name) ? (
                  <img
                    src={f.url}
                    alt={f.name}
                    className="h-4 w-4 object-cover rounded"
                  />
                ) : (
                  <FileText className="h-3 w-3" />
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
  const [assigneeId, setAssigneeId] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const board = useQuery(api.oversight.getOversightBoard, {
    ...(status ? { status } : {}),
    ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
    ...(managerId ? { managerId: managerId as Id<"users"> } : {}),
    ...(assigneeId ? { assigneeId: assigneeId as Id<"users"> } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(date ? { date } : {}),
  });

  if (board === undefined)
    return (
      <p className="text-[14px] text-[var(--text-secondary)] py-8">
        Loading...
      </p>
    );
  if (board === null)
    return (
      <p className="text-[14px] text-[var(--text-secondary)] py-8">
        Access denied. Oversight is restricted to super-admin oversight.
      </p>
    );

  const s = board.summary;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total", value: s.total },
          { label: "Pending", value: s.pending },
          { label: "In Progress", value: s.inProgress },
          { label: "Review", value: s.review },
          { label: "Done", value: s.done },
          { label: "On Hold", value: s.onHold },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              {c.label}
            </p>
            <p className="text-[22px] font-bold text-[var(--text-primary)] mt-1">
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
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
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
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
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
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
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
        >
          <option value="">All employees</option>
          {board.filterOptions.assignees.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] pl-8 pr-3 py-1.5 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
            title="Tasks created, due, or completed on this day"
          />
          <button
            onClick={() => setDate(todayStr())}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            Today
          </button>
          {date && (
            <button
              onClick={() => setDate("")}
              title="Clear date"
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-[12px] text-[var(--text-muted)] ml-auto">
          {board.total} task{board.total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
              <th className="px-3 py-3 w-6"></th>
              <th className="px-4 py-3 font-medium">Task</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Brand</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Assigned by</th>
              <th className="px-4 py-3 font-medium">Brief</th>
              <th className="px-4 py-3 font-medium">Deadline</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-[var(--text-muted)]"
                >
                  No tasks match these filters.
                </td>
              </tr>
            ) : (
              board.rows.map((r) => {
                const cfg = STATUS[r.status] ?? {
                  color: "#6b7280",
                  label: r.status,
                };
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
                    r={r}
                    cfg={cfg}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  r,
  cfg,
  isDone,
  isOpen,
  onToggle,
}: {
  r: any;
  cfg: { color: string; label: string };
  isDone: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[var(--border-subtle)] ${
          isDone
            ? "cursor-pointer hover:bg-[var(--bg-hover)]"
            : ""
        } ${isOpen ? "bg-[var(--bg-hover)]" : ""}`}
        title={isDone ? "Show approved work" : undefined}
      >
        <td className="px-3 py-3 text-[var(--text-muted)]">
          {isDone ? (
            isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : null}
        </td>
        <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[240px]">
          <span className="line-clamp-2">{r.title}</span>
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)]">
          {r.assigneeName}
        </td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
            style={{ background: r.brandColor }}
          >
            {r.brandName}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: `${cfg.color}1a`, color: cfg.color }}
          >
            {cfg.label}
          </span>
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)]">
          {r.managerName}
        </td>
        <td className="px-4 py-3 text-[var(--text-muted)] max-w-[160px] truncate">
          {r.briefTitle}
        </td>
        <td className="px-4 py-3 text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <span>{fmt(r.deadline)}</span>
            {r.carryOverDays > 0 && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 whitespace-nowrap"
                title="Worklog task rolled forward — not completed by its original deadline"
              >
                Carried over · {r.carryOverDays}d
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-[var(--text-muted)]">
          {fmt(r.createdAt)}
        </td>
      </tr>
      {isDone && isOpen && (
        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          <td colSpan={9} className="px-6 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-2 mb-1">
              Approved work
            </p>
            <ApprovedWorkDetail taskId={r._id as Id<"tasks">} />
          </td>
        </tr>
      )}
    </>
  );
}
