"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui";
import { BarList, ChartCard, Columns, SparkStat, StackedBar, shareLabel } from "@/components/ui/Charts";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";
import { TASK_STATUS_META } from "@/lib/status";

type EmployeeStat = {
  _id: string;
  name: string;
  totalTasks: number;
  doneTasks: number;
  trackedHours: number;
  estimatedHours?: number;
};

type ActivityLog = {
  _id: string;
  userName: string;
  action: string;
  briefTitle: string;
  timestamp: number;
};

function actionLabel(action: string): string {
  if (action.startsWith("brief")) return "Brief";
  if (action.startsWith("deliverable") || action.startsWith("approve")) return "Deliverable";
  if (action.startsWith("task") || action.includes("status") || action.includes("assigned"))
    return "Task";
  return "Activity";
}

/** Segments for a status breakdown: known statuses in workflow order, then
 *  anything else the data holds, so the shares always add up to the total. */
function statusSegments(
  counts: Record<string, number>,
  order: string[],
  label: (key: string) => string,
  color: (key: string) => string,
) {
  const keys = [...order, ...Object.keys(counts).filter((k) => !order.includes(k))];
  return keys.map((k) => ({ label: label(k), value: counts[k] ?? 0, color: color(k) }));
}

const TASK_ORDER = ["pending", "in-progress", "review", "on-hold", "done"];
const BRIEF_ORDER = [
  "draft", "active", "in-progress", "review", "sent_to_client",
  "on_hold", "rejected", "completed", "archived",
];

const BANDS = [
  { key: "behind", title: "Behind" },
  { key: "inProgress", title: "In progress" },
  { key: "onTrack", title: "On track" },
] as const;

type Analytics = NonNullable<FunctionReturnType<typeof api.analytics.getDashboardAnalytics>>;

export default function AnalyticsTab() {
  const data = useQuery(api.analytics.getDashboardAnalytics);
  if (!data) {
    return (
      <p className="text-[13px] text-[var(--text-secondary)]">Loading analytics...</p>
    );
  }
  return <AnalyticsView data={data} />;
}

