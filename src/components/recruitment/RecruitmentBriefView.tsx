"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardList, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, StatusBadge } from "@/components/ui";
import { AttachmentList } from "@/components/ui/AttachmentList";
import { CommentThread } from "@/components/comments/CommentThread";
import { isTaskOverdue, taskStatusMeta } from "@/lib/status";
import { AssignTask } from "./AssignTask";
import { useHrData } from "./hrShared";

/**
 * A recruitment brief: who has what to do, about which candidate. No canvas and
 * no teams, because these are single jobs for single people. Someone who only
 * has a task in it sees that task and nothing else (convex/lib/guards.ts).
 */
export function RecruitmentBriefView({
  briefId,
  description,
  archived,
  onOpenTask,
}: {
  briefId: Id<"briefs">;
  description: string;
  archived: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const view = useQuery(api.recruitTasks.forBrief, { briefId });
  const hr = useHrData();
  const [adding, setAdding] = useState(false);
  if (!view) return <p className="p-8 text-[13px] text-[var(--text-muted)]">Loading…</p>;
  const manage = view.manage && !!hr && !archived;

  return (
    <div className={`grid flex-1 grid-cols-1 overflow-y-auto ${view.manage ? "lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden" : ""}`}>
      <div className="min-w-0 p-4 sm:p-6 lg:overflow-y-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-[13px] text-[var(--text-secondary)]">
            {view.round && (
              <Link
                href={`/recruitment/t/pipeline?view=board&reqId=${view.round._id}`}
                className="font-medium text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
              >
                {view.round.code} · {view.round.role}
              </Link>
            )}
            {description && <p className="mt-1 whitespace-pre-wrap">{description}</p>}
          </div>
          {manage && !adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={14} />
              Assign a task
            </Button>
          )}
        </div>

        {adding && hr && (
          <div className="mb-4">
            <AssignTask data={hr} briefId={briefId} onDone={() => setAdding(false)} />
          </div>
        )}

        {view.tasks.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No tasks yet"
            description="Say what needs doing, about which candidate, and who does it. They are told straight away."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)] text-left text-[12px] text-[var(--text-muted)]">
                  {["Task", "Candidate", "Who", "Due", "Status"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.tasks.map((t) => {
                  const late = isTaskOverdue({ deadline: t.deadline ?? undefined, status: t.status });
                  return (
                    <tr
                      key={t._id}
                      onClick={() => onOpenTask(t._id)}
                      className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)]"
                    >
                      <td className="px-4 py-2">
                        <button type="button" className="text-left text-[13px] font-medium text-[var(--text-primary)] hover:underline">
                          {t.title}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-[13px] text-[var(--text-secondary)]">
                        {t.candidate && t.canOpen ? (
                          <Link
                            href={`/recruitment/t/pipeline?open=${t.candidateId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
                          >
                            {t.candidate}
                          </Link>
                        ) : (
                          t.candidate || <span className="text-[var(--text-disabled)]">–</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-[13px] text-[var(--text-secondary)]">{t.assignee}</td>
                      <td className={`whitespace-nowrap px-4 py-2 text-[13px] tabular-nums ${late ? "font-medium text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                        {t.deadline ? new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : <span className="text-[var(--text-disabled)]">–</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <StatusBadge color={taskStatusMeta(t.status).dot} label={taskStatusMeta(t.status).label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {view.manage && (
        <div className="min-w-0 space-y-5 border-t border-[var(--border)] p-4 sm:p-6 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <AttachmentList parentType="brief" parentId={briefId} />
          <CommentThread parentType="brief" parentId={briefId} />
        </div>
      )}
    </div>
  );
}
