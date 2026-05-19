"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Card, TaskDetailModal } from "@/components/ui";
import { TASK_STATUS_CONFIG } from "@/lib/statusColors";
import {
  ListTodo,
  Eye,
  ClipboardCheck,
  CalendarClock,
} from "lucide-react";

const STATUS = TASK_STATUS_CONFIG as Record<
  string,
  { label: string; color: string; bg: string }
>;

function fmt(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS[status] ?? {
    label: status,
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

export default function MyTasksPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const data = useQuery(api.tasks.listMyWork);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  if (user === undefined || data === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }
  if (!user || data === null) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Access denied. My Tasks is for brand managers &amp; super-admins.
        </p>
      </div>
    );
  }

  const { assignedToMe, supervising, counts } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-2">
        <ListTodo className="h-5 w-5 text-[var(--accent-admin)]" />
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            My Tasks
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Work assigned to you, plus the tasks you delegated and need to
            track &amp; sign off.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Assigned to me (open)", value: counts.assignedToMeOpen },
          { label: "Assigned to me (all)", value: counts.assignedToMe },
          { label: "Supervising (open)", value: counts.supervisingOpen },
          { label: "Awaiting my review", value: counts.needsReview },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              {c.label}
            </p>
            <p className="text-[22px] font-bold text-[var(--text-primary)] mt-1">
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Assigned to me */}
      <section className="mb-8">
        <h2 className="font-semibold text-[14px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[var(--text-muted)]" />
          Assigned to me ({assignedToMe.length})
        </h2>
        {assignedToMe.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-[var(--border)] bg-white">
            <p className="text-[13px] text-[var(--text-muted)]">
              Nothing is assigned to you right now.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Brief</th>
                  <th className="px-4 py-3 font-medium">Assigned by</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {assignedToMe.map((t: any) => (
                  <tr
                    key={t._id}
                    onClick={() => setOpenTaskId(t._id)}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[260px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                        style={{ background: t.brandColor }}
                      >
                        {t.brandName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate">
                      {t.briefTitle}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t.assignedByName}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {fmt(t.deadline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Supervising */}
      <section>
        <h2 className="font-semibold text-[14px] text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--text-muted)]" />
          Supervising — tasks I delegated ({supervising.length})
        </h2>
        <p className="text-[12px] text-[var(--text-muted)] mb-3">
          Tracking progress, reviewing and marking these done is your
          responsibility. They clear once the work is approved/done.
        </p>
        {supervising.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-[var(--border)] bg-white">
            <p className="text-[13px] text-[var(--text-muted)]">
              You haven't delegated any active tasks.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Assigned to</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {supervising.map((t: any) => (
                  <tr
                    key={t._id}
                    onClick={() => setOpenTaskId(t._id)}
                    className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer ${
                      t.needsReview ? "bg-purple-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[240px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t.assigneeName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                        style={{ background: t.brandColor }}
                      >
                        {t.brandName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusPill status={t.status} />
                        {t.needsReview && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                            Review now
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {fmt(t.deadline)}
                    </td>
                    <td className="px-4 py-3">
                      {t.needsReview && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push("/deliverables");
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--accent-admin)] hover:bg-[var(--bg-hover)]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}
