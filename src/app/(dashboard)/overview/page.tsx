"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Badge, Card } from "@/components/ui";
import { Tag, Users, Briefcase, CheckCircle2, Clock, AlertCircle, Eye } from "lucide-react";

export default function OverviewPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const overview = useQuery(api.brands.getBrandOverview);

  if (user === undefined || overview === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Access denied.</p>
      </div>
    );
  }

  // Aggregated stats
  const totalBrands = overview.length;
  const totalBriefs = overview.reduce((acc, b) => acc + b.briefCount, 0);
  const totalActiveBriefs = overview.reduce((acc, b) => acc + b.activeBriefCount, 0);
  const totalTasks = overview.reduce((acc, b) => acc + b.totalTasks, 0);
  const totalDone = overview.reduce((acc, b) => acc + b.taskStatusCounts.done, 0);
  const overallProgress = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight">
          Overview
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
          Brand and task status at a glance
        </p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Brands</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">{totalBrands}</p>
        </Card>
        <Card accent="admin">
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Total Briefs</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">{totalBriefs}</p>
        </Card>
        <Card accent="manager">
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Active Briefs</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">{totalActiveBriefs}</p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Total Tasks</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">{totalTasks}</p>
        </Card>
        <Card accent="employee">
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Overall Progress</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">{Math.round(overallProgress)}%</p>
        </Card>
      </div>

      {/* Brand Cards */}
      <div className="flex flex-col gap-6">
        {overview.map((brand) => (
          <Card key={brand._id} className="!p-0 overflow-hidden">
            {/* Brand Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)]">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: brand.color + "20" }}
              >
                <Tag className="h-5 w-5" style={{ color: brand.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">
                  {brand.name}
                </h2>
                {brand.description && (
                  <p className="text-[12px] text-[var(--text-secondary)] truncate">{brand.description}</p>
                )}
              </div>
              <button
                onClick={() => router.push(`/brands/${brand._id}`)}
                className="text-[var(--text-muted)] hover:text-[var(--accent-admin)] transition-colors"
              >
                <Eye className="h-5 w-5" />
              </button>
            </div>

            {/* Brand Body */}
            <div className="px-6 py-4">
              {/* Progress bar */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent-employee)] transition-all"
                    style={{ width: `${brand.progress}%` }}
                  />
                </div>
                <span className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums w-12 text-right">
                  {Math.round(brand.progress)}%
                </span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{brand.taskStatusCounts.pending}</span> pending
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[var(--accent-manager)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{brand.taskStatusCounts["in-progress"]}</span> in progress
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-[var(--accent-admin)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{brand.taskStatusCounts.review}</span> in review
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--accent-employee)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{brand.taskStatusCounts.done}</span> done
                  </span>
                </div>
              </div>

              {/* Managers and Employee count */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{brand.employeeCount}</span> employee{brand.employeeCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{brand.activeBriefCount}</span>/{brand.briefCount} brief{brand.briefCount !== 1 ? "s" : ""} active
                  </span>
                </div>
                {brand.managers.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {brand.managers.map((m) => (
                      <Badge key={m._id} variant="manager">
                        {m.name ?? m.email ?? "Unknown"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {overview.length === 0 && (
          <Card>
            <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
              No brands created yet. Create a brand to see the overview.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
