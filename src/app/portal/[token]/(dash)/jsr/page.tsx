"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowRight, Calendar, ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  PortalCard,
  REQUEST_STATUS,
  daysUntil,
  formatDate,
  monthLabel,
} from "@/components/portal/shared";
import { PortalSkeleton, PortalStatusChip } from "@/components/portal/ui";
import { DeliverableCard, RemarkComposer, RemarkThread } from "@/components/portal/DeliverableCard";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function PortalJsrPage() {
  const params = useParams();
  const token = params.token as string;
  const session = useQuery(api.clientPortal.getPortalSession);
  const dashboard = useQuery(api.clientPortal.getPortalDashboard);
  const addTaskRemark = useMutation(api.clientPortal.addTaskRemark);

  const [monthFilter, setMonthFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.rows.filter((r: any) => {
      if (monthFilter && r.monthKey !== monthFilter) return false;
      if (tagFilter && r.tag !== tagFilter) return false;
      return true;
    });
  }, [dashboard, monthFilter, tagFilter]);

  if (!session || dashboard === undefined) {
    return (
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-64" />
        <div className="p-shimmer h-4 w-80" />
        <PortalSkeleton rows={5} />
      </div>
    );
  }
  if (!dashboard) return null;

  const bc = session.brand.color;
  const userName = session.user.name?.split(" ")[0];

  // Summary counts — all from data the existing queries already return.
  const inProgress = dashboard.rows.filter(
    (r: any) => r.displayStatus === "in_progress" || r.displayStatus === "accepted"
  ).length;
  const inReview = dashboard.rows.filter((r: any) => r.displayStatus === "in_review").length;
  const completedThisMonth = dashboard.rows.filter(
    (r: any) => r.displayStatus === "completed" && r.monthKey === currentMonthKey()
  ).length;
  const awaitingInput = session.pendingCounts.clientPending;

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-5">
      {/* Greeting header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="p-title">
            {greeting()}
            {userName ? `, ${userName}` : ""}
          </h1>
          <p className="p-secondary mt-1">
            Here&apos;s where {session.brand.name}&apos;s work stands.
          </p>
        </div>
        <Link
          href={`/portal/${token}/new-task`}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[var(--p-radius-sm)] text-[12.5px] font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: "var(--p-brand)" }}
        >
          <Plus className="h-3.5 w-3.5" /> New request
        </Link>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryChip label="In progress" value={inProgress} dot="var(--p-brand)" />
        <SummaryChip label="In review" value={inReview} dot="var(--p-info)" />
        <SummaryChip label="Completed this month" value={completedThisMonth} dot="var(--p-success)" />
        <Link
          href={`/portal/${token}/pending-client`}
          className="bg-[var(--p-surface)] rounded-[var(--p-radius-md)] border border-[var(--p-border)] p-4 hover:bg-[var(--p-surface-2)]"
          style={{ boxShadow: "var(--p-shadow)" }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: awaitingInput > 0 ? "var(--p-warning)" : "var(--p-text-3)" }}
            />
            <p className="p-secondary text-[var(--p-text-3)] flex items-center gap-1">
              Awaiting your input <ArrowRight className="h-3 w-3" />
            </p>
          </div>
          <p className="text-[22px] font-semibold tabular-nums mt-1 text-[var(--p-text)]">
            {awaitingInput}
          </p>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="p-input !w-auto text-[12px]"
        >
          <option value="">All months</option>
          {dashboard.months.map((m: string) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        {dashboard.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTagFilter("")}
              className={`px-3 h-8 rounded-[var(--p-radius-sm)] text-[12px] font-medium border ${
                tagFilter === ""
                  ? "text-white border-transparent"
                  : "text-[var(--p-text-2)] border-[var(--p-border)] bg-[var(--p-surface)] hover:border-[var(--p-border-strong)]"
              }`}
              style={tagFilter === "" ? { backgroundColor: bc } : {}}
            >
              All categories
            </button>
            {dashboard.tags.map((t: string) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? "" : t)}
                className={`px-3 h-8 rounded-[var(--p-radius-sm)] text-[12px] font-medium border ${
                  tagFilter === t
                    ? "text-white border-transparent"
                    : "text-[var(--p-text-2)] border-[var(--p-border)] bg-[var(--p-surface)] hover:border-[var(--p-border-strong)]"
                }`}
                style={tagFilter === t ? { backgroundColor: bc } : {}}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <span className="text-[11px] text-[var(--p-text-3)] ml-auto">
          {rows.length} task{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Request list */}
      <PortalCard>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="p-body text-[var(--p-text-2)]">
              {dashboard.rows.length === 0
                ? "No task requests yet."
                : "Nothing matches the current filters."}
            </p>
            {dashboard.rows.length === 0 && (
              <Link
                href={`/portal/${token}/new-task`}
                className="inline-flex items-center justify-center gap-1.5 mt-3 h-9 px-3.5 rounded-[var(--p-radius-sm)] text-[12.5px] font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: "var(--p-brand)" }}
              >
                <Plus className="h-3.5 w-3.5" /> Request your first task
              </Link>
            )}
          </div>
        ) : (
          rows.map((r: any) => {
            const open = expandedRow === r._id;
            return (
              <RequestRow
                key={r._id}
                row={r}
                open={open}
                brandColor={bc}
                onToggle={() => setExpandedRow(open ? null : r._id)}
                addTaskRemark={addTaskRemark}
              />
            );
          })
        )}
      </PortalCard>
    </div>
  );
}

