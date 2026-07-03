"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CalendarDays } from "lucide-react";
import {
  TASK_STATUS,
  StatusIcon,
  MonthChips,
  PortalCard,
  PortalCardHeader,
  EmptyState,
  formatPostDate,
  monthLabel,
} from "@/components/portal/shared";

export default function PortalCalendarPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const calendar = useQuery(api.clientPortal.getContentCalendar);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const pinned = calendar?.pinnedMonth ?? "";
  // Admin-pinned month wins until the client picks another
  const activeMonth = selectedMonth ?? pinned;

  const entries = useMemo(() => {
    if (!calendar) return [];
    return activeMonth
      ? calendar.entries.filter((e: any) => e.monthKey === activeMonth)
      : calendar.entries;
  }, [calendar, activeMonth]);

  const byMonth = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of entries) {
      if (!map[e.monthKey]) map[e.monthKey] = [];
      map[e.monthKey].push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.postDate || "z").localeCompare(b.postDate || "z"));
    }
    return map;
  }, [entries]);

  const sortedMonths = Object.keys(byMonth).sort();
  const gridMonth = activeMonth && activeMonth !== "unscheduled" ? activeMonth : sortedMonths.find((m) => m !== "unscheduled");

  const grid = useMemo(() => {
    if (!gridMonth) return null;
    const [y, m] = gridMonth.split("-").map(Number);
    if (!y || !m) return null;
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
    const entriesByDay: Record<number, { status: string }[]> = {};
    for (const e of entries) {
      if (!e.postDate?.startsWith(gridMonth)) continue;
      const day = parseInt(e.postDate.split("-")[2], 10);
      if (!entriesByDay[day]) entriesByDay[day] = [];
      entriesByDay[day].push({ status: e.status });
    }
    return { daysInMonth, firstDayOfWeek, entriesByDay };
  }, [gridMonth, entries]);

  if (!session || calendar === undefined) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!calendar) return null;

  const bc = session.brand.color;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <CalendarDays className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Content Calendar</h1>
      </div>

      {calendar.months.length > 1 && !pinned && (
        <MonthChips
          months={calendar.months}
          selected={activeMonth}
          onSelect={(m) => setSelectedMonth(m)}
          brandColor={bc}
        />
      )}

      {entries.length === 0 ? (
        <PortalCard>
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="No content scheduled"
            hint="Planned posts will appear here once the calendar is set up."
          />
        </PortalCard>
      ) : (
        <PortalCard>
          <PortalCardHeader
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            title={activeMonth ? monthLabel(activeMonth) : "All Posts"}
            count={entries.length}
            brandColor={bc}
          />

          {/* Mini month grid */}
          {grid && (
            <div className="px-6 py-4 border-b border-[#f0f0f0] bg-[#fafafa]">
              <div className="grid grid-cols-7 gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div key={i} className="text-center text-[9px] font-semibold text-[#a3a3a3] py-1">{d}</div>
                ))}
                {Array.from({ length: grid.firstDayOfWeek }, (_, i) => (
                  <div key={`e-${i}`} />
                ))}
                {Array.from({ length: grid.daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dayEntries = grid.entriesByDay[day];
                  const has = dayEntries && dayEntries.length > 0;
                  const allDone = has && dayEntries.every((e) => e.status === "done");
                  return (
                    <div
                      key={day}
                      className={`relative text-center py-1.5 rounded-lg text-[11px] font-medium ${has ? "font-semibold" : "text-[#a3a3a3]"}`}
                      style={has ? { backgroundColor: allDone ? "#10b98112" : bc + "12", color: allDone ? "#10b981" : bc } : {}}
                    >
                      {day}
                      {has && (
                        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {dayEntries.slice(0, 3).map((_, j) => (
                            <div key={j} className="w-1 h-1 rounded-full" style={{ backgroundColor: allDone ? "#10b981" : bc }} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entries list */}
          {sortedMonths.map((month) => (
            <div key={month}>
              {sortedMonths.length > 1 && (
                <div className="px-6 py-2 bg-[#fafafa] border-b border-[#f0f0f0]">
                  <span className="text-[12px] font-semibold text-[#525252]">{monthLabel(month)}</span>
                </div>
              )}
              {byMonth[month].map((entry: any, i: number) => {
                const info = TASK_STATUS[entry.status] ?? { label: entry.status, color: "#a3a3a3" };
                return (
                  <div
                    key={entry._id}
                    className={`flex items-center gap-3 px-6 py-3 ${i < byMonth[month].length - 1 ? "border-b border-[#f5f5f5]" : ""} ${entry.status === "done" ? "opacity-50" : ""}`}
                  >
                    <StatusIcon status={entry.status} brandColor={bc} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] text-[#171717] ${entry.status === "done" ? "line-through" : ""}`}>{entry.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.platform && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: bc, backgroundColor: bc + "10" }}>
                            {entry.platform}
                          </span>
                        )}
                        {entry.contentType && <span className="text-[10px] text-[#a3a3a3]">{entry.contentType}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.postDate && <span className="text-[11px] text-[#737373]">{formatPostDate(entry.postDate)}</span>}
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: info.color, backgroundColor: info.color + "12" }}>
                        {info.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </PortalCard>
      )}
    </div>
  );
}
