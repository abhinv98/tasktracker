"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { useState, useMemo, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Filter, Inbox, Tag as TagIcon } from "lucide-react";
import { Button, EmptyState, StatStrip, StatusBadge } from "@/components/ui";
import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { taskStatusMeta } from "@/lib/status";
import { fieldClass } from "@/components/ui/classes";

const FIELD = fieldClass;

interface InternalJsrTabProps {
  brandId: Id<"brands">;
}

function fmtDate(ts: number | undefined): string {
  if (ts === undefined) return "-";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDateShort(ts: number | undefined): string {
  if (ts === undefined) return "-";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function InternalJsrTab({ brandId }: InternalJsrTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const overview = useQuery(api.brands.getBrandTeamOverview, { brandId });
  const brandTags = useQuery(api.tasks.listBrandTags, { brandId });
  const setTaskTag = useMutation(api.tasks.setTaskTag);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMember, setFilterMember] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [editingTagFor, setEditingTagFor] = useState<Id<"tasks"> | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  async function saveTag(taskId: Id<"tasks">) {
    try {
      await setTaskTag({ taskId, tag: tagDraft.trim() || undefined });
    } catch {}
    setEditingTagFor(null);
    setTagDraft("");
  }

  const goToBrief = useCallback(
    (briefId: Id<"briefs">) => {
      const returnTo = encodeURIComponent(`${pathname}?tab=internal-jsr`);
      router.push(`/brief/${briefId}?returnTo=${returnTo}`);
    },
    [router, pathname]
  );

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
      if (filterTag && t.tag !== filterTag) return false;
      return true;
    });
  }, [overview, filterStatus, filterMember, filterTag]);

  const sortedRows = useMemo(() => {
    // Newest work first — with hundreds of rows, the latest tasks must not
    // live at the bottom of the scroll.
    return [...filtered].sort((a, b) => {
      const da = a.assignedAt ?? a.createdAt ?? 0;
      const db = b.assignedAt ?? b.createdAt ?? 0;
      if (da !== db) return db - da;
      return a.taskTitle.localeCompare(b.taskTitle);
    });
  }, [filtered]);

  // Client-side pagination: the query already returned everything, but
  // rendering 400+ rows at once makes the tab crawl.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => sortedRows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [sortedRows, clampedPage]
  );

  if (overview === undefined) {
    return <p className="text-[13px] text-[var(--text-secondary)] py-8">Loading...</p>;
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
      <StatStrip className="mb-4">
        {(["pending", "in-progress", "review", "done"] as const).map((status) => {
          const cfg = taskStatusMeta(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => {
                setFilterStatus(filterStatus === status ? "" : status);
                setPage(0);
              }}
              aria-pressed={filterStatus === status}
              className={`flex flex-col gap-1.5 px-4 py-3.5 text-left transition-colors focus-visible:outline-offset-[-2px] ${
                filterStatus === status
                  ? "bg-[var(--bg-hover)] shadow-[inset_0_-2px_0_var(--text-primary)]"
                  : "bg-white hover:bg-[var(--bg-primary)]"
              }`}
            >
              <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.dot }} />
                {cfg.label}
              </span>
              <span className="text-[24px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                {statusCounts[status]}
              </span>
            </button>
          );
        })}
      </StatStrip>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-[12px] font-medium">Filter:</span>
        </div>
        <select
          value={filterMember}
          onChange={(e) => {
            setFilterMember(e.target.value);
            setPage(0);
          }}
          aria-label="Assignee"
          className={FIELD}
        >
          <option value="">All assignees</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {(brandTags ?? []).length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => {
              setFilterTag(e.target.value);
              setPage(0);
            }}
            aria-label="Tag"
            className={FIELD}
          >
            <option value="">All tags</option>
            {(brandTags ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {(filterStatus || filterMember || filterTag) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFilterStatus("");
              setFilterMember("");
              setFilterTag("");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
        <span className="text-[12px] tabular-nums text-[var(--text-muted)] ml-auto">
          {sortedRows.length} task{sortedRows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {sortedRows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={overview.length === 0 ? "No tasks for this brand yet." : "No tasks match the current filters."}
        />
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Task
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Tag
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Assignee
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Deadline
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Assigned
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Submitted
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Approved
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Overseer
                  </th>
                  <th className="px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                    Team lead
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((task) => {
                  const cfg = taskStatusMeta(task.taskStatus);
                  return (
                    <tr
                      key={task._id}
                      role="link"
                      tabIndex={0}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
                      onClick={() => goToBrief(task.briefId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goToBrief(task.briefId);
                        }
                      }}
                      aria-label={`Open brief: ${task.taskTitle}`}
                    >
                      <td className="px-3 py-2.5 align-top max-w-[240px]">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
                          {task.taskTitle}
                        </p>
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5 truncate" title={task.briefTitle}>
                          {task.briefTitle}
                        </p>
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{task.teamName}</p>
                      </td>
                      <td
                        className="px-3 py-2.5 align-top whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {editingTagFor === task._id ? (
                          <input
                            value={tagDraft}
                            onChange={(e) => setTagDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveTag(task._id);
                              if (e.key === "Escape") setEditingTagFor(null);
                            }}
                            onBlur={() => void saveTag(task._id)}
                            list={`brand-tags-${brandId}`}
                            placeholder="Tag name"
                            aria-label="Tag name"
                            className={`${FIELD} w-28 -my-1.5`}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTagFor(task._id);
                              setTagDraft(task.tag ?? "");
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium transition-colors ${
                              task.tag
                                ? "text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                            }`}
                            title="Edit tag"
                          >
                            <TagIcon className="h-3.5 w-3.5" />
                            {task.tag ?? "Add tag"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-[var(--text-secondary)]">
                        {task.assigneeName}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <StatusBadge color={cfg.dot} label={cfg.label} />
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-[var(--text-secondary)] tabular-nums">
                        {task.deadline ? fmtDateShort(task.deadline) : "-"}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-[var(--text-secondary)] tabular-nums">
                        {fmtDate(task.assignedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-[var(--text-secondary)] tabular-nums">
                        {fmtDate(task.latestSubmittedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-[12px] text-[var(--text-secondary)] tabular-nums">
                        {fmtDate(task.latestApprovedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-top text-[12px] text-[var(--text-secondary)] max-w-[120px]">
                        <span className="line-clamp-2">{task.managerName}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-[12px] text-[var(--text-secondary)] max-w-[120px]">
                        <span className="line-clamp-2">{task.teamLeadName}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            page={clampedPage}
            pageCount={pageCount}
            totalRows={sortedRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
          <datalist id={`brand-tags-${brandId}`}>
            {(brandTags ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}