function SummaryChip({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div
      className="bg-[var(--p-surface)] rounded-[var(--p-radius-md)] border border-[var(--p-border)] p-4"
      style={{ boxShadow: "var(--p-shadow)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        <p className="p-secondary text-[var(--p-text-3)]">{label}</p>
      </div>
      <p className="text-[22px] font-semibold tabular-nums mt-1 text-[var(--p-text)]">{value}</p>
    </div>
  );
}

function RequestRow({
  row,
  open,
  brandColor,
  onToggle,
  addTaskRemark,
}: {
  row: any;
  open: boolean;
  brandColor: string;
  onToggle: () => void;
  addTaskRemark: (args: { taskId: Id<"tasks">; content: string }) => Promise<unknown>;
}) {
  const meta = REQUEST_STATUS[row.displayStatus] ?? REQUEST_STATUS.pending_review;
  const threadCount = row.remarks.length + row.deliverables.length;
  const due =
    row.finalDeadline && row.displayStatus !== "completed" && row.displayStatus !== "declined"
      ? daysUntil(row.finalDeadline)
      : null;

  return (
    <div className="border-b border-[var(--p-border)] last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full text-left px-5 py-3 hover:bg-[var(--p-surface-2)]"
      >
        <div className="flex-1 min-w-0">
          <p className="p-body font-medium truncate">{row.title}</p>
          <p className="p-secondary text-[var(--p-text-3)] truncate mt-0.5">
            {[
              row.tag,
              row.clientName ? `By ${row.clientName}` : null,
              `Submitted ${formatDate(row.createdAt)}`,
              threadCount > 0 ? `${threadCount} update${threadCount !== 1 ? "s" : ""}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="shrink-0 flex items-center gap-2">
          {due && (
            <span
              className={`hidden sm:inline text-[11px] font-medium ${
                due.overdue
                  ? "text-[var(--p-danger)]"
                  : due.urgent
                    ? "text-[var(--p-warning)]"
                    : "text-[var(--p-text-3)]"
              }`}
            >
              {due.text}
            </span>
          )}
          <PortalStatusChip label={meta.label} dotColor={meta.dot} overdue={due?.overdue} />
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-[var(--p-text-3)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--p-text-3)]" />
          )}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 bg-[var(--p-surface)]">
          {row.description && (
            <p className="p-secondary leading-relaxed mb-3 max-w-2xl">{row.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 mb-3">
            {row.proposedDeadline && (
              <p className="text-[11px] text-[var(--p-text-3)] inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> You requested this for {formatDate(row.proposedDeadline)}
              </p>
            )}
            {row.finalDeadline && (
              <p className="text-[11px] text-[var(--p-text-3)] inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Delivery date {formatDate(row.finalDeadline)}
              </p>
            )}
          </div>
          {row.deliverables.length > 0 && (
            <div className="mb-3">
              {row.deliverables.map((del: any) => (
                <DeliverableCard key={del._id} deliverable={del} brandColor={brandColor} />
              ))}
            </div>
          )}
          {row.taskId ? (
            <div className="rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface)] overflow-hidden max-w-2xl">
              {row.remarks.length > 0 && (
                <div className="px-4 py-2 border-b border-[var(--p-border)]">
                  <RemarkThread remarks={row.remarks} brandColor={brandColor} />
                </div>
              )}
              <div className="px-4 py-2">
                <RemarkComposer
                  brandColor={brandColor}
                  placeholder="Write a comment on this task"
                  onSubmit={async (content) => {
                    await addTaskRemark({ taskId: row.taskId as Id<"tasks">, content });
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--p-text-3)]">
              You can comment here once the team accepts this request.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
