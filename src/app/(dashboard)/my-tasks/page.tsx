"use client";

import { useState } from "react";
import { isTaskOverdue, taskStatusMeta } from "@/lib/status";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Badge, Button, PageHeader, Panel, PanelEmpty, SegmentedTabs, StatStrip, StatTile, StatusBadge, TaskDetailModal, SkeletonPageHeader, SkeletonList } from "@/components/ui";
import { TaskNavigator } from "@/components/TaskNavigator";
import {
  ListTodo,
  Eye,
  Filter,
  Search,
  X,
} from "lucide-react";
import { fieldClass } from "@/components/ui/classes";

const FILTER_FIELD = fieldClass;
const TH = "px-4 py-2.5 text-left font-medium text-[12px] text-[var(--text-muted)]";

function fmt(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const meta = taskStatusMeta(status);
  return <StatusBadge color={meta.dot} label={meta.label} />;
}

/** Brand identity as a dot + name, the way the dashboard rows show it. */
function BrandTag({ name, color }: { name?: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] whitespace-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} aria-hidden />
      {name}
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

  // Asking for Done by status wins over the "Hide done" tick.
  const hidingDone = hideDone && statusFilter !== "done";
  const s = search.trim().toLowerCase();
  const matches = (t: any) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (brandFilter && t.brandId !== brandFilter) return false;
    if (hidingDone && t.status === "done") return false;
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

  // "of N" is for rows the filters removed. Finished tasks tucked away by
  // "Hide done" don't count: "12 of 211" read as 199 open tasks gone missing.
  const countLabel = (shown: number, all: { status: string }[]) => {
    const total = hidingDone ? all.filter((t) => t.status !== "done").length : all.length;
    return shown !== total ? `${shown} of ${total}` : `${shown}`;
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

      <StatStrip className="mb-4">
        <StatTile label="Assigned to me, open" value={counts.assignedToMeOpen} />
        <StatTile label="Assigned to me, all" value={counts.assignedToMe} />
        <StatTile label="Supervising, open" value={counts.supervisingOpen} />
        <StatTile label="Awaiting my review" value={counts.needsReview} />
      </StatStrip>

      {/* Filter bar */}
      <div className="rounded-lg border border-[var(--border)] bg-white p-3 mb-4 flex flex-wrap items-center gap-2">
        <SegmentedTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "Assigned to me" },
            { value: "supervising", label: "Supervising" },
          ]}
        />
        <div className="flex items-center gap-1.5 pl-1 text-[12px] text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" aria-hidden />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${FILTER_FIELD} px-2.5`}
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
          className={`${FILTER_FIELD} px-2.5`}
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
            className={`${FILTER_FIELD} pl-8 pr-2.5 w-[180px] placeholder:text-[var(--text-disabled)]`}
          />
        </div>
        <label className="flex items-center gap-1.5 pl-1 text-[13px] text-[var(--text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent-admin)]"
          />
          Hide done
        </label>
        {filtersActive && (
          <Button variant="ghost" onClick={clearFilters} className="ml-auto">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Assigned to me */}
      {showMine && (
      <Panel
        className="mb-4"
        title={`Assigned to me (${countLabel(filteredMine.length, assignedToMe)})`}
      >
        {filteredMine.length === 0 ? (
          <PanelEmpty>Nothing is assigned to you right now.</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className={TH}>Task</th>
                  <th className={TH}>Brand</th>
                  <th className={TH}>Brief</th>
                  <th className={TH}>Assigned by</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {filteredMine.map((t: any) => (
                  <tr
                    key={t._id}
                    onClick={() => setOpenTaskId(t._id)}
                    className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer"
                  >
                    <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium max-w-[260px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <BrandTag name={t.brandName} color={t.brandColor} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] max-w-[180px] truncate">
                      {t.briefTitle}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {t.assignedByName}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={t.status} />
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums whitespace-nowrap ${isTaskOverdue(t) ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                      {fmt(t.deadline)}
                      {isTaskOverdue(t) && <Badge variant="danger" className="ml-1.5">Overdue</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      )}

      {/* Supervising */}
      {showSup && (
      <Panel
        title={`Supervising: tasks I delegated (${countLabel(filteredSup.length, supervising)})`}
      >
        <p className="px-4 py-2.5 border-b border-[var(--border-subtle)] text-[12px] text-[var(--text-muted)]">
          Tracking progress, reviewing and marking these done is your
          responsibility. They clear once the work is approved/done.
        </p>
        {filteredSup.length === 0 ? (
          <PanelEmpty>You haven&apos;t delegated any active tasks.</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className={TH}>Task</th>
                  <th className={TH}>Assigned to</th>
                  <th className={TH}>Brand</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Deadline</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {filteredSup.map((t: any) => (
                  <tr
                    key={t._id}
                    onClick={() => setNavTaskId(t._id)}
                    className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer"
                  >
                    <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium max-w-[240px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {t.assigneeName}
                    </td>
                    <td className="px-4 py-2.5">
                      <BrandTag name={t.brandName} color={t.brandColor} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <StatusPill status={t.status} />
                        {/* The one row state the viewer has to act on. */}
                        {t.needsReview && <Badge variant="warning">Review now</Badge>}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums whitespace-nowrap ${isTaskOverdue(t) ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                      {fmt(t.deadline)}
                      {isTaskOverdue(t) && <Badge variant="danger" className="ml-1.5">Overdue</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.needsReview && (
                        <Button
                          variant="secondary"
                          className="-my-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push("/deliverables");
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
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
