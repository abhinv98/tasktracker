"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Badge, Card, StatStrip, StatTile } from "@/components/ui";
import { Users, Briefcase, Eye } from "lucide-react";
import { taskStatusMeta } from "@/lib/status";

const RETURN_TO = "/brands-overview?tab=work-data";

export default function WorkDataTab() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const overview = useQuery(api.brands.getBrandOverview);

  if (user === undefined || overview === undefined) {
    return (
      <p className="text-[13px] text-[var(--text-secondary)]">Loading...</p>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <p className="text-[13px] text-[var(--text-secondary)]">
        Access denied. Work Data is for brand managers &amp; super-admins.
      </p>
    );
  }

  const totalBrands = overview.length;
  const totalBriefs = overview.reduce((acc, b) => acc + b.briefCount, 0);
  const totalActiveBriefs = overview.reduce((acc, b) => acc + b.activeBriefCount, 0);
  const totalTasks = overview.reduce((acc, b) => acc + b.totalTasks, 0);
  const totalDone = overview.reduce((acc, b) => acc + b.taskStatusCounts.done, 0);
  const overallProgress = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;

  return (
    <div>
      {/* Global Stats */}
      <StatStrip className="mb-4">
        <StatTile label="Brands" value={totalBrands} />
        <StatTile label="Total Briefs" value={totalBriefs} />
        <StatTile label="Active Briefs" value={totalActiveBriefs} />
        <StatTile label="Total Tasks" value={totalTasks} />
        <StatTile label="Overall Progress" value={`${Math.round(overallProgress)}%`} />
      </StatStrip>

      {/* Brand Cards */}
      <div className="flex flex-col gap-4">
        {overview.map((brand) => (
          <Card key={brand._id} className="!p-0 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[var(--border)]"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: brand.color + "20" }}
                >
                  <span className="text-[15px] font-semibold" style={{ color: brand.color }} aria-hidden>
                    {brand.name.trim().charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
                  {brand.name}
                </h2>
                {brand.description && (
                  <p className="text-[12px] text-[var(--text-secondary)] truncate">{brand.description}</p>
                )}
              </div>
              <button
                onClick={() =>
                  router.push(
                    `/brands/${brand._id}?returnTo=${encodeURIComponent(RETURN_TO)}`
                  )
                }
                aria-label={`Open ${brand.name}`}
                className="inline-flex items-center justify-center h-control w-control rounded-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent-employee)] transition-all"
                    style={{ width: `${brand.progress}%` }}
                  />
                </div>
                <span className="text-[13px] font-medium text-[var(--text-primary)] tabular-nums w-12 text-right">
                  {Math.round(brand.progress)}%
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mb-3">
                {(
                  [
                    ["pending", "pending"],
                    ["in-progress", "in progress"],
                    ["review", "in review"],
                    ["done", "done"],
                  ] as const
                ).map(([status, word]) => (
                  <div key={status} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: taskStatusMeta(status).dot }}
                    />
                    <span className="text-[13px] text-[var(--text-secondary)]">
                      <span className="font-semibold tabular-nums text-[var(--text-primary)]">{brand.taskStatusCounts?.[status] ?? 0}</span> {word}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold tabular-nums text-[var(--text-primary)]">{brand.employeeCount}</span> employee{brand.employeeCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold tabular-nums text-[var(--text-primary)]">{brand.activeBriefCount}</span>/{brand.briefCount} brief{brand.briefCount !== 1 ? "s" : ""} active
                  </span>
                </div>
                {brand.managers.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {brand.managers.map((m) => (
                      <Badge key={m._id}>
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
              No brands created yet. Create a brand to see the data.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
