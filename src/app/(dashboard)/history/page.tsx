"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, EmptyState, PageHeader, SkeletonPageHeader, SkeletonList, StatStrip, StatTile, StatusBadge } from "@/components/ui";
import { taskStatusMeta } from "@/lib/status";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";
import {
  ChevronDown,
  ChevronRight,
  Briefcase,
  FileText,
  Download,
} from "lucide-react";
import { flushSync } from "react-dom";
import { briefTypeLabel } from "@/lib/briefTypes";

// Labels for the text export only; on screen, statuses come from the lib.
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#6b7280" },
  "in-progress": { label: "In Progress", color: "#f59e0b" },
  review: { label: "Review", color: "#8b5cf6" },
  done: { label: "Done", color: "#10b981" },
};

const DELIVERABLE_STATUS: Record<string, { label: string; variant: "neutral" | "employee" | "danger" }> = {
  pending: { label: "Pending", variant: "neutral" },
  approved: { label: "Approved", variant: "employee" },
  rejected: { label: "Rejected", variant: "danger" },
};

export default function HistoryPage() {
  const user = useQuery(api.users.getCurrentUser);
  const history = useQuery(api.worklog.getEmployeeHistory);

  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [expandedBriefs, setExpandedBriefs] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  function toggleBrand(id: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleBrief(id: string) {
    setExpandedBriefs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTask(id: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const [showExportMenu, setShowExportMenu] = useState(false);

  function generateTextExport(): string {
    if (!history || !user) return "";
    const lines: string[] = [];
    lines.push(`WORK HISTORY - ${user.name ?? user.email}`);
    lines.push(`Generated: ${new Date().toLocaleDateString()}`);
    lines.push("=".repeat(60));
    lines.push("");

    for (const bg of history) {
      lines.push(`BRAND: ${bg.brand.name}`);
      lines.push("-".repeat(40));

      for (const brief of bg.briefs) {
        lines.push(`  Brief: ${brief.title} [${brief.status}]`);

        for (const task of brief.tasks) {
          const sl = STATUS_CONFIG[task.status]?.label ?? task.status;
          lines.push(`    Task: ${task.title} - ${sl} (${task.duration})`);

          for (const del of task.deliverables) {
            lines.push(`      Deliverable: ${del.message ?? "-"} [${del.status ?? "pending"}]`);
            if (del.fileNames?.length) {
              lines.push(`        Files: ${del.fileNames.join(", ")}`);
            }
          }
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  function handleExportText() {
    const text = generateTextExport();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-history-${(user?.name ?? "export").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  function handleExportPDF() {
    setShowExportMenu(false);
    if (!history) return; // still loading: there is nothing to print yet
    // The PDF is the page as printed, so every brand, brief and task is opened
    // first (a collapsed section would be missing from it). flushSync puts
    // that on the page before print() runs; the view is put back afterwards.
    const before = { brands: expandedBrands, briefs: expandedBriefs, tasks: expandedTasks };
    flushSync(() => {
      setExpandedBrands(new Set(history.map((g) => g.brand._id as string)));
      setExpandedBriefs(new Set(history.flatMap((g) => g.briefs.map((b) => b._id as string))));
      setExpandedTasks(new Set(history.flatMap((g) => g.briefs.flatMap((b) => b.tasks.map((t) => t._id as string)))));
    });
    window.addEventListener(
      "afterprint",
      () => {
        setExpandedBrands(before.brands);
        setExpandedBriefs(before.briefs);
        setExpandedTasks(before.tasks);
      },
      { once: true }
    );
    // One frame so the browser has painted the opened sections.
    requestAnimationFrame(() => window.print());
  }

  if (!user) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonList rows={6} what="your history" />
      </div>
    );
  }

  const totalBrands = history?.length ?? 0;
  const totalBriefs = history?.reduce((s, g) => s + g.briefs.length, 0) ?? 0;
  const totalTasks = history?.reduce((s, g) => s + g.briefs.reduce((bs, b) => bs + b.tasks.length, 0), 0) ?? 0;
  const completedTasks = history?.reduce(
    (s, g) => s + g.briefs.reduce((bs, b) => bs + b.tasks.filter((t) => t.status === "done").length, 0),
    0
  ) ?? 0;
  const totalDeliverables = history?.reduce(
    (s, g) => s + g.briefs.reduce((bs, b) => bs + b.tasks.reduce((ts, t) => ts + t.deliverables.length, 0), 0),
    0
  ) ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Work History"
        subtitle="Your portfolio of brands, briefs, tasks, and deliverables"
        actions={
          <div className="relative">
          <Button
            variant="primary"
            onClick={() => setShowExportMenu(!showExportMenu)}
            aria-expanded={showExportMenu}
            className="print:hidden"
          >
            <Download className="w-3.5 h-3.5" />
            Export
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-[var(--border)] z-50 overflow-hidden">
                <button
                  onClick={handleExportText}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Export as Text
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Export as PDF
                </button>
              </div>
            </>
          )}
          </div>
        }
      />

      {/* Summary Stats */}
      <StatStrip className="mb-4">
        <StatTile label="Brands" value={totalBrands} />
        <StatTile label="Briefs" value={totalBriefs} />
        <StatTile label="Tasks done" value={`${completedTasks}/${totalTasks}`} />
        <StatTile label="Deliverables" value={totalDeliverables} />
        <StatTile
          label="Completion"
          value={`${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%`}
        />
      </StatStrip>

      {/* Brand Accordion */}
      <div className="flex flex-col gap-4">
        {history && history.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden divide-y divide-[var(--border-subtle)]">
        {(history ?? []).map((brandGroup) => {
          const isBrandOpen = expandedBrands.has(brandGroup.brand._id);
          const brandTasks = brandGroup.briefs.reduce((s, b) => s + b.tasks.length, 0);
          const brandDone = brandGroup.briefs.reduce((s, b) => s + b.tasks.filter((t) => t.status === "done").length, 0);

          return (
            <div key={brandGroup.brand._id}>
              {/* Brand Header */}
              <button
                onClick={() => toggleBrand(brandGroup.brand._id)}
                aria-expanded={isBrandOpen}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors text-left print:!flex"
              >
                {isBrandOpen ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                )}
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: brandGroup.brand.color }}
                  aria-hidden
                />
                <span className="font-medium text-[14px] text-[var(--text-primary)] flex-1 truncate">
                  {brandGroup.brand.name}
                </span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums shrink-0">
                  {brandGroup.briefs.length} brief{brandGroup.briefs.length !== 1 ? "s" : ""} &middot; {brandDone}/{brandTasks} tasks done
                </span>
              </button>

              {/* Brand Content */}
              {isBrandOpen && (
                <div className="border-t border-[var(--border-subtle)]">
                  {brandGroup.briefs.map((brief) => {
                    const isBriefOpen = expandedBriefs.has(brief._id);
                    const briefDone = brief.tasks.filter((t) => t.status === "done").length;

                    return (
                      <div key={brief._id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                        {/* Brief Header */}
                        <button
                          onClick={() => toggleBrief(brief._id)}
                          aria-expanded={isBriefOpen}
                          className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-[var(--bg-hover)] transition-colors text-left print:!flex"
                        >
                          {isBriefOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                          )}
                          <Briefcase className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                          <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1 truncate">
                            {brief.title}
                          </span>
                          <StatusBadge
                            className="shrink-0"
                            color={BRIEF_STATUS_COLORS[brief.status] ?? BRIEF_STATUS_COLORS.draft}
                            label={BRIEF_STATUS_LABELS[brief.status] ?? brief.status}
                          />
                          {brief.briefType && (
                            <span className="text-[12px] text-[var(--text-muted)] shrink-0">
                              {briefTypeLabel(brief.briefType)}
                            </span>
                          )}
                          <span className="text-[12px] text-[var(--text-muted)] tabular-nums shrink-0">
                            {briefDone}/{brief.tasks.length}
                          </span>
                        </button>

                        {/* Brief Tasks */}
                        {isBriefOpen && (
                          <div className="bg-[var(--bg-primary)]">
                            {brief.tasks.map((task) => {
                              const isTaskOpen = expandedTasks.has(task._id);
                              const statusInfo = taskStatusMeta(task.status);
                              const hasDeliverables = task.deliverables.length > 0;

                              return (
                                <div key={task._id} className="border-t border-[var(--border-subtle)]">
                                  {/* Task Row */}
                                  <button
                                    onClick={() => hasDeliverables && toggleTask(task._id)}
                                    className={`w-full flex items-center gap-3 px-8 py-2 text-left transition-colors print:!flex ${
                                      hasDeliverables ? "hover:bg-[var(--bg-hover)] cursor-pointer" : "cursor-default"
                                    }`}
                                  >
                                    {hasDeliverables ? (
                                      isTaskOpen ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                                      )
                                    ) : (
                                      <div className="w-3.5 shrink-0" />
                                    )}
                                    <span className="text-[13px] text-[var(--text-primary)] flex-1 truncate">
                                      {task.title}
                                    </span>
                                    <StatusBadge
                                      className="shrink-0"
                                      color={statusInfo.dot}
                                      label={statusInfo.label}
                                    />
                                    <span className="text-[12px] text-[var(--text-muted)] shrink-0 tabular-nums">
                                      {task.duration}
                                    </span>
                                    {hasDeliverables && (
                                      <span className="text-[12px] text-[var(--text-muted)] shrink-0">
                                        {task.deliverables.length} deliverable{task.deliverables.length !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </button>

                                  {/* Deliverables */}
                                  {isTaskOpen && hasDeliverables && (
                                    <div className="px-10 pb-2 space-y-1.5">
                                      {task.deliverables.map((del) => {
                                        const ds = DELIVERABLE_STATUS[del.status ?? "pending"] ?? DELIVERABLE_STATUS.pending;
                                        return (
                                          <div
                                            key={del._id}
                                            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white border border-[var(--border)]"
                                          >
                                            <FileText className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[12px] text-[var(--text-primary)] leading-relaxed line-clamp-2">
                                                {del.message}
                                              </p>
                                              <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[12px] text-[var(--text-muted)]">
                                                  {new Date(del.submittedAt).toLocaleDateString("en-US", {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                  })}
                                                </span>
                                                {del.fileNames && del.fileNames.length > 0 && (
                                                  <span className="text-[12px] text-[var(--text-muted)]">
                                                    {del.fileNames.length} file{del.fileNames.length !== 1 ? "s" : ""}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <Badge variant={ds.variant} className="shrink-0">
                                              {ds.label}
                                            </Badge>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        </div>
        )}

        {history && history.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title="No work history yet"
            description="Tasks assigned to you will appear here."
          />
        )}

        {history === undefined && <SkeletonList rows={6} what="your history" />}
      </div>
    </div>
  );
}
