"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import {
  CheckCircle2,
  Clock,
  Send,
  Plus,
  Calendar,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  CalendarDays,
  LayoutGrid,
  Activity,
  Zap,
  Inbox,
  Sparkles,
} from "lucide-react";

const TASK_STATUS: Record<string, { label: string; color: string; icon: "pending" | "progress" | "review" | "done" }> = {
  pending: { label: "Pending", color: "#a3a3a3", icon: "pending" },
  "in-progress": { label: "In Progress", color: "#f59e0b", icon: "progress" },
  review: { label: "In Review", color: "#8b5cf6", icon: "review" },
  done: { label: "Completed", color: "#10b981", icon: "done" },
};

const CLIENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Under Review", color: "#f59e0b" },
  accepted: { label: "Accepted", color: "#3b82f6" },
  in_progress: { label: "In Progress", color: "#8b5cf6" },
  completed: { label: "Completed", color: "#10b981" },
  declined: { label: "Declined", color: "#ef4444" },
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPostDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

function daysUntil(ts: number): { text: string; urgent: boolean; overdue: boolean } {
  const diff = ts - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, urgent: true, overdue: true };
  if (days === 0) return { text: "Due today", urgent: true, overdue: false };
  if (days === 1) return { text: "Due tomorrow", urgent: true, overdue: false };
  if (days <= 3) return { text: `${days} days left`, urgent: true, overdue: false };
  if (days <= 7) return { text: `${days} days left`, urgent: false, overdue: false };
  return { text: `${days} days left`, urgent: false, overdue: false };
}

function StatusIcon({ status, brandColor }: { status: string; brandColor: string }) {
  const info = TASK_STATUS[status];
  if (!info) return null;
  const color = status === "in-progress" ? brandColor : info.color;
  if (info.icon === "done") return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color }} />;
  if (info.icon === "progress") return <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color }} />;
  if (info.icon === "review") return <Clock className="h-4 w-4 shrink-0" style={{ color }} />;
  return <Circle className="h-3.5 w-3.5 shrink-0" style={{ color }} />;
}

