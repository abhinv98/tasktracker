"use client";

import { useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Card } from "@/components/ui";
import {
  CheckCircle2,
  BarChart3,
  X,
  ExternalLink,
  FileText,
  Filter,
  Briefcase,
  Send,
  FolderOpen,
} from "lucide-react";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ApprovedWorkPage() {
  const deliverables = useQuery(api.approvals.listClientApprovedDeliverables);
  const stats = useQuery(api.approvals.getApprovedWorkStats);

  const [filterManager, setFilterManager] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [showStats, setShowStats] = useState(false);

  const managers = useMemo(() => {
    if (!deliverables) return [];
    const set = new Map<string, string>();
    for (const d of deliverables) {
      if (d.managerId && !set.has(d.managerId)) {
        set.set(d.managerId, d.managerName);
      }
    }
    return [...set.entries()].map(([id, name]) => ({ id, name }));
  }, [deliverables]);

  const brands = useMemo(() => {
    if (!deliverables) return [];
    const set = new Map<string, string>();
    for (const d of deliverables) {
      if (d.brandId && !set.has(d.brandId)) {
        set.set(d.brandId, d.brandName);
      }
    }
    return [...set.entries()].map(([id, name]) => ({ id, name }));
  }, [deliverables]);

  const filtered = useMemo(() => {
    if (!deliverables) return [];
    return deliverables.filter((d) => {
      if (filterManager && d.managerId !== filterManager) return false;
      if (filterBrand && d.brandId !== filterBrand) return false;
      return true;
    });
  }, [deliverables, filterManager, filterBrand]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Approved Work
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
            Deliverables approved by clients
          </p>
        </div>
        <button
          onClick={() => setShowStats(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-admin)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
        >
          <BarChart3 className="h-4 w-4" />
          Get Stats
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <select
          value={filterManager}
          onChange={(e) => setFilterManager(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[180px]"
        >
          <option value="">All Managers</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[180px]"
        >
          <option value="">All Brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {(filterManager || filterBrand) && (
          <button
            onClick={() => {
              setFilterManager("");
              setFilterBrand("");
            }}
            className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
          >
            Clear
          </button>
        )}
        <span className="text-[11px] text-[var(--text-muted)] ml-auto">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Deliverables List */}
      <div className="flex flex-col gap-3">
        {filtered.map((d) => (
          <Card key={d._id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
                    {d.taskTitle}
                  </h3>
                  <Badge variant="neutral">{d.brandName}</Badge>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mb-1.5">
                  Brief: {d.briefTitle} &middot; Manager: {d.managerName} &middot; Submitted by: {d.submitterName}
                </p>
                <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    Submitted {formatDate(d.submittedAt)}
                  </span>
                  {d.clientReviewedAt && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Approved {formatDate(d.clientReviewedAt)}
                    </span>
                  )}
                </div>
                {d.clientNote && (
                  <p className="text-[12px] text-[var(--text-secondary)] mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                    &ldquo;{d.clientNote}&rdquo;
                  </p>
                )}
                {d.message && (
                  <p className="text-[12px] text-[var(--text-muted)] mt-1.5 italic">
                    {d.message}
                  </p>
                )}
                {(d.link || d.files.length > 0) && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {d.link && (
                      <a
                        href={d.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--accent-admin)] bg-[var(--accent-admin-dim)] hover:opacity-80"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Link
                      </a>
                    )}
                    {d.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--border)]"
                      >
                        <FileText className="h-3 w-3" />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        {deliverables !== undefined && filtered.length === 0 && (
          <Card>
            <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
              {filterManager || filterBrand
                ? "No approved work found for the selected filters."
                : "No client-approved deliverables yet."}
            </p>
          </Card>
        )}
      </div>

      {/* Stats Sidebar */}
      {showStats && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-200"
            onClick={() => setShowStats(false)}
          />
          <div className="fixed right-0 top-0 h-full w-full sm:w-[380px] z-50 bg-white border-l border-[var(--border)] shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border)] shrink-0">
              <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
                Stats Overview
              </h2>
              <button
                onClick={() => setShowStats(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {stats ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4" accent="manager">
                      <div className="flex items-center gap-2 mb-2">
                        <Send className="h-4 w-4 text-purple-500" />
                        <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Sent to Client
                        </p>
                      </div>
                      <p className="font-bold text-[28px] text-[var(--text-primary)] tabular-nums">
                        {stats.sentToClient}
                      </p>
                    </Card>
                    <Card className="p-4" accent="employee">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Client Approved
                        </p>
                      </div>
                      <p className="font-bold text-[28px] text-emerald-600 tabular-nums">
                        {stats.clientApproved}
                      </p>
                    </Card>
                  </div>

                  <div className="border-t border-[var(--border)] pt-4">
                    <h3 className="font-semibold text-[13px] text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                      Briefs Breakdown
                    </h3>
                    <div className="space-y-3">
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Briefcase className="h-4 w-4 text-[var(--accent-admin)]" />
                          <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                            Total Briefs
                          </p>
                        </div>
                        <p className="font-bold text-[28px] text-[var(--text-primary)] tabular-nums">
                          {stats.totalBriefs}
                        </p>
                      </Card>
                      <div className="grid grid-cols-2 gap-3">
                        <Card className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <FolderOpen className="h-4 w-4 text-blue-500" />
                            <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                              Internal
                            </p>
                          </div>
                          <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">
                            {stats.internalBriefs}
                          </p>
                        </Card>
                        <Card className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <ExternalLink className="h-4 w-4 text-amber-500" />
                            <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                              Client-facing
                            </p>
                          </div>
                          <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">
                            {stats.clientBriefs}
                          </p>
                        </Card>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">Loading stats...</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