/** The page itself, given its numbers. */
export function AnalyticsView({ data }: { data: Analytics }) {
  const banded = useMemo(() => {
    const out = { onTrack: [] as EmployeeStat[], inProgress: [] as EmployeeStat[], behind: [] as EmployeeStat[] };
    for (const emp of data.employeeStats as EmployeeStat[]) {
      const rate = emp.totalTasks > 0 ? (emp.doneTasks / emp.totalTasks) * 100 : 0;
      if (rate >= 75) out.onTrack.push(emp);
      else if (rate >= 25) out.inProgress.push(emp);
      else out.behind.push(emp);
    }
    return out;
  }, [data]);

  const weeks = data.weeklyVelocity;
  const velocitySum = weeks.reduce((s, w) => s + w.count, 0);
  const thisWeek = weeks[weeks.length - 1]?.count ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.count ?? 0;
  const weekDiff = thisWeek - lastWeek;

  const doneTasks = data.tasksByStatus["done"] ?? 0;
  const openBriefs =
    data.totalBriefs - (data.briefsByStatus["completed"] ?? 0) - (data.briefsByStatus["archived"] ?? 0);

  const taskSegments = statusSegments(
    data.tasksByStatus,
    TASK_ORDER,
    (k) => TASK_STATUS_META[k]?.label ?? k,
    (k) => TASK_STATUS_META[k]?.dot ?? "var(--text-muted)",
  );
  const briefSegments = statusSegments(
    data.briefsByStatus,
    BRIEF_ORDER,
    (k) => BRIEF_STATUS_LABELS[k] ?? k,
    (k) => BRIEF_STATUS_COLORS[k] ?? "var(--text-muted)",
  );
  const people = data.employeeStats as EmployeeStat[];

  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SparkStat
          label="Briefs"
          value={data.totalBriefs}
          hint={`${openBriefs} open · ${data.totalBrands} brands`}
        />
        <SparkStat
          label="Tasks"
          value={data.totalTasks}
          hint={`${shareLabel(doneTasks, data.totalTasks)} done`}
        />
        <SparkStat
          label="Overdue"
          value={data.overdueTasks}
          hint={data.overdueTasks > 0 ? "Past deadline" : "Nothing late"}
          bad={data.overdueTasks > 0}
        />
        <SparkStat
          label="Done, last 7 days"
          value={thisWeek}
          delta={{
            text: `${weekDiff > 0 ? "+" : ""}${weekDiff}`,
            good: weekDiff === 0 ? null : weekDiff > 0,
          }}
          hint="vs prior week"
          spark={weeks.map((w) => w.count)}
        />
        <SparkStat label="Avg completion" value={`${data.avgCompletionHours}h`} hint="created to done" />
        <SparkStat label="Teams" value={data.totalTeams} hint={`${people.length} ${people.length === 1 ? "person" : "people"}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
        <ChartCard
          title="Tasks by status"
          description={`${data.totalTasks} tasks in all`}
          table={{
            columns: ["Status", "Tasks", "Share"],
            rows: taskSegments.map((s) => [s.label, s.value, shareLabel(s.value, data.totalTasks)]),
          }}
        >
          <StackedBar segments={taskSegments} />
        </ChartCard>

        <ChartCard
          title="Briefs by status"
          description={`${data.totalBriefs} briefs in all`}
          table={{
            columns: ["Status", "Briefs", "Share"],
            rows: briefSegments.map((s) => [s.label, s.value, shareLabel(s.value, data.totalBriefs)]),
          }}
        >
          <StackedBar segments={briefSegments} />
        </ChartCard>

        <ChartCard
          title="Weekly velocity"
          description={`Tasks completed per week · ${velocitySum} in the last ${weeks.length} weeks`}
          table={{
            columns: ["Week ending", "Tasks done"],
            rows: weeks.map((w) => [w.week, w.count]),
          }}
        >
          <Columns categories={weeks.map((w) => w.week)} values={weeks.map((w) => w.count)} name="Tasks done" />
        </ChartCard>
        </div>

        <ChartCard
          title="Employee utilization"
          description={`Tasks done out of assigned · ${people.length} ${people.length === 1 ? "person" : "people"}`}
          table={{
            columns: ["Person", "Done", "Assigned", "Share", "Tracked"],
            rows: people.map((e) => [
              e.name,
              e.doneTasks,
              e.totalTasks,
              shareLabel(e.doneTasks, e.totalTasks),
              `${e.trackedHours}h`,
            ]),
          }}
        >
          {people.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">No employees yet.</p>
          ) : (
            <div className="space-y-3">
              {BANDS.filter((b) => banded[b.key].length > 0).map((b) => (
                <div key={b.key}>
                  <p className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-[var(--text-muted)]">
                    {b.title}
                    <span className="font-normal tabular-nums">{banded[b.key].length}</span>
                  </p>
                  <BarList
                    max={100}
                    items={banded[b.key].map((e) => ({
                      label: e.name,
                      value: e.totalTasks > 0 ? (e.doneTasks / e.totalTasks) * 100 : 0,
                      text: `${e.doneTasks}/${e.totalTasks}`,
                    }))}
                  />
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Recent activity" description="Latest changes across briefs, tasks and deliverables">
        <div className="-mx-4 -mb-4 max-h-[300px] overflow-y-auto divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
          {data.recentActivity.map((log: ActivityLog) => (
            <div key={log._id} className="flex items-start gap-3 px-4 py-2.5">
              <Badge className="min-w-[68px] justify-center mt-0.5 shrink-0">
                {actionLabel(log.action)}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--text-primary)]">
                  <span className="font-medium">{log.userName}</span>{" "}
                  <span className="text-[var(--text-secondary)]">
                    {log.action.replace(/_/g, " ")}
                  </span>{" "}
                  on <span className="font-medium">{log.briefTitle}</span>
                </p>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {new Date(log.timestamp).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          {data.recentActivity.length === 0 && (
            <p className="px-4 py-3.5 text-[13px] text-[var(--text-muted)]">No recent activity.</p>
          )}
        </div>
      </ChartCard>
    </div>
  );
}
