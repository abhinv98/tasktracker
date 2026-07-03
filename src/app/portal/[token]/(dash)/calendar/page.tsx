"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CalendarDays, ChevronLeft, ChevronRight, Tag as TagIcon } from "lucide-react";
import { TASK_STATUS, PortalCard, EmptyState, monthLabel } from "@/components/portal/shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_DOT: Record<string, string> = {
  pending: "#a3a3a3",
  "in-progress": "#f59e0b",
  review: "#8b5cf6",
  done: "#10b981",
};

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
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
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

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <CalendarDays className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Content Calendar</h1>
      </div>

      {/* Month navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white rounded-lg border border-[#e5e5e5] p-1">
          <button
            onClick={() => setSelectedMonth(shiftMonth(month, -1))}
            className="p-1.5 rounded-lg hover:bg-[#f5f5f5] text-[#525252]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 min-w-[140px] text-center text-[13px] font-semibold text-[#171717]">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setSelectedMonth(shiftMonth(month, 1))}
            className="p-1.5 rounded-lg hover:bg-[#f5f5f5] text-[#525252]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {monthOptions.length > 0 && (
          <select
            value={monthOptions.includes(month) ? month : ""}
            onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-[12px] text-[#525252] focus:outline-none"
          >
            <option value="" disabled>
              Jump to month
            </option>
            {monthOptions.map((m: string) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        )}
        <span className="text-[11px] text-[#a3a3a3] ml-auto">
          {monthEntries.length} post{monthEntries.length !== 1 ? "s" : ""} this month
        </span>
      </div>

      {/* Month grid */}
      <PortalCard>
        <div className="p-3 md:p-4">
          <div className="grid grid-cols-7 gap-px mb-px">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center py-2 text-[10px] font-semibold text-[#737373] uppercase tracking-wide bg-[#fafafa]"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[#f0f0f0] rounded-lg border border-[#f0f0f0] overflow-hidden">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} className="bg-[#fafafa] min-h-[96px] md:min-h-[116px] p-1.5 opacity-50" />
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
                    isWeekend ? "bg-[#fafafa]" : "bg-white"
                  }`}
                >
                  <span
                    className={`self-start text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                      isToday ? "text-white" : "text-[#737373]"
                    }`}
                    style={isToday ? { backgroundColor: bc } : {}}
                  >
                    {day}
                  </span>
                  {dayEntries.slice(0, 3).map((e: any) => {
                    const dot = STATUS_DOT[e.status] ?? STATUS_DOT.pending;
                    return (
                      <div
                        key={e._id}
                        title={`${e.title}${e.platform ? ` (${e.platform})` : ""}`}
                        className={`px-1.5 py-1 rounded-md border border-[#f0f0f0] bg-white shadow-sm ${
                          e.status === "done" ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                          {e.platform && (
                            <span className="text-[8px] font-semibold uppercase truncate" style={{ color: bc }}>
                              {e.platform}
                            </span>
                          )}
                        </div>
                        <p className={`text-[10px] text-[#171717] leading-tight truncate ${e.status === "done" ? "line-through" : ""}`}>
                          {e.title}
                        </p>
                      </div>
                    );
                  })}
                  {dayEntries.length > 3 && (
                    <span className="text-[9px] font-medium" style={{ color: bc }}>
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
                <div key={`t-${i}`} className="bg-[#fafafa] min-h-[96px] md:min-h-[116px] p-1.5 opacity-50" />
              ));
            })()}
          </div>
        </div>
      </PortalCard>

      {/* List below the grid, segregated by tag when tags exist */}
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
          const sorted = [...monthEntries].sort((a: any, b: any) =>
            (a.postDate || "z").localeCompare(b.postDate || "z")
          );
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
                    <div className={`flex items-center gap-1.5 px-5 py-2 bg-[#fafafa] ${gi > 0 ? "border-t border-[#f0f0f0]" : ""} border-b border-[#f0f0f0]`}>
                      <TagIcon className="h-3 w-3" style={{ color: bc }} />
                      <span className="text-[12px] font-semibold text-[#525252]">{group.label}</span>
                      <span className="text-[11px] text-[#a3a3a3]">{group.entries.length}</span>
                    </div>
                  )}
                  <div className="divide-y divide-[#f5f5f5]">
                    {group.entries.map((e: any) => {
                      const info = TASK_STATUS[e.status] ?? { label: e.status, color: "#a3a3a3" };
                      return (
                        <div key={e._id} className={`flex items-center gap-3 px-5 py-2.5 ${e.status === "done" ? "opacity-55" : ""}`}>
                          <span className="text-[11px] text-[#737373] tabular-nums w-14 shrink-0">
                            {e.postDate ? e.postDate.slice(8, 10) + " " + monthLabel(month).slice(0, 3) : "TBD"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] text-[#171717] truncate ${e.status === "done" ? "line-through" : ""}`}>{e.title}</p>
                          </div>
                          {e.platform && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ color: bc, backgroundColor: bc + "10" }}>
                              {e.platform}
                            </span>
                          )}
                          {e.contentType && <span className="text-[10px] text-[#a3a3a3] shrink-0">{e.contentType}</span>}
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ color: info.color, backgroundColor: info.color + "12" }}>
                            {info.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </PortalCard>
          );
        })()
      )}
    </div>
  );
}
