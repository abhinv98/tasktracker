"use client";

import { useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui";
import { Users, Clock, CheckCircle2, AlertCircle, Filter } from "lucide-react";

interface InternalJsrTabProps {
  brandId: Id<"brands">;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100" },
  "in-progress": { label: "In Progress", color: "text-amber-600", bg: "bg-amber-50" },
  review: { label: "Review", color: "text-purple-600", bg: "bg-purple-50" },
  done: { label: "Done", color: "text-green-600", bg: "bg-green-50" },
};

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

  const groupedByMember = useMemo(() => {
    const map = new Map<string, { name: string; tasks: typeof filtered }>();
    for (const t of filtered) {
      const key = t.assigneeId;
      if (!map.has(key)) map.set(key, { name: t.assigneeName, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    return [...map.entries()].sort((a, b) => b[1].tasks.length - a[1].tasks.length);
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
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <Filter className="h-4 w-4" />
          <span className="text-[12px] font-medium">Filter:</span>
        </div>
        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
        >
          <option value="">All Members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {(filterStatus || filterMember) && (
          <button
            onClick={() => { setFilterStatus(""); setFilterMember(""); }}
            className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-[11px] text-[var(--text-muted)] ml-auto">
          {filtered.length} task{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grouped by team member */}
      {groupedByMember.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            {overview.length === 0 ? "No tasks assigned for this brand yet." : "No tasks match the current filters."}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {groupedByMember.map(([assigneeId, { name, tasks }]) => (
          <div key={assigneeId} className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-primary)] border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[var(--accent-admin)]/10 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-[var(--accent-admin)]">
                    {name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-[13px] text-[var(--text-primary)]">{name}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{tasks[0]?.teamName ?? "—"}</p>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {tasks.map((task) => {
                const cfg = STATUS_CONFIG[task.taskStatus] ?? STATUS_CONFIG.pending;
                return (
                  <div key={task._id} className="px-5 py-3 flex items-center gap-4 hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{task.taskTitle}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] truncate">Brief: {task.briefTitle}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-[var(--text-muted)]">Overseer</p>
                      <p className="text-[11px] font-medium text-[var(--text-primary)]">{task.managerName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-[var(--text-muted)]">Team Lead</p>
                      <p className="text-[11px] font-medium text-[var(--text-primary)]">{task.teamLeadName}</p>
                    </div>
                    <div className="shrink-0 w-20 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color} ${cfg.bg}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="shrink-0 w-20 text-right">
                      {task.deadline ? (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-disabled)]">No deadline</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
