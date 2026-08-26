"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Card, PageHeader, SegmentedTabs, TaskDetailModal, SkeletonPageHeader, SkeletonList } from "@/components/ui";
import { TaskNavigator } from "@/components/TaskNavigator";
import { TASK_STATUS_CONFIG } from "@/lib/statusColors";
import {
  ListTodo,
  Eye,
  ClipboardCheck,
  CalendarClock,
  Filter,
  Search,
  X,
} from "lucide-react";

const STATUS = TASK_STATUS_CONFIG as Record<
  string,
  { label: string; color: string; bg: string }
>;

function fmt(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS[status] ?? {
    label: status,
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

export default function MyTasksPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const data = useQuery(api.tasks.listMyWork);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [navTaskId, setNavTaskId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine" | "supervising">("all");
  const [hideDone, setHideDone] = useState(true);

  if (user === undefined || data === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonList rows={6} what="your tasks" />
      </div>
    );
  }
  if (!user || data === null) {
    return (
      <div className="p-8">
        <p className="text-[15px] text-[var(--text-secondary)]">
          Access denied. My Tasks is for brand managers &amp; super-admins.
        </p>
      </div>
    );
  }

  const { assignedToMe, supervising, counts } = data;

  // Build brand filter options from whatever brands appear in either list.
  const brandMap = new Map<string, string>();
  for (const t of [...assignedToMe, ...supervising] as any[]) {
    if (t.brandId) brandMap.set(t.brandId, t.brandName ?? "-");
  }
  const brandOptions = [...brandMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const s = search.trim().toLowerCase();
  const matches = (t: any) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (brandFilter && t.brandId !== brandFilter) return false;
    if (hideDone && t.status === "done") return false;
    if (s) {
      const hay = [
        t.title,
        t.brandName,
        t.briefTitle,
        t.assigneeName,
        t.assignedByName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  };
  const filteredMine = (assignedToMe as any[]).filter(matches);
  const filteredSup = (supervising as any[]).filter(matches);

  const filtersActive =
    !!statusFilter || !!brandFilter || !!search.trim() || !hideDone || scope !== "all";

  const clearFilters = () => {
    setStatusFilter("");
    setBrandFilter("");
    setSearch("");
    setScope("all");
    setHideDone(true);
  };

  const showMine = scope !== "supervising";
  const showSup = scope !== "mine";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My Tasks"
        icon={ListTodo}
        subtitle="Work assigned to you, plus the tasks you delegated and need to track & sign off."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Assigned to me (open)", value: counts.assignedToMeOpen },
          { label: "Assigned to me (all)", value: counts.assignedToMe },
          { label: "Supervising (open)", value: counts.supervisingOpen },
          { label: "Awaiting my review", value: counts.needsReview },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              {c.label}
            </p>
            <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1">
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-3 mb-6 flex flex-wrap items-center gap-3">
        <SegmentedTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "Assigned to me" },
            { value: "supervising", label: "Supervising" },
          ]}
        />
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
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
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
        >
          <option value="">All brands</option>
          {brandOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] pl-8 pr-3 py-1.5 text-[13px] w-[180px]"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
          />
          Hide done
        </label>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Assigned to me */}
      {showMine && (
      <section className="mb-8">
        <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[var(--text-muted)]" />
          Assigned to me ({filteredMine.length}
          {filteredMine.length !== assignedToMe.length ? ` of ${assignedToMe.length}` : ""})
        </h2>
        {filteredMine.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-[var(--border)] bg-white">
            <p className="text-[13px] text-[var(--text-muted)]">
              Nothing is assigned to you right now.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Brief</th>
                  <th className="px-4 py-3 font-medium">Assigned by</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {filteredMine.map((t: any) => (
                  <tr
                    key={t._id}
                    onClick={() => setOpenTaskId(t._id)}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[260px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                        style={{ background: t.brandColor }}
                      >
                        {t.brandName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate">
                      {t.briefTitle}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t.assignedByName}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {fmt(t.deadline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Supervising */}
      {showSup && (
      <section>
        <h2 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--text-muted)]" />
          Supervising: tasks I delegated ({filteredSup.length}
          {filteredSup.length !== supervising.length ? ` of ${supervising.length}` : ""})
        </h2>
        <p className="text-[12px] text-[var(--text-muted)] mb-3">
          Tracking progress, reviewing and marking these done is your
          responsibility. They clear once the work is approved/done.
        </p>
        {filteredSup.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-[var(--border)] bg-white">
            <p className="text-[13px] text-[var(--text-muted)]">
              You haven't delegated any active tasks.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Assigned to</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSup.map((t: any) => (
                  <tr
                    key={t._id}
                    onClick={() => setNavTaskId(t._id)}
                    className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer ${
                      t.needsReview ? "bg-purple-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[240px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t.assigneeName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                        style={{ background: t.brandColor }}
                      >
                        {t.brandName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusPill status={t.status} />
                        {t.needsReview && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">
                            Review now
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {fmt(t.deadline)}
                    </td>
                    <td className="px-4 py-3">
                      {t.needsReview && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push("/deliverables");
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--accent-admin-text)] hover:bg-[var(--bg-hover)]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      <TaskNavigator
        taskId={navTaskId}
        onClose={() => setNavTaskId(null)}
      />

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}
