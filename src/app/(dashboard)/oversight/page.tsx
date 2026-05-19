"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui";
import { Eye, Search, Filter } from "lucide-react";
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

export default function OversightPage() {
  const user = useQuery(api.users.getCurrentUser);
  const [status, setStatus] = useState("");
  const [brandId, setBrandId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [search, setSearch] = useState("");

  const board = useQuery(api.oversight.getOversightBoard, {
    ...(status ? { status } : {}),
    ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
    ...(managerId ? { managerId: managerId as Id<"users"> } : {}),
    ...(assigneeId ? { assigneeId: assigneeId as Id<"users"> } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  if (user === undefined || board === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (!user || board === null) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Access denied. Oversight is restricted to super-admin oversight.
        </p>
      </div>
    );
  }

  const s = board.summary;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-2">
        <Eye className="h-5 w-5 text-[var(--accent-admin)]" />
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Oversight
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Every task — employee, brand, status, and assigning brand manager.
          </p>
        </div>
      </div>

      {/* Summary */}
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

      {/* Filters */}
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
        <span className="text-[12px] text-[var(--text-muted)] ml-auto">
          {board.total} task{board.total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
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
                  colSpan={8}
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
                return (
                  <tr
                    key={r._id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[260px]">
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
                        style={{
                          background: `${cfg.color}1a`,
                          color: cfg.color,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {r.managerName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate">
                      {r.briefTitle}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {fmt(r.deadline)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {fmt(r.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
