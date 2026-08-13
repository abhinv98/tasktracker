"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Tag as TagIcon } from "lucide-react";
import {
  TASK_STATUS,
  MonthChips,
  PortalCard,
  EmptyState,
  monthLabel,
} from "@/components/portal/shared";
import { PortalPageHeader, PortalSkeleton, PortalStatusChip } from "@/components/portal/ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PortalCalendarPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const calendar = useQuery(api.clientPortal.getContentCalendar);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const month = useMemo(() => {
    if (selectedMonth) return selectedMonth;
    if (calendar?.pinnedMonth) return calendar.pinnedMonth;
    if (calendar && calendar.months.length > 0) {
      const cur = currentMonthKey();
      const real = calendar.months.filter((m: string) => m !== "unscheduled");
      if (real.includes(cur)) return cur;
      return real[real.length - 1] ?? cur;
    }
    return currentMonthKey();
  }, [selectedMonth, calendar]);

  const monthEntries = useMemo(() => {
    if (!calendar) return [];
    return calendar.entries.filter((e: any) => e.monthKey === month);
  }, [calendar, month]);

  const entriesByDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (const e of monthEntries) {
      if (!e.postDate) continue;
      const day = parseInt(e.postDate.split("-")[2], 10);
      if (!map[day]) map[day] = [];
      map[day].push(e);
    }
    return map;
  }, [monthEntries]);

  if (!session || calendar === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-56" />
        <PortalSkeleton rows={5} />
      </div>
    );
  }
  if (!calendar) return null;

  const bc = session.brand.color;
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthOptions = calendar.months.filter((m: string) => m !== "unscheduled");

  const sorted = [...monthEntries].sort((a: any, b: any) =>
    (a.postDate || "z").localeCompare(b.postDate || "z")
  );

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-4">
      <PortalPageHeader
        title="Content calendar"
        description="What's planned and published for your channels, month by month."
        action={
          <div className="flex items-center gap-1 bg-[var(--p-surface)] rounded-[var(--p-radius-sm)] border border-[var(--p-border)] p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-[var(--p-radius-sm)] text-[12px] font-medium ${
                view === "grid" ? "text-white" : "text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)]"
              }`}
              style={view === "grid" ? { backgroundColor: bc } : {}}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-[var(--p-radius-sm)] text-[12px] font-medium ${
                view === "list" ? "text-white" : "text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)]"
              }`}
              style={view === "list" ? { backgroundColor: bc } : {}}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        }
      />

      {/* Month navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-[var(--p-surface)] rounded-[var(--p-radius-sm)] border border-[var(--p-border)] p-1">
          <button
            onClick={() => setSelectedMonth(shiftMonth(month, -1))}
            className="p-1.5 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)] text-[var(--p-text-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 min-w-[140px] text-center text-[13px] font-semibold text-[var(--p-text)]">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setSelectedMonth(shiftMonth(month, 1))}
            className="p-1.5 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)] text-[var(--p-text-2)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-[11px] text-[var(--p-text-3)] ml-auto">
          {monthEntries.length} post{monthEntries.length !== 1 ? "s" : ""} this month
        </span>
      </div>

      {monthOptions.length > 1 && (
        <MonthChips
          months={monthOptions}
          selected={month}
          onSelect={(m) => m && setSelectedMonth(m)}
          brandColor={bc}
          showAll={false}
        />
      )}

      {view === "grid" ? (
        <>
          {/* Month grid */}
          <PortalCard>
            <div className="p-3 md:p-4">
              <div className="grid grid-cols-7 gap-px mb-px">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center py-2 p-overline bg-[var(--p-surface-2)]">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-[var(--p-border)] rounded-[var(--p-radius-md)] border border-[var(--p-border)] overflow-hidden">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} className="bg-[var(--p-surface-2)] min-h-[96px] md:min-h-[116px] p-1.5 opacity-50" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${month}-${String(day).padStart(2, "0")}`;
                  const dayEntries = entriesByDay[day] ?? [];
                  const isToday = dateStr === todayStr;
                  const dow = new Date(year, monthNum - 1, day).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <div
                      key={day}
                      className={`min-h-[96px] md:min-h-[116px] p-1.5 flex flex-col gap-1 ${
                        isWeekend ? "bg-[var(--p-surface-2)]" : "bg-[var(--p-surface)]"
                      }`}
                      style={isToday ? { outline: `2px solid ${bc}`, outlineOffset: "-2px" } : {}}
                    >
                      <span
                        className={`self-start text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-[var(--p-radius-sm)] ${
                          isToday ? "text-white" : "text-[var(--p-text-2)]"
                        }`}
                        style={isToday ? { backgroundColor: bc } : {}}
                      >
                        {day}
                      </span>
                      {dayEntries.slice(0, 3).map((e: any) => {
                        const dot = TASK_STATUS[e.status]?.color ?? TASK_STATUS.pending.color;
                        return (
                          <div
                            key={e._id}
                            title={`${e.title}${e.platform ? ` (${e.platform})` : ""}`}
                            className={`px-1.5 py-1 rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface)] ${
                              e.status === "done" ? "opacity-60" : ""
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                              {e.platform && (
                                <span className="text-[11px] font-semibold uppercase truncate text-[var(--p-text-3)]">
                                  {e.platform}
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[11px] text-[var(--p-text)] leading-tight truncate ${
                                e.status === "done" ? "line-through" : ""
                              }`}
                            >
                              {e.title}
                            </p>
                          </div>
                        );
                      })}
                      {dayEntries.length > 3 && (
                        <span className="text-[11px] font-medium text-[var(--p-text-2)]">
                          +{dayEntries.length - 3} more
                        </span>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const total = firstDay + daysInMonth;
                  const rest = total % 7 === 0 ? 0 : 7 - (total % 7);
                  return Array.from({ length: rest }).map((_, i) => (
                    <div key={`t-${i}`} className="bg-[var(--p-surface-2)] min-h-[96px] md:min-h-[116px] p-1.5 opacity-50" />
                  ));
                })()}
              </div>
            </div>
          </PortalCard>

          {/* Tag-grouped list below the grid */}
          {monthEntries.length === 0 ? (
            <PortalCard>
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title="No posts scheduled this month"
                hint="Pick another month above, or check back once the team plans content."
              />
            </PortalCard>
          ) : (
            (() => {
              const tags = [...new Set(sorted.map((e: any) => e.tag).filter(Boolean))].sort() as string[];
              const groups: { label: string | null; entries: any[] }[] =
                tags.length > 0
                  ? [
                      ...tags.map((t) => ({ label: t, entries: sorted.filter((e: any) => e.tag === t) })),
                      ...(sorted.some((e: any) => !e.tag)
                        ? [{ label: "Uncategorised", entries: sorted.filter((e: any) => !e.tag) }]
                        : []),
                    ]
                  : [{ label: null, entries: sorted }];
              return (
                <PortalCard>
                  {groups.map((group, gi) => (
                    <div key={group.label ?? "all"}>
                      {group.label && (
                        <div
                          className={`flex items-center gap-1.5 px-5 py-2 bg-[var(--p-surface-2)] ${
                            gi > 0 ? "border-t border-[var(--p-border)]" : ""
                          } border-b border-[var(--p-border)]`}
                        >
                          <TagIcon className="h-3 w-3 text-[var(--p-text-3)]" />
                          <span className="text-[12px] font-semibold text-[var(--p-text-2)]">{group.label}</span>
                          <span className="text-[11px] text-[var(--p-text-3)]">{group.entries.length}</span>
                        </div>
                      )}
                      <div>
                        {group.entries.map((e: any) => (
                          <EntryRow key={e._id} entry={e} month={month} />
                        ))}
                      </div>
                    </div>
                  ))}
                </PortalCard>
              );
            })()
          )}
        </>
      ) : (
        /* List view — date-grouped rows, easier on mobile */
        <PortalCard>
          {monthEntries.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" />}
              title="No posts scheduled this month"
              hint="Pick another month above, or check back once the team plans content."
            />
          ) : (
            (() => {
              const byDate: { date: string; entries: any[] }[] = [];
              for (const e of sorted) {
                const key = e.postDate || "Unscheduled";
                const last = byDate[byDate.length - 1];
                if (last && last.date === key) last.entries.push(e);
                else byDate.push({ date: key, entries: [e] });
              }
              return byDate.map((group) => (
                <div key={group.date}>
                  <div
                    className="px-5 py-2 bg-[var(--p-surface-2)] border-b border-[var(--p-border)] p-overline"
                    style={group.date === todayStr ? { color: bc } : {}}
                  >
                    {group.date === "Unscheduled"
                      ? "Unscheduled"
                      : new Date(group.date + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                    {group.date === todayStr ? " · Today" : ""}
                  </div>
                  {group.entries.map((e: any) => (
                    <EntryRow key={e._id} entry={e} month={month} hideDate />
                  ))}
                </div>
              ));
            })()
          )}
        </PortalCard>
      )}
    </div>
  );
}

function EntryRow({ entry, month, hideDate = false }: { entry: any; month: string; hideDate?: boolean }) {
  const info = TASK_STATUS[entry.status] ?? { label: entry.status, color: "var(--p-text-3)" };
  return (
    <div
      className={`flex items-center gap-3 px-5 py-2.5 border-b border-[var(--p-border)] last:border-b-0 ${
        entry.status === "done" ? "opacity-55" : ""
      }`}
    >
      {!hideDate && (
        <span className="text-[11px] text-[var(--p-text-2)] tabular-nums w-14 shrink-0">
          {entry.postDate ? entry.postDate.slice(8, 10) + " " + monthLabel(month).slice(0, 3) : "TBD"}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className={`p-body truncate ${entry.status === "done" ? "line-through" : ""}`}>{entry.title}</p>
        {entry.postDescription && (
          <p className="text-[11px] text-[var(--p-text-3)] truncate mt-0.5">
            {entry.postDescription}
          </p>
        )}
      </div>
      {entry.platform && (
        <span className="p-overline shrink-0 hidden sm:inline">{entry.platform}</span>
      )}
      {entry.contentType && (
        <span className="text-[11px] text-[var(--p-text-3)] shrink-0 hidden sm:inline">{entry.contentType}</span>
      )}
      <PortalStatusChip label={info.label} dotColor={info.color} className="shrink-0" />
    </div>
  );
}
