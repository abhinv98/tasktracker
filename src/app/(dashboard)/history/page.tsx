"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Card } from "@/components/ui";
import {
  ChevronDown,
  ChevronRight,
  Briefcase,
  FileCheck,
  Tag,
  CheckCircle2,
  Clock,
  FileText,
  Download,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "To Do", color: "#6b7280" },
  "in-progress": { label: "In Progress", color: "#f59e0b" },
  review: { label: "Review", color: "#8b5cf6" },
  done: { label: "Done", color: "#10b981" },
};

const DELIVERABLE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  approved: { label: "Approved", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  rejected: { label: "Rejected", color: "var(--danger)", bg: "var(--danger-dim)" },
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
    lines.push(`WORK HISTORY — ${user.name ?? user.email}`);
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
          lines.push(`    Task: ${task.title} — ${sl} (${task.duration})`);

          for (const del of task.deliverables) {
            lines.push(`      Deliverable: ${del.message ?? "—"} [${del.status ?? "pending"}]`);
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
    setTimeout(() => window.print(), 100);
  }

  if (!user) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Work History
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Your portfolio of brands, briefs, tasks, and deliverables
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-admin)] text-white rounded-lg text-[12px] font-semibold hover:opacity-90 transition-opacity print:hidden"
          >
            <Download className="w-3.5 h-3.5" />
            Export
            <ChevronDown className="w-3 h-3" />
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-[var(--border)] z-50 overflow-hidden">
                <button
                  onClick={handleExportText}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Export as Text
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Export as PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Tag className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">Brands</p>
          </div>
          <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">{totalBrands}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="h-3.5 w-3.5 text-[var(--accent-manager)]" />
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">Briefs</p>
          </div>
          <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">{totalBriefs}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#10b981" }} />
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">Tasks Done</p>
          </div>
          <p className="font-bold text-[24px] tabular-nums" style={{ color: "#10b981" }}>
            {completedTasks}<span className="text-[14px] text-[var(--text-muted)]">/{totalTasks}</span>
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <FileCheck className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">Deliverables</p>
          </div>
          <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">{totalDeliverables}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">Completion</p>
          </div>
          <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">
            {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%
          </p>
        </Card>
      </div>

      {/* Brand Accordion */}
      <div className="flex flex-col gap-3">
        {(history ?? []).map((brandGroup) => {
          const isBrandOpen = expandedBrands.has(brandGroup.brand._id);
          const brandTasks = brandGroup.briefs.reduce((s, b) => s + b.tasks.length, 0);
          const brandDone = brandGroup.briefs.reduce((s, b) => s + b.tasks.filter((t) => t.status === "done").length, 0);

          return (
            <Card key={brandGroup.brand._id} className="p-0 overflow-hidden">
              {/* Brand Header */}
              <button
                onClick={() => toggleBrand(brandGroup.brand._id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                style={{ borderLeft: `4px solid ${brandGroup.brand.color}` }}
              >
                {isBrandOpen ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                )}
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: brandGroup.brand.color }}
                />
                <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">
                  {brandGroup.brand.name}
                </span>
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
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
                          className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
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
                          <Badge variant={brief.status === "completed" ? "employee" : brief.status === "active" ? "manager" : "neutral"}>
                            {brief.status}
                          </Badge>
                          {brief.briefType && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {brief.briefType === "content_calendar" ? "Content Calendar"
                                : brief.briefType === "video_editing" ? "Video Editing"
                                : brief.briefType === "developmental" ? "Developmental"
                                : brief.briefType === "designing" ? "Designing"
                                : brief.briefType}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                            {briefDone}/{brief.tasks.length}
                          </span>
                        </button>

                        {/* Brief Tasks */}
                        {isBriefOpen && (
                          <div className="bg-[var(--bg-primary)]">
                            {brief.tasks.map((task) => {
                              const isTaskOpen = expandedTasks.has(task._id);
                              const statusInfo = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
                              const hasDeliverables = task.deliverables.length > 0;

                              return (
                                <div key={task._id} className="border-t border-[var(--border-subtle)]">
                                  {/* Task Row */}
                                  <button
                                    onClick={() => hasDeliverables && toggleTask(task._id)}
                                    className={`w-full flex items-center gap-3 px-8 py-2 text-left transition-colors ${
                                      hasDeliverables ? "hover:bg-[var(--bg-hover)] cursor-pointer" : "cursor-default"
                                    }`}
                                  >
                                    {hasDeliverables ? (
                                      isTaskOpen ? (
                                        <ChevronDown className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                                      )
                                    ) : (
                                      <div className="w-3 shrink-0" />
                                    )}
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: statusInfo.color }}
                                    />
                                    <span className="text-[12px] text-[var(--text-primary)] flex-1 truncate">
                                      {task.title}
                                    </span>
                                    <span
                                      className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                      style={{
                                        color: statusInfo.color,
                                        backgroundColor: `color-mix(in srgb, ${statusInfo.color} 12%, transparent)`,
                                      }}
                                    >
                                      {statusInfo.label}
                                    </span>
                                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
                                      {task.duration}
                                    </span>
                                    {hasDeliverables && (
                                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">
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
                                            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white border border-[var(--border-subtle)]"
                                          >
                                            <FileText className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[12px] text-[var(--text-primary)] leading-relaxed line-clamp-2">
                                                {del.message}
                                              </p>
                                              <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-[var(--text-muted)]">
                                                  {new Date(del.submittedAt).toLocaleDateString("en-US", {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                  })}
                                                </span>
                                                {del.fileNames && del.fileNames.length > 0 && (
                                                  <span className="text-[10px] text-[var(--text-muted)]">
                                                    {del.fileNames.length} file{del.fileNames.length !== 1 ? "s" : ""}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <span
                                              className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                              style={{ color: ds.color, backgroundColor: ds.bg }}
                                            >
                                              {ds.label}
                                            </span>
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
            </Card>
          );
        })}

        {history && history.length === 0 && (
          <Card>
            <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
              No work history yet. Tasks assigned to you will appear here.
            </p>
          </Card>
        )}

        {history === undefined && (
          <Card>
            <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
              Loading history...
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