export default function JsrPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const jsr = useQuery(api.jsr.getJsrByToken, { token });
  const addClientTask = useMutation(api.jsr.addClientTask);

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [proposedDeadline, setProposedDeadline] = useState("");
  const [clientName, setClientName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(false);

  if (jsr === undefined) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
          <p className="text-[13px] text-[#a3a3a3] font-medium">Loading report...</p>
        </div>
      </div>
    );
  }

  if (jsr === null) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8">
          <div className="w-16 h-16 rounded-2xl bg-[#fef2f2] flex items-center justify-center mx-auto mb-4">
            <Inbox className="h-8 w-8 text-[#ef4444]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#171717] mb-2">Link Expired</h1>
          <p className="text-[14px] text-[#737373] leading-relaxed">
            This Job Status Report link is no longer active. Please contact your account manager for an updated link.
          </p>
        </div>
      </div>
    );
  }

  const bc = jsr.brand.color;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addClientTask({
        token,
        title,
        description: description || undefined,
        proposedDeadline: proposedDeadline ? new Date(proposedDeadline).getTime() : undefined,
        clientName: clientName || undefined,
      });
      setTitle("");
      setDescription("");
      setProposedDeadline("");
      setShowAddForm(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    } catch {}
    setSubmitting(false);
  }

  const progressPct = jsr.internalSummary.total > 0
    ? Math.round((jsr.internalSummary.done / jsr.internalSummary.total) * 100)
    : 0;

  const tasksByBrief = jsr.tasksByBrief ?? [];
  const calendarList = jsr.calendarList ?? [];
  const hasCalendar = calendarList.length > 0;
  const recentActivity = jsr.recentActivity ?? [];

  const calendarByMonth: Record<string, typeof calendarList> = {};
  for (const entry of calendarList) {
    const month = entry.postDate ? entry.postDate.substring(0, 7) : "unscheduled";
    if (!calendarByMonth[month]) calendarByMonth[month] = [];
    calendarByMonth[month].push(entry);
  }
  const sortedMonths = Object.keys(calendarByMonth).sort();

  function monthLabelStr(m: string) {
    if (m === "unscheduled") return "Unscheduled";
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // Mini calendar: build day grid for the active calendar month
  const calendarGridMonth = sortedMonths[0];
  const calendarGrid = useMemo(() => {
    if (!calendarGridMonth || calendarGridMonth === "unscheduled") return null;
    const [y, m] = calendarGridMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
    const entriesByDay: Record<number, { platform: string; status: string }[]> = {};
    for (const entry of calendarList) {
      if (!entry.postDate?.startsWith(calendarGridMonth)) continue;
      const day = parseInt(entry.postDate.split("-")[2], 10);
      if (!entriesByDay[day]) entriesByDay[day] = [];
      entriesByDay[day].push({ platform: entry.platform, status: entry.status });
    }
    return { year: y, month: m, daysInMonth, firstDayOfWeek, entriesByDay };
  }, [calendarGridMonth, calendarList]);

  const deadlineInfo = jsr.overallDeadline ? daysUntil(jsr.overallDeadline) : null;

  // Phase indicators based on status distribution
  const phases = [
    { label: "Planning", active: jsr.internalSummary.pending > 0, done: jsr.internalSummary.pending === 0 && jsr.internalSummary.total > 0 },
    { label: "In Progress", active: jsr.internalSummary.inProgress > 0, done: jsr.internalSummary.inProgress === 0 && jsr.internalSummary.done > 0 },
    { label: "Review", active: jsr.internalSummary.review > 0, done: jsr.internalSummary.review === 0 && jsr.internalSummary.done > 0 },
    { label: "Delivery", active: false, done: progressPct === 100 },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8f8f8" }}>
      {/* ═══ BRANDED HEADER ═══ */}
      <header className="sticky top-0 z-20">
        <div style={{ background: `linear-gradient(135deg, ${bc}, ${bc}dd)` }}>
          <div className="max-w-3xl mx-auto px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <span className="font-bold text-[20px] text-white">
                  {jsr.brand.name[0]}
                </span>
              </div>
              <div className="flex-1">
                <h1 className="font-bold text-[20px] text-white tracking-tight">
                  {jsr.brand.name}
                </h1>
                <p className="text-[13px] text-white/70 font-medium">Job Status Report</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {deadlineInfo && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold ${deadlineInfo.overdue ? "bg-red-500/20 text-white" : deadlineInfo.urgent ? "bg-white/20 text-white" : "bg-white/15 text-white/90"}`}>
                    <Calendar className="h-3 w-3" />
                    {deadlineInfo.text}
                  </div>
                )}
                {jsr.lastUpdated && (
                  <span className="text-[10px] text-white/50 font-medium">
                    Updated {timeAgo(jsr.lastUpdated)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Phase Pipeline */}
        <div className="bg-white border-b border-[#e5e5e5]">
          <div className="max-w-3xl mx-auto px-6 py-3">
            <div className="flex items-center gap-1">
              {phases.map((phase, i) => (
                <div key={phase.label} className="flex items-center flex-1">
                  <div className="flex items-center gap-1.5 flex-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        phase.done ? "text-white" : phase.active ? "text-white" : "bg-[#f0f0f0] text-[#a3a3a3]"
                      }`}
                      style={phase.done ? { backgroundColor: "#10b981" } : phase.active ? { backgroundColor: bc } : {}}
                    >
                      {phase.done ? "✓" : i + 1}
                    </div>
                    <span className={`text-[11px] font-medium whitespace-nowrap ${phase.done ? "text-[#10b981]" : phase.active ? "text-[#171717]" : "text-[#a3a3a3]"}`}>
                      {phase.label}
                    </span>
                  </div>
                  {i < phases.length - 1 && (
                    <div className="w-full h-px mx-2" style={{ backgroundColor: phase.done ? "#10b981" : "#e5e5e5" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Success Toast */}
        {submitted && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] text-[13px] font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Request submitted! The team will review it shortly.
          </div>
        )}

        {/* ═══ PROGRESS OVERVIEW ═══ */}
        <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[16px] text-[#171717]">Project Overview</h2>
              {jsr.internalSummary.internalDeadline && (
                <div className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg" style={{ color: bc, backgroundColor: bc + "10" }}>
                  <Calendar className="h-3 w-3" />
                  {formatDate(jsr.internalSummary.internalDeadline)}
                </div>
              )}
            </div>

            {/* Circular progress + stats */}
            <div className="flex items-center gap-6 mb-5">
              <div className="relative w-20 h-20 shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f0f0f0" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={bc}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${progressPct * 0.974} 100`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[18px] font-bold text-[#171717] tabular-nums">{progressPct}%</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-4 gap-2">
                {[
                  { label: "Pending", value: jsr.internalSummary.pending, color: "#a3a3a3" },
                  { label: "Active", value: jsr.internalSummary.inProgress, color: bc },
                  { label: "Review", value: jsr.internalSummary.review, color: "#8b5cf6" },
                  { label: "Done", value: jsr.internalSummary.done, color: "#10b981" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center py-2.5 rounded-xl" style={{ backgroundColor: stat.color + "08" }}>
                    <p className="font-bold text-[20px] tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[10px] text-[#737373] font-medium mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-[#f0f0f0] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPct}%`, backgroundColor: bc }}
              />
            </div>
          </div>
        </section>

        {/* ═══ TASKS GROUPED BY BRIEF ═══ */}
        {tasksByBrief.length > 0 && (
          <section className="space-y-3">
            {tasksByBrief.map((group: any) => {
              const done = group.tasks.filter((t: any) => t.status === "done").length;
              const total = group.tasks.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <BriefGroup
                  key={group.briefTitle}
                  title={group.briefTitle}
                  tasks={group.tasks}
                  done={done}
                  total={total}
                  pct={pct}
                  brandColor={bc}
                />
              );
            })}
          </section>
        )}

        {jsr.internalSummary.total === 0 && !hasCalendar && (
          <section className="bg-white rounded-2xl border border-[#e5e5e5] p-8 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: bc + "10" }}>
              <Sparkles className="h-7 w-7" style={{ color: bc }} />
            </div>
            <h3 className="font-semibold text-[15px] text-[#171717] mb-1">Getting Started</h3>
            <p className="text-[13px] text-[#737373] max-w-sm mx-auto">
              The team is setting up your project. Tasks will appear here once work begins.
            </p>
          </section>
        )}

        {/* ═══ CONTENT CALENDAR ═══ */}
        {hasCalendar && (
          <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
            <button
              onClick={() => setCalendarExpanded(!calendarExpanded)}
              className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bc + "12" }}>
                  <CalendarDays className="h-3.5 w-3.5" style={{ color: bc }} />
                </div>
                <h2 className="font-semibold text-[15px] text-[#171717]">Content Calendar</h2>
                <span className="text-[12px] text-[#a3a3a3] ml-1">{calendarList.length} posts</span>
              </div>
              {calendarExpanded ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
            </button>

            {calendarExpanded && (
              <div className="border-t border-[#f0f0f0]">
                {/* Mini Calendar Grid */}
                {calendarGrid && (
                  <div className="px-6 py-4 border-b border-[#f0f0f0] bg-[#fafafa]">
                    <p className="text-[12px] font-semibold text-[#525252] mb-3">{monthLabelStr(calendarGridMonth)}</p>
                    <div className="grid grid-cols-7 gap-1">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div key={i} className="text-center text-[9px] font-semibold text-[#a3a3a3] py-1">{d}</div>
                      ))}
                      {Array.from({ length: calendarGrid.firstDayOfWeek }, (_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: calendarGrid.daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const entries = calendarGrid.entriesByDay[day];
                        const hasEntries = entries && entries.length > 0;
                        const allDone = hasEntries && entries.every((e) => e.status === "done");
                        return (
                          <div
                            key={day}
                            className={`relative text-center py-1.5 rounded-lg text-[11px] font-medium ${hasEntries ? "font-semibold" : "text-[#a3a3a3]"}`}
                            style={hasEntries ? { backgroundColor: allDone ? "#10b98112" : bc + "12", color: allDone ? "#10b981" : bc } : {}}
                          >
                            {day}
                            {hasEntries && (
                              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                                {entries.slice(0, 3).map((_, j) => (
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

                {/* Calendar entries list */}
                {sortedMonths.map((month) => (
                  <div key={month}>
                    {!calendarGrid && (
                      <div className="px-6 py-2 bg-[#fafafa] border-b border-[#f0f0f0]">
                        <span className="text-[12px] font-semibold text-[#525252]">{monthLabelStr(month)}</span>
                      </div>
                    )}
                    {calendarByMonth[month].map((entry: any, i: number) => {
                      const info = TASK_STATUS[entry.status] ?? { label: entry.status, color: "#a3a3a3" };
                      return (
                        <div
                          key={entry._id}
                          className={`flex items-center gap-3 px-6 py-3 ${i < calendarByMonth[month].length - 1 ? "border-b border-[#f5f5f5]" : "border-b border-[#f0f0f0]"} ${entry.status === "done" ? "opacity-50" : ""}`}
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
              </div>
            )}
          </section>
        )}

        {/* ═══ CLIENT REQUESTS ═══ */}
        <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
          <button
            onClick={() => setRequestsExpanded(!requestsExpanded)}
            className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bc + "12" }}>
                <LayoutGrid className="h-3.5 w-3.5" style={{ color: bc }} />
              </div>
              <h2 className="font-semibold text-[15px] text-[#171717]">Your Requests</h2>
              {jsr.clientTasks.length > 0 && (
                <span className="text-[12px] text-[#a3a3a3] ml-1">({jsr.clientTasks.length})</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {jsr.clientTasksDeadline && (
                <span className="text-[12px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1" style={{ color: bc, backgroundColor: bc + "10" }}>
                  <Calendar className="h-3 w-3" />
                  {formatDate(jsr.clientTasksDeadline)}
                </span>
              )}
              {requestsExpanded ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
            </div>
          </button>

          {requestsExpanded && (
            <div className="border-t border-[#f0f0f0]">
              {jsr.clientTasks.length > 0 ? (
                <div>
                  {jsr.clientTasks.map((task: any, i: number) => {
                    const statusInfo = CLIENT_STATUS_LABELS[task.status];
                    return (
                      <div key={task._id} className={`px-6 py-4 ${i < jsr.clientTasks.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-[14px] text-[#171717]">{task.title}</p>
                              {task.clientName && (
                                <span className="text-[10px] text-[#a3a3a3] bg-[#f5f5f5] px-1.5 py-0.5 rounded">by {task.clientName}</span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-[13px] text-[#737373] mt-1 leading-relaxed">{task.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2.5">
                              {task.proposedDeadline && (
                                <span className="flex items-center gap-1 text-[11px] text-[#a3a3a3]">
                                  <Clock className="h-3 w-3" />Proposed: {formatDate(task.proposedDeadline)}
                                </span>
                              )}
                              {task.finalDeadline && (
                                <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: bc }}>
                                  <Calendar className="h-3 w-3" />Deadline: {formatDate(task.finalDeadline)}
                                </span>
                              )}
                              {!task.finalDeadline && task.status === "pending_review" && (
                                <span className="text-[11px] text-[#a3a3a3] italic flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />Deadline pending review
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                            style={{ color: statusInfo?.color, backgroundColor: statusInfo?.color + "12" }}
                          >
                            {statusInfo?.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: bc + "08" }}>
                    <Inbox className="h-6 w-6" style={{ color: bc + "60" }} />
                  </div>
                  <p className="text-[13px] text-[#a3a3a3]">No requests yet. Need something? Add a request below.</p>
                </div>
              )}

              {/* Add form */}
              <div className="border-t border-[#f0f0f0] px-6 py-4">
                {showAddForm ? (
                  <div>
                    <h3 className="font-medium text-[14px] text-[#171717] mb-4">New Request</h3>
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[12px] font-medium text-[#525252] block mb-1">Your Name</label>
                          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Your name" className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-white" style={{ "--tw-ring-color": bc + "30" } as any} />
                        </div>
                        <div>
                          <label className="text-[12px] font-medium text-[#525252] block mb-1">Proposed Deadline</label>
                          <input type="date" value={proposedDeadline} onChange={(e) => setProposedDeadline(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-white" style={{ "--tw-ring-color": bc + "30" } as any} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#525252] block mb-1">Task Title *</label>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need?" required className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-white" style={{ "--tw-ring-color": bc + "30" } as any} />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#525252] block mb-1">Description</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide more details..." rows={3} className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-white resize-none" style={{ "--tw-ring-color": bc + "30" } as any} />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={submitting || !title.trim()}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-[13px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                          style={{ backgroundColor: bc }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          {submitting ? "Submitting..." : "Submit Request"}
                        </button>
                        <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2.5 rounded-xl text-[13px] font-medium text-[#737373] hover:bg-[#f5f5f5] transition-colors">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-[13px] font-medium transition-all hover:bg-opacity-5"
                    style={{ borderColor: bc + "40", color: bc }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = bc + "08"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <Plus className="h-4 w-4" />
                    Add a Request
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ═══ RECENT ACTIVITY ═══ */}
        {recentActivity.length > 0 && (
          <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
            <button
              onClick={() => setActivityExpanded(!activityExpanded)}
              className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#f0f0f0] flex items-center justify-center">
                  <Activity className="h-3.5 w-3.5 text-[#525252]" />
                </div>
                <h2 className="font-semibold text-[15px] text-[#171717]">Recent Activity</h2>
              </div>
              {activityExpanded ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
            </button>
            {activityExpanded && (
              <div className="border-t border-[#f0f0f0] px-6 py-3">
                {recentActivity.map((a: any, i: number) => (
                  <div key={i} className={`flex items-center gap-3 py-2.5 ${i < recentActivity.length - 1 ? "border-b border-[#f8f8f8]" : ""}`}>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: bc }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-[#171717]">{a.label}</p>
                      {a.briefTitle && <p className="text-[10px] text-[#a3a3a3]">{a.briefTitle}</p>}
                    </div>
                    <span className="text-[10px] text-[#a3a3a3] shrink-0">{timeAgo(a.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ═══ DEADLINE SUMMARY ═══ */}
        {(jsr.internalSummary.internalDeadline || jsr.clientTasksDeadline || jsr.overallDeadline) && (
          <section className="rounded-2xl overflow-hidden shadow-sm" style={{ background: `linear-gradient(135deg, ${bc}08, ${bc}04)`, border: `1px solid ${bc}20` }}>
            <div className="p-6">
              <h2 className="font-semibold text-[15px] text-[#171717] mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4" style={{ color: bc }} />
                Deadline Summary
              </h2>
              <div className="space-y-3">
                {jsr.internalSummary.internalDeadline && (
                  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/60">
                    <span className="text-[13px] text-[#525252]">Existing Work</span>
                    <span className="text-[13px] font-semibold text-[#171717]">{formatDate(jsr.internalSummary.internalDeadline)}</span>
                  </div>
                )}
                {jsr.clientTasksDeadline && (
                  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/60">
                    <span className="text-[13px] text-[#525252]">Additional Requests</span>
                    <span className="text-[13px] font-semibold text-[#171717]">{formatDate(jsr.clientTasksDeadline)}</span>
                  </div>
                )}
                {jsr.overallDeadline && (
                  <div className="flex items-center justify-between py-3 px-3 rounded-xl" style={{ backgroundColor: bc + "12" }}>
                    <span className="text-[13px] font-bold text-[#171717]">Overall Deadline</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold" style={{ color: bc }}>{formatDate(jsr.overallDeadline)}</span>
                      {deadlineInfo && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${deadlineInfo.overdue ? "bg-red-100 text-red-600" : deadlineInfo.urgent ? "bg-amber-100 text-amber-700" : "bg-[#f0f0f0] text-[#525252]"}`}>
                          {deadlineInfo.text}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="text-center pt-4 pb-8">
          <p className="text-[11px] text-[#d4d4d4]">Powered by Ecultify</p>
        </footer>
      </main>
    </div>
  );
}

/* ────── Brief Group Component ────── */
function BriefGroup({ title, tasks, done, total, pct, brandColor }: {
  title: string; tasks: any[]; done: number; total: number; pct: number; brandColor: string;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: brandColor }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[14px] text-[#171717] truncate text-left">{title}</h3>
            <p className="text-[11px] text-[#a3a3a3] text-left">{done}/{total} complete</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#10b981" : brandColor }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums w-8 text-right" style={{ color: pct === 100 ? "#10b981" : "#525252" }}>{pct}%</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#f0f0f0]">
          {tasks.map((task: any, i: number) => {
            const info = TASK_STATUS[task.status] ?? { label: task.status, color: "#a3a3a3" };
            return (
              <div key={task._id} className={`flex items-center gap-3 px-6 py-2.5 ${i < tasks.length - 1 ? "border-b border-[#f8f8f8]" : ""} ${task.status === "done" ? "opacity-50" : ""}`}>
                <StatusIcon status={task.status} brandColor={brandColor} />
                <p className={`flex-1 text-[13px] text-[#171717] ${task.status === "done" ? "line-through" : ""}`}>{task.title}</p>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: info.color, backgroundColor: info.color + "12" }}>{info.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
