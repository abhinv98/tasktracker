"use client";

import { useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Filter, Inbox } from "lucide-react";

interface InternalJsrTabProps {
  brandId: Id<"brands">;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100" },
  "in-progress": { label: "In Progress", color: "text-amber-600", bg: "bg-amber-50" },
  review: { label: "Review", color: "text-purple-600", bg: "bg-purple-50" },
  done: { label: "Done", color: "text-green-600", bg: "bg-green-50" },
  "on-hold": { label: "On hold", color: "text-slate-600", bg: "bg-slate-100" },
};

function fmtDate(ts: number | undefined): string {
  if (ts === undefined) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDateShort(ts: number | undefined): string {
  if (ts === undefined) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function InternalJsrTab({ brandId }: InternalJsrTabProps) {
  const overview = useQuery(api.brands.getBrandTeamOverview, { brandId });
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMember, setFilterMember] = useState("");

  const members = useMemo(() => {
    if (!overview) return [];
    const map = new Map<string, string>();
    for (const t of overview) {
      if (!map.has(t.assigneeId)) map.set(t.assigneeId, t.assigneeName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [overview]);

  const filtered = useMemo(() => {
    if (!overview) return [];
    return overview.filter((t) => {
      if (filterStatus && t.taskStatus !== filterStatus) return false;
      if (filterMember && t.assigneeId !== filterMember) return false;
      return true;
    });
  }, [overview, filterStatus, filterMember]);

  const sortedRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = a.deadline ?? Number.MAX_SAFE_INTEGER;
      const db = b.deadline ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return a.taskTitle.localeCompare(b.taskTitle);
    });
  }, [filtered]);

  if (overview === undefined) {
    return <p className="text-[14px] text-[var(--text-secondary)] py-8">Loading...</p>;
  }

  const statusCounts = {
    pending: overview.filter((t) => t.taskStatus === "pending").length,
    "in-progress": overview.filter((t) => t.taskStatus === "in-progress").length,
    review: overview.filter((t) => t.taskStatus === "review").length,
    done: overview.filter((t) => t.taskStatus === "done").length,
  };

  return (
    <div>
      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(["pending", "in-progress", "review", "done"] as const).map((status) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(filterStatus === status ? "" : status)}
              className={`p-4 rounded-xl border transition-all text-left ${
                filterStatus === status
                  ? "border-[var(--accent-admin)] ring-2 ring-[var(--accent-admin)]/20"
                  : "border-[var(--border)] hover:border-[var(--accent-admin)]/40"
              } bg-white`}
            >
              <p className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</p>
              <p className="text-[24px] font-bold text-[var(--text-primary)] tabular-nums mt-1">
                {statusCounts[status]}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <Filter className="h-4 w-4" />
          <span className="text-[12px] font-medium">Filter:</span>
        </div>
        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
        >
          <option value="">All assignees</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {(filterStatus || filterMember) && (
          <button
            type="button"
            onClick={() => {
              setFilterStatus("");
              setFilterMember("");
            }}
            className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-[11px] text-[var(--text-muted)] ml-auto">
          {sortedRows.length} task{sortedRows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {sortedRows.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-[var(--border)] bg-white">
          <Inbox className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            {overview.length === 0 ? "No tasks for this brand yet." : "No tasks match the current filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Task
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Assignee
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Deadline
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Assigned
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Submitted
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Approved
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Overseer
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                    Team lead
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((task) => {
                  const cfg =
                    STATUS_CONFIG[task.taskStatus] ?? STATUS_CONFIG.pending;
                  return (
                    <tr
                      key={task._id}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-3 py-2.5 align-top max-w-[240px]">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug">
                          {task.taskTitle}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate" title={task.briefTitle}>
                          {task.briefTitle}
                        </p>
                        <p className="text-[10px] text-[var(--text-disabled)] mt-0.5">{task.teamName}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-[var(--text-primary)]">
                        {task.assigneeName}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color} ${cfg.bg}`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {task.deadline ? fmtDateShort(task.deadline) : "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {fmtDate(task.assignedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {fmtDate(task.latestSubmittedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {fmtDate(task.latestApprovedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px] text-[var(--text-primary)] max-w-[120px]">
                        <span className="line-clamp-2">{task.managerName}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px] text-[var(--text-primary)] max-w-[120px]">
                        <span className="line-clamp-2">{task.teamLeadName}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
