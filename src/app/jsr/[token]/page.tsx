"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";
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
  FileText,
  LayoutGrid,
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
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPostDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: string }) {
  const info = TASK_STATUS[status];
  if (!info) return null;
  if (info.icon === "done") {
    return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: info.color }} />;
  }
  if (info.icon === "progress") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: info.color }} />;
  }
  if (info.icon === "review") {
    return <Clock className="h-4 w-4 shrink-0" style={{ color: info.color }} />;
  }
  return <Circle className="h-4 w-4 shrink-0" style={{ color: info.color }} />;
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
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(true);

  if (jsr === undefined) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
          <p className="text-[14px] text-[#737373]">Loading...</p>
        </div>
      </div>
    );
  }

  if (jsr === null) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-[20px] font-semibold text-[#171717] mb-2">Link Expired or Invalid</h1>
          <p className="text-[14px] text-[#737373]">This Job Status Report link is no longer active.</p>
        </div>
      </div>
    );
  }

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
    } catch {
      // silently handle
    }
    setSubmitting(false);
  }

  const progressPct = jsr.internalSummary.total > 0
    ? Math.round((jsr.internalSummary.done / jsr.internalSummary.total) * 100)
    : 0;

  const taskList = jsr.taskList ?? [];
  const calendarList = jsr.calendarList ?? [];
  const hasCalendar = calendarList.length > 0;

  // Group calendar entries by month
  const calendarByMonth: Record<string, typeof calendarList> = {};
  for (const entry of calendarList) {
    const month = entry.postDate ? entry.postDate.substring(0, 7) : "unscheduled";
    if (!calendarByMonth[month]) calendarByMonth[month] = [];
    calendarByMonth[month].push(entry);
  }
  const sortedMonths = Object.keys(calendarByMonth).sort();

  function monthLabel(m: string) {
    if (m === "unscheduled") return "Unscheduled";
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="border-b border-[#e5e5e5] bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: jsr.brand.color + "18" }}
            >
              <span className="font-bold text-[18px]" style={{ color: jsr.brand.color }}>
                {jsr.brand.name[0]}
              </span>
            </div>
            <div className="flex-1">
              <h1 className="font-semibold text-[18px] text-[#171717]">
                {jsr.brand.name}
              </h1>
              <p className="text-[13px] text-[#737373]">Job Status Report</p>
            </div>
            {jsr.overallDeadline && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f5f5f5] border border-[#e5e5e5]">
                <Calendar className="h-3.5 w-3.5 text-[#525252]" />
                <span className="text-[12px] font-medium text-[#525252]">
                  Overall: {formatDate(jsr.overallDeadline)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Success Toast */}
        {submitted && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] text-[13px] font-medium animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="h-4 w-4" />
            Task submitted successfully. The team will review it shortly.
          </div>
        )}

        {/* ═══════ SECTION 1: Progress Overview ═══════ */}
        <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[15px] text-[#171717]">
                Project Overview
              </h2>
              {jsr.internalSummary.internalDeadline && (
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#525252] bg-[#f5f5f5] px-2.5 py-1 rounded-md">
                  <Calendar className="h-3 w-3" />
                  Deadline: {formatDate(jsr.internalSummary.internalDeadline)}
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-[#525252]">Overall Progress</span>
                <span className="text-[14px] text-[#171717] font-bold tabular-nums">{progressPct}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#f5f5f5] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: jsr.brand.color,
                  }}
                />
              </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Pending", value: jsr.internalSummary.pending, color: "#a3a3a3" },
                { label: "In Progress", value: jsr.internalSummary.inProgress, color: "#f59e0b" },
                { label: "In Review", value: jsr.internalSummary.review, color: "#8b5cf6" },
                { label: "Completed", value: jsr.internalSummary.done, color: "#10b981" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="text-center py-3 px-2 rounded-xl border border-[#f0f0f0]"
                  style={{ backgroundColor: stat.color + "06" }}
                >
                  <p className="font-bold text-[22px] tabular-nums" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-[#737373] font-medium mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ SECTION 2: Task List ═══════ */}
        {taskList.length > 0 && (
          <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden">
            <button
              onClick={() => setTasksExpanded(!tasksExpanded)}
              className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#525252]" />
                <h2 className="font-semibold text-[15px] text-[#171717]">
                  Tasks
                </h2>
                <span className="text-[12px] text-[#a3a3a3] font-normal ml-1">
                  {taskList.filter((t: any) => t.status === "done").length}/{taskList.length} complete
                </span>
              </div>
              {tasksExpanded ? (
                <ChevronUp className="h-4 w-4 text-[#a3a3a3]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />
              )}
            </button>

            {tasksExpanded && (
              <div className="border-t border-[#f0f0f0]">
                {taskList.map((task: any, i: number) => {
                  const info = TASK_STATUS[task.status] ?? { label: task.status, color: "#a3a3a3" };
                  return (
                    <div
                      key={task._id}
                      className={`flex items-center gap-3 px-6 py-3 ${i < taskList.length - 1 ? "border-b border-[#f5f5f5]" : ""} ${task.status === "done" ? "opacity-60" : ""}`}
                    >
                      <StatusDot status={task.status} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] text-[#171717] ${task.status === "done" ? "line-through" : ""}`}>
                          {task.title}
                        </p>
                        {task.briefTitle && (
                          <p className="text-[11px] text-[#a3a3a3] mt-0.5">{task.briefTitle}</p>
                        )}
                      </div>
                      <span
                        className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ color: info.color, backgroundColor: info.color + "12" }}
                      >
                        {info.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ═══════ SECTION 3: Content Calendar ═══════ */}
        {hasCalendar && (
          <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden">
            <button
              onClick={() => setCalendarExpanded(!calendarExpanded)}
              className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#525252]" />
                <h2 className="font-semibold text-[15px] text-[#171717]">
                  Content Calendar
                </h2>
                <span className="text-[12px] text-[#a3a3a3] font-normal ml-1">
                  {calendarList.length} entries
                </span>
              </div>
              {calendarExpanded ? (
                <ChevronUp className="h-4 w-4 text-[#a3a3a3]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />
              )}
            </button>

            {calendarExpanded && (
              <div className="border-t border-[#f0f0f0]">
                {sortedMonths.map((month) => (
                  <div key={month}>
                    <div className="px-6 py-2 bg-[#fafafa] border-b border-[#f0f0f0]">
                      <span className="text-[12px] font-semibold text-[#525252]">
                        {monthLabel(month)}
                      </span>
                    </div>
                    {calendarByMonth[month].map((entry: any, i: number) => {
                      const info = TASK_STATUS[entry.status] ?? { label: entry.status, color: "#a3a3a3" };
                      return (
                        <div
                          key={entry._id}
                          className={`flex items-center gap-3 px-6 py-3 ${i < calendarByMonth[month].length - 1 ? "border-b border-[#f5f5f5]" : "border-b border-[#f0f0f0]"} ${entry.status === "done" ? "opacity-60" : ""}`}
                        >
                          <StatusDot status={entry.status} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] text-[#171717] ${entry.status === "done" ? "line-through" : ""}`}>
                              {entry.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {entry.platform && (
                                <span className="text-[10px] font-medium text-[#737373] bg-[#f5f5f5] px-1.5 py-0.5 rounded">
                                  {entry.platform}
                                </span>
                              )}
                              {entry.contentType && (
                                <span className="text-[10px] text-[#a3a3a3]">
                                  {entry.contentType}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {entry.postDate && (
                              <span className="text-[11px] text-[#737373]">
                                {formatPostDate(entry.postDate)}
                              </span>
                            )}
                            <span
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                              style={{ color: info.color, backgroundColor: info.color + "12" }}
                            >
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

        {/* ═══════ SECTION 4: Client Requests ═══════ */}
        <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden">
          <button
            onClick={() => setRequestsExpanded(!requestsExpanded)}
            className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-[#525252]" />
              <h2 className="font-semibold text-[15px] text-[#171717]">
                Your Requests
              </h2>
              {jsr.clientTasks.length > 0 && (
                <span className="text-[12px] text-[#a3a3a3] font-normal ml-1">
                  ({jsr.clientTasks.length})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {jsr.clientTasksDeadline && (
                <span className="text-[12px] font-medium text-[#525252] bg-[#f5f5f5] px-2.5 py-1 rounded-md flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(jsr.clientTasksDeadline)}
                </span>
              )}
              {requestsExpanded ? (
                <ChevronUp className="h-4 w-4 text-[#a3a3a3]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />
              )}
            </div>
          </button>

          {requestsExpanded && (
            <div className="border-t border-[#f0f0f0]">
              {jsr.clientTasks.length > 0 ? (
                <div>
                  {jsr.clientTasks.map((task: any, i: number) => {
                    const statusInfo = CLIENT_STATUS_LABELS[task.status];
                    return (
                      <div
                        key={task._id}
                        className={`px-6 py-4 ${i < jsr.clientTasks.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-[14px] text-[#171717]">{task.title}</p>
                              {task.clientName && (
                                <span className="text-[10px] text-[#a3a3a3] bg-[#f5f5f5] px-1.5 py-0.5 rounded">
                                  by {task.clientName}
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-[13px] text-[#737373] mt-1 leading-relaxed">{task.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2.5">
                              {task.proposedDeadline && (
                                <span className="flex items-center gap-1 text-[11px] text-[#a3a3a3]">
                                  <Clock className="h-3 w-3" />
                                  Proposed: {formatDate(task.proposedDeadline)}
                                </span>
                              )}
                              {task.finalDeadline && (
                                <span className="flex items-center gap-1 text-[11px] text-[#171717] font-medium">
                                  <Calendar className="h-3 w-3" />
                                  Deadline: {formatDate(task.finalDeadline)}
                                </span>
                              )}
                              {!task.finalDeadline && task.status === "pending_review" && (
                                <span className="text-[11px] text-[#a3a3a3] italic">
                                  Deadline pending review
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                            style={{
                              color: statusInfo?.color,
                              backgroundColor: statusInfo?.color + "12",
                            }}
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
                  <p className="text-[13px] text-[#a3a3a3]">No requests submitted yet.</p>
                </div>
              )}

              {/* Add Task Form */}
              <div className="border-t border-[#f0f0f0] px-6 py-4">
                {showAddForm ? (
                  <div>
                    <h3 className="font-medium text-[14px] text-[#171717] mb-4">New Request</h3>
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[12px] font-medium text-[#525252] block mb-1">Your Name</label>
                          <input
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="Your name"
                            className="w-full px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717]/20 transition-all bg-[#fafafa]"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-medium text-[#525252] block mb-1">Proposed Deadline</label>
                          <input
                            type="date"
                            value={proposedDeadline}
                            onChange={(e) => setProposedDeadline(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717]/20 transition-all bg-[#fafafa]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#525252] block mb-1">Task Title *</label>
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="What do you need?"
                          required
                          className="w-full px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717]/20 transition-all bg-[#fafafa]"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#525252] block mb-1">Description</label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Provide more details..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717]/20 transition-all bg-[#fafafa] resize-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={submitting || !title.trim()}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#171717] text-white text-[13px] font-medium hover:bg-[#404040] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {submitting ? "Submitting..." : "Submit Request"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-4 py-2.5 rounded-xl text-[13px] font-medium text-[#737373] hover:bg-[#f5f5f5] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[#e5e5e5] text-[13px] font-medium text-[#737373] hover:border-[#d4d4d4] hover:text-[#525252] hover:bg-[#fafafa] transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    Add a Request
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ═══════ Deadline Summary ═══════ */}
        {(jsr.internalSummary.internalDeadline || jsr.clientTasksDeadline || jsr.overallDeadline) && (
          <section className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
            <h2 className="font-semibold text-[15px] text-[#171717] mb-4">Deadline Summary</h2>
            <div className="space-y-3">
              {jsr.internalSummary.internalDeadline && (
                <div className="flex items-center justify-between py-2 border-b border-[#f5f5f5]">
                  <span className="text-[13px] text-[#525252]">Existing Work Deadline</span>
                  <span className="text-[13px] font-semibold text-[#171717]">
                    {formatDate(jsr.internalSummary.internalDeadline)}
                  </span>
                </div>
              )}
              {jsr.clientTasksDeadline && (
                <div className="flex items-center justify-between py-2 border-b border-[#f5f5f5]">
                  <span className="text-[13px] text-[#525252]">Additional Requests Deadline</span>
                  <span className="text-[13px] font-semibold text-[#171717]">
                    {formatDate(jsr.clientTasksDeadline)}
                  </span>
                </div>
              )}
              {jsr.overallDeadline && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-[13px] font-semibold text-[#171717]">Overall Deadline</span>
                  <span
                    className="text-[14px] font-bold px-3 py-1 rounded-lg"
                    style={{ color: jsr.brand.color, backgroundColor: jsr.brand.color + "12" }}
                  >
                    {formatDate(jsr.overallDeadline)}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-4 pb-8">
          <p className="text-[11px] text-[#d4d4d4]">
            Powered by Orchestrator
          </p>
        </footer>
      </main>
    </div>
  );
}
