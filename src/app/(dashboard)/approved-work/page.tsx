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
  Search,
  Users,
  User,
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

  const currentUser = useQuery(api.users.getCurrentUser);
  const isSuperAdmin = currentUser?.isSuperAdmin === true;

  const [searchQuery, setSearchQuery] = useState("");
  const [filterManager, setFilterManager] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [showStats, setShowStats] = useState(false);

  const managers = useMemo(() => {
    if (!deliverables) return [];
    const set = new Map<string, string>();
    for (const d of deliverables) {
      if (d.managerId && !set.has(d.managerId)) {
        set.set(d.managerId, d.managerName);
      }
    }
    return [...set.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deliverables]);

  const brands = useMemo(() => {
    if (!deliverables) return [];
    const set = new Map<string, string>();
    for (const d of deliverables) {
      if (d.brandId && !set.has(d.brandId)) {
        set.set(d.brandId, d.brandName);
      }
    }
    return [...set.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deliverables]);

  const employees = useMemo(() => {
    if (!deliverables) return [];
    const set = new Map<string, string>();
    for (const d of deliverables) {
      const sid = (d as any).submitterId as string | undefined;
      if (sid && !set.has(sid)) {
        set.set(sid, d.submitterName);
      }
    }
    return [...set.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deliverables]);

  const teams = useMemo(() => {
    if (!deliverables) return [];
    const set = new Map<string, string>();
    for (const d of deliverables) {
      const t = (d as any).submitterTeams as
        | { id: string; name: string }[]
        | undefined;
      for (const team of t ?? []) {
        if (!set.has(team.id)) set.set(team.id, team.name);
      }
    }
    return [...set.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deliverables]);

  const filtered = useMemo(() => {
    if (!deliverables) return [];
    const q = searchQuery.trim().toLowerCase();
    return deliverables.filter((d) => {
      if (filterManager && d.managerId !== filterManager) return false;
      if (filterBrand && d.brandId !== filterBrand) return false;
      if (filterEmployee && (d as any).submitterId !== filterEmployee) return false;
      if (filterTeam) {
        const ts = ((d as any).submitterTeams ?? []) as { id: string }[];
        if (!ts.some((t) => t.id === filterTeam)) return false;
      }
      if (q) {
        const haystack = [
          d.taskTitle,
          d.briefTitle,
          d.brandName,
          d.managerName,
          d.submitterName,
          d.message ?? "",
          d.clientNote ?? "",
          ...(((d as any).submitterTeams ?? []) as { name: string }[]).map(
            (t) => t.name
          ),
        ]
          .join(" \n ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    deliverables,
    searchQuery,
    filterManager,
    filterBrand,
    filterTeam,
    filterEmployee,
  ]);

  const anyFilterActive =
    !!searchQuery ||
    !!filterManager ||
    !!filterBrand ||
    !!filterTeam ||
    !!filterEmployee;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Approved Work
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
            Deliverables approved by clients or finalized internally
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

      {/* Search + Filter Bar */}
      <div className="flex flex-col gap-3 mb-5">
        {/* Search */}
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isSuperAdmin
                ? "Search by employee, manager, brand, brief, or task..."
                : "Search by name, brand, brief, or task..."
            }
            className="w-full pl-9 pr-9 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />

          <select
            value={filterManager}
            onChange={(e) => setFilterManager(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[170px]"
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
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[170px]"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[150px]"
            >
              <option value="">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <select
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[170px]"
            >
              <option value="">All Employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {anyFilterActive && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterManager("");
                setFilterBrand("");
                setFilterTeam("");
                setFilterEmployee("");
              }}
              className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
            >
              Clear all
            </button>
          )}
          <span className="text-[11px] text-[var(--text-muted)] ml-auto">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            {isSuperAdmin && deliverables && filtered.length !== deliverables.length
              ? ` of ${deliverables.length}`
              : ""}
          </span>
        </div>
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
                  <Badge
                    variant={
                      (d as any).approvalSource === "client"
                        ? "success"
                        : "neutral"
                    }
                  >
                    {(d as any).approvalSource === "client"
                      ? "Client approved"
                      : "Internal approval"}
                  </Badge>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mb-1.5">
                  Brief: {d.briefTitle} &middot; Manager: {d.managerName} &middot; Submitted by: {d.submitterName}
                  {(() => {
                    const ts = ((d as any).submitterTeams ?? []) as {
                      id: string;
                      name: string;
                    }[];
                    if (ts.length === 0) return null;
                    return (
                      <>
                        {" "}
                        &middot;{" "}
                        <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                          <Users className="h-3 w-3" />
                          {ts.map((t) => t.name).join(", ")}
                        </span>
                      </>
                    );
                  })()}
                </p>
                <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    Submitted {formatDate(d.submittedAt)}
                  </span>
                  {((d as any).approvedAt ?? d.clientReviewedAt) && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Approved {formatDate(((d as any).approvedAt ?? d.clientReviewedAt) as number)}
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
              {anyFilterActive
                ? "No approved work matches the current search and filters."
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

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {stats ? (
                <>
                  {/* Hero: Total Approved (anchor metric) */}
                  <Card className="p-5 bg-emerald-50/60 border-emerald-100" accent="employee">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                        Total Approved
                      </p>
                    </div>
                    <p className="font-bold text-[36px] text-emerald-700 tabular-nums leading-none">
                      {(stats as any).totalApproved ?? stats.clientApproved}
                    </p>
                    <p className="mt-2 text-[11px] text-emerald-700/70">
                      Client-approved + finalized internally
                    </p>
                  </Card>

                  {/* Secondary stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3" accent="manager">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Send className="h-3.5 w-3.5 text-purple-500" />
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Sent to Client
                        </p>
                      </div>
                      <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">
                        {stats.sentToClient}
                      </p>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Client Approved
                        </p>
                      </div>
                      <p className="font-bold text-[24px] text-[var(--text-primary)] tabular-nums">
                        {stats.clientApproved}
                      </p>
                    </Card>
                  </div>

                  {/* Briefs Overview */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-hover)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        <Briefcase className="h-3 w-3" />
                        Briefs Overview
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                        {stats.totalBriefs} total
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <FolderOpen className="h-3.5 w-3.5 text-blue-500" />
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Internal
                          </p>
                        </div>
                        <p className="font-bold text-[22px] text-[var(--text-primary)] tabular-nums">
                          {stats.internalBriefs}
                        </p>
                        <BriefsBar
                          value={stats.internalBriefs}
                          total={stats.totalBriefs}
                          color="rgb(59 130 246)"
                        />
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ExternalLink className="h-3.5 w-3.5 text-amber-500" />
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Client-facing
                          </p>
                        </div>
                        <p className="font-bold text-[22px] text-[var(--text-primary)] tabular-nums">
                          {stats.clientBriefs}
                        </p>
                        <BriefsBar
                          value={stats.clientBriefs}
                          total={stats.totalBriefs}
                          color="rgb(245 158 11)"
                        />
                      </Card>
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

function BriefsBar({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="mt-2 w-full h-1 rounded-full bg-[var(--bg-hover)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
