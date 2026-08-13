"use client";

import { SkeletonPageHeader, SkeletonTable } from "@/components/ui";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Briefcase } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/Table";
import { TASK_STATUS_CONFIG, BRIEF_STATUS_LABELS } from "@/lib/statusColors";

function formatDate(ts?: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name?: string, email?: string) {
  const source = name || email || "?";
  return source
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function FreelancersPage() {
  const data = useQuery(api.freelancers.getFreelancersOverview);

  if (data === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={6} cols={5} what="freelancers" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="p-8">
        <p className="text-[15px] text-[var(--text-secondary)]">
          Access denied. Only brand managers can view this page.
        </p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Freelancers"
        icon={Briefcase}
        subtitle={
          data.isSuperAdmin
            ? "All freelancers and the briefs assigned to them."
            : "Freelancers working on brands you manage."
        }
      />

      {data.freelancers.length === 0 ? (
        <Card>
          <p className="text-[15px] text-[var(--text-secondary)]">
            {data.isSuperAdmin
              ? "No freelancers yet. Invite one from Users & Teams with the Freelancer role."
              : "No freelancers are working on your brands yet."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {data.freelancers.map((f) => (
            <Card key={f._id} accent="employee">
              {/* Freelancer header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  {f.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.avatarUrl}
                      alt={f.name ?? "Freelancer"}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--accent-employee-dim)] text-[var(--accent-employee-text)] text-[12px] font-semibold">
                      {initials(f.name, f.email)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[15px] text-[var(--text-primary)]">
                        {f.name ?? f.email ?? "-"}
                      </span>
                      <Badge variant="manager">Freelancer</Badge>
                      {f.designation && (
                        <span className="text-[12px] text-[var(--text-secondary)]">
                          {f.designation}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      {f.email ?? ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="neutral">{f.taskCounts.total} tasks</Badge>
                  {f.taskCounts.inProgress > 0 && (
                    <Badge variant="status">
                      {f.taskCounts.inProgress} in progress
                    </Badge>
                  )}
                  {f.taskCounts.review > 0 && (
                    <Badge variant="status">{f.taskCounts.review} in review</Badge>
                  )}
                  {f.taskCounts.done > 0 && (
                    <Badge variant="success">{f.taskCounts.done} done</Badge>
                  )}
                </div>
              </div>

              {/* Briefs assigned to this freelancer */}
              {f.briefs.length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">
                  No briefs assigned yet.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {f.briefs.map((b) => (
                    <div
                      key={b.briefId}
                      className="border border-[var(--border-subtle)] rounded-lg overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[var(--bg-hover)]">
                        <span className="font-medium text-[13px] text-[var(--text-primary)]">
                          {b.title}
                        </span>
                        {b.brand && (
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 font-medium text-[11px] rounded-md"
                            style={{
                              backgroundColor: `${b.brand.color}1a`,
                              color: b.brand.color,
                            }}
                          >
                            {b.brand.name}
                          </span>
                        )}
                        <Badge variant="status">
                          {BRIEF_STATUS_LABELS[b.status] ?? b.status}
                        </Badge>
                        {b.deadline && (
                          <span className="ml-auto text-[12px] text-[var(--text-secondary)]">
                            Due {formatDate(b.deadline)}
                          </span>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableHead>Task</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Assigned</TableHead>
                          <TableHead>Deadline</TableHead>
                        </TableHeader>
                        <TableBody>
                          {b.tasks.map((t) => {
                            const cfg = TASK_STATUS_CONFIG[t.status] ?? {
                              label: t.status,
                              color: "#6b7280",
                            };
                            const overdue =
                              t.deadline !== undefined &&
                              t.deadline < now &&
                              t.status !== "done";
                            return (
                              <TableRow key={t._id}>
                                <TableCell>{t.title}</TableCell>
                                <TableCell>
                                  <StatusBadge color={cfg.color} label={cfg.label} />
                                </TableCell>
                                <TableCell>{formatDate(t.assignedAt)}</TableCell>
                                <TableCell
                                  className={overdue ? "text-[var(--danger)] font-medium" : ""}
                                >
                                  {formatDate(t.deadline)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
