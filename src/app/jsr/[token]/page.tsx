"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, Clock, Send, Plus, Calendar, ChevronDown, ChevronUp } from "lucide-react";

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
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      // silently handle
    }
    setSubmitting(false);
  }

  const progressPct = jsr.internalSummary.total > 0
    ? Math.round((jsr.internalSummary.done / jsr.internalSummary.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="border-b border-[#e5e5e5] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: jsr.brand.color + "20" }}
            >
              <span className="font-bold text-[16px]" style={{ color: jsr.brand.color }}>
                {jsr.brand.name[0]}
              </span>
            </div>
            <div>
              <h1 className="font-semibold text-[18px] text-[#171717]">
                {jsr.brand.name}
              </h1>
              <p className="text-[13px] text-[#737373]">Job Status Report</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Success Toast */}
        {submitted && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] text-[13px] font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Task submitted successfully. The team will review it shortly.
          </div>
        )}

        {/* Section 1: Current Work (Internal Tasks) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[16px] text-[#171717]">
              Current Work
            </h2>
            {jsr.internalSummary.cumulativeDeadline && (
              <div className="flex items-center gap-1.5 text-[12px] text-[#737373]">
                <Calendar className="h-3.5 w-3.5" />
                <span>Target: {formatDate(jsr.internalSummary.cumulativeDeadline)}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
            {/* Progress */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-[#525252] font-medium">Overall Progress</span>
                <span className="text-[13px] text-[#171717] font-semibold tabular-nums">{progressPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#f5f5f5] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
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
                { label: "Review", value: jsr.internalSummary.review, color: "#8b5cf6" },
                { label: "Done", value: jsr.internalSummary.done, color: "#10b981" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="text-center py-3 px-2 rounded-xl"
                  style={{ backgroundColor: stat.color + "08" }}
                >
                  <p className="font-bold text-[22px] tabular-nums" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-[#737373] font-medium mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {jsr.internalSummary.total === 0 && (
              <p className="text-[13px] text-[#a3a3a3] text-center mt-4">
                No tasks have been assigned yet.
              </p>
            )}
          </div>
        </section>

        {/* Section 2: Client Requests */}
        <section>
          <button
            onClick={() => setRequestsExpanded(!requestsExpanded)}
            className="flex items-center justify-between w-full mb-4"
          >
            <h2 className="font-semibold text-[16px] text-[#171717]">
              Your Requests
              {jsr.clientTasks.length > 0 && (
                <span className="ml-2 text-[12px] font-normal text-[#a3a3a3]">
                  ({jsr.clientTasks.length})
                </span>
              )}
            </h2>
            {requestsExpanded ? (
              <ChevronUp className="h-4 w-4 text-[#a3a3a3]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />
            )}
          </button>

          {requestsExpanded && (
            <div className="space-y-3">
              {jsr.clientTasks.map((task) => {
                const statusInfo = CLIENT_STATUS_LABELS[task.status];
                return (
                  <div
                    key={task._id}
                    className="bg-white rounded-2xl border border-[#e5e5e5] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[14px] text-[#171717]">{task.title}</p>
                        {task.description && (
                          <p className="text-[13px] text-[#737373] mt-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-[12px] text-[#a3a3a3]">
                          {task.proposedDeadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Proposed: {formatDate(task.proposedDeadline)}
                            </span>
                          )}
                          {task.finalDeadline && (
                            <span className="flex items-center gap-1 text-[#171717] font-medium">
                              <Calendar className="h-3 w-3" />
                              Deadline: {formatDate(task.finalDeadline)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full"
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

              {jsr.clientTasks.length === 0 && !showAddForm && (
                <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6 text-center">
                  <p className="text-[13px] text-[#a3a3a3] mb-3">No requests submitted yet.</p>
                </div>
              )}

              {/* Add Task Form */}
              {showAddForm ? (
                <div className="bg-white rounded-2xl border border-[#e5e5e5] p-5">
                  <h3 className="font-medium text-[14px] text-[#171717] mb-4">New Request</h3>
                  <form onSubmit={handleSubmit} className="space-y-3">
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
                    <div>
                      <label className="text-[12px] font-medium text-[#525252] block mb-1">Proposed Deadline (optional)</label>
                      <input
                        type="date"
                        value={proposedDeadline}
                        onChange={(e) => setProposedDeadline(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717]/20 transition-all bg-[#fafafa]"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={submitting || !title.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#171717] text-white text-[13px] font-medium hover:bg-[#404040] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submitting ? "Submitting..." : "Submit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddForm(false)}
                        className="px-4 py-2 rounded-xl text-[13px] font-medium text-[#737373] hover:bg-[#f5f5f5] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-[#e5e5e5] text-[13px] font-medium text-[#737373] hover:border-[#d4d4d4] hover:text-[#525252] hover:bg-white transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Add a Request
                </button>
              )}
            </div>
          )}
        </section>

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
