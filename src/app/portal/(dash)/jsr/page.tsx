"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import {
  TASK_STATUS,
  StatusIcon,
  MonthChips,
  PortalCard,
  formatDate,
  timeAgo,
} from "@/components/portal/shared";
import { DeliverableCard, RemarkComposer, RemarkThread } from "@/components/portal/DeliverableCard";

type JsrTask = {
  _id: string;
  title: string;
  status: string;
  deadline?: number;
  monthKey: string;
  remarks: { _id: string; senderType: "client" | "manager"; senderName?: string; content: string; createdAt: number }[];
  deliverables?: any[];
};

export default function PortalJsrPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const jsr = useQuery(api.clientPortal.getJsrTrack);
  const sendMessage = useMutation(api.clientPortal.sendPortalMessage);

  const [selectedMonth, setSelectedMonth] = useState("");
  const [msgContent, setMsgContent] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(false);

  const months = useMemo(() => {
    if (!jsr) return [];
    const keys = new Set<string>();
    for (const group of jsr.tasksByBrief as { tasks: JsrTask[] }[]) {
      for (const t of group.tasks) keys.add(t.monthKey);
    }
    return [...keys].sort();
  }, [jsr]);

  if (!session || jsr === undefined) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!jsr) return null;

  const bc = session.brand.color;
  const progressPct =
    jsr.internalSummary.total > 0
      ? Math.round((jsr.internalSummary.done / jsr.internalSummary.total) * 100)
      : 0;

  const filteredGroups = (jsr.tasksByBrief as { briefTitle: string; briefStatus: string; tasks: JsrTask[] }[])
    .map((g) => ({
      ...g,
      tasks: selectedMonth ? g.tasks.filter((t) => t.monthKey === selectedMonth) : g.tasks,
    }))
    .filter((g) => g.tasks.length > 0);

  async function handleSend() {
    if (!msgContent.trim() || sendingMsg) return;
    setSendingMsg(true);
    try {
      await sendMessage({ content: msgContent.trim() });
      setMsgContent("");
    } catch {}
    setSendingMsg(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <LayoutDashboard className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">JSR Track</h1>
      </div>

      {/* Progress overview */}
      <PortalCard>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-[16px] text-[#171717]">Project Overview</h2>
            {jsr.internalSummary.internalDeadline && (
              <div
                className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg"
                style={{ color: bc, backgroundColor: bc + "10" }}
              >
                <Calendar className="h-3 w-3" />
                {formatDate(jsr.internalSummary.internalDeadline)}
              </div>
            )}
          </div>
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
          <div className="w-full h-2 rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPct}%`, backgroundColor: bc }}
            />
          </div>
        </div>
      </PortalCard>

      {/* Month filter */}
      {months.length > 1 && (
        <MonthChips months={months} selected={selectedMonth} onSelect={setSelectedMonth} brandColor={bc} />
      )}

      {/* Tasks by brief */}
      {filteredGroups.length > 0 ? (
        <section className="space-y-3">
          {filteredGroups.map((group) => {
            const done = group.tasks.filter((t) => t.status === "done").length;
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
      ) : (
        <PortalCard className="p-8 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: bc + "10" }}>
            <Sparkles className="h-7 w-7" style={{ color: bc }} />
          </div>
          <h3 className="font-semibold text-[15px] text-[#171717] mb-1">
            {selectedMonth ? "Nothing this month" : "Getting Started"}
          </h3>
          <p className="text-[13px] text-[#737373] max-w-sm mx-auto">
            {selectedMonth
              ? "No tasks fall in the selected month. Try another month."
              : "The team is setting up your project. Tasks will appear here once work begins."}
          </p>
        </PortalCard>
      )}

      {/* Recent activity */}
      {(jsr.recentActivity ?? []).length > 0 && (
        <PortalCard>
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
              {jsr.recentActivity.map((a: any, i: number) => (
                <div key={i} className={`flex items-center gap-3 py-2.5 ${i < jsr.recentActivity.length - 1 ? "border-b border-[#f8f8f8]" : ""}`}>
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
        </PortalCard>
      )}

      {/* Messages */}
      <PortalCard>
        <button
          onClick={() => setMessagesExpanded(!messagesExpanded)}
          className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bc + "12" }}>
              <MessageCircle className="h-3.5 w-3.5" style={{ color: bc }} />
            </div>
            <h2 className="font-semibold text-[15px] text-[#171717]">Messages</h2>
            {(jsr.messages ?? []).length > 0 && (
              <span className="text-[12px] text-[#a3a3a3] ml-1">({jsr.messages.length})</span>
            )}
          </div>
          {messagesExpanded ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
        </button>
        {messagesExpanded && (
          <div className="border-t border-[#f0f0f0]">
            <div className="px-6 py-4 max-h-[400px] overflow-y-auto space-y-3">
              {(jsr.messages ?? []).length === 0 && (
                <p className="text-[13px] text-[#a3a3a3] text-center py-4">
                  No messages yet. Start a conversation with the team.
                </p>
              )}
              {(jsr.messages ?? []).map((msg: any) => (
                <div key={msg._id} className={`flex ${msg.senderType === "client" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      msg.senderType === "client" ? "rounded-br-md text-white" : "rounded-bl-md bg-[#f0f0f0] text-[#171717]"
                    }`}
                    style={msg.senderType === "client" ? { backgroundColor: bc } : {}}
                  >
                    <p className={`text-[10px] font-semibold mb-0.5 ${msg.senderType === "client" ? "text-white/70" : "text-[#737373]"}`}>
                      {msg.senderName || (msg.senderType === "client" ? "Client" : "Manager")}
                    </p>
                    <p className="text-[13px] leading-relaxed">{msg.content}</p>
                    <p className={`text-[9px] mt-1 ${msg.senderType === "client" ? "text-white/50" : "text-[#a3a3a3]"}`}>
                      {timeAgo(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#f0f0f0] px-6 py-3 flex items-center gap-2">
              <input
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 rounded-xl border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent bg-white"
                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
              />
              <button
                onClick={() => void handleSend()}
                disabled={sendingMsg || !msgContent.trim()}
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: bc }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </PortalCard>
    </div>
  );
}

function BriefGroup({
  title,
  tasks,
  done,
  total,
  pct,
  brandColor,
}: {
  title: string;
  tasks: JsrTask[];
  done: number;
  total: number;
  pct: number;
  brandColor: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const addTaskRemark = useMutation(api.clientPortal.addTaskRemark);

  return (
    <div className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: brandColor }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[14px] text-[#171717] truncate text-left">{title}</h3>
            <p className="text-[11px] text-[#a3a3a3] text-left">{done}/{total} complete</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#10b981" : brandColor }}
            />
          </div>
          <span className="text-[11px] font-semibold tabular-nums w-8 text-right" style={{ color: pct === 100 ? "#10b981" : "#525252" }}>
            {pct}%
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#f0f0f0]">
          {tasks.map((task, i) => {
            const info = TASK_STATUS[task.status] ?? { label: task.status, color: "#a3a3a3" };
            const hasDels = task.deliverables && task.deliverables.length > 0;
            const hasThread = task.remarks.length > 0;
            const open = expandedTasks[task._id];
            return (
              <div key={task._id} className={i < tasks.length - 1 ? "border-b border-[#f8f8f8]" : ""}>
                <div className={`flex items-center gap-3 px-6 py-2.5 ${task.status === "done" && !hasDels ? "opacity-50" : ""}`}>
                  <StatusIcon status={task.status} brandColor={brandColor} />
                  <p className={`flex-1 text-[13px] text-[#171717] ${task.status === "done" && !hasDels ? "line-through" : ""}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedTasks((prev) => ({ ...prev, [task._id]: !prev[task._id] }))}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors"
                      style={{ color: brandColor, backgroundColor: brandColor + "10" }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      {hasDels ? `${task.deliverables!.length} deliverable${task.deliverables!.length > 1 ? "s" : ""}` : hasThread ? task.remarks.length : "Comment"}
                      {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: info.color, backgroundColor: info.color + "12" }}>
                      {info.label}
                    </span>
                  </div>
                </div>
                {open && (
                  <div className="px-6 pb-3">
                    {hasDels &&
                      task.deliverables!.map((del: any) => (
                        <DeliverableCard key={del._id} deliverable={del} brandColor={brandColor} />
                      ))}
                    {/* Task-level comment thread */}
                    <div className="ml-7 mt-2 rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
                      {hasThread && (
                        <div className="px-4 py-2 border-b border-[#f0f0f0]">
                          <RemarkThread remarks={task.remarks} brandColor={brandColor} />
                        </div>
                      )}
                      <div className="px-4 py-2">
                        <RemarkComposer
                          brandColor={brandColor}
                          placeholder="Comment on this task..."
                          onSubmit={async (content) => {
                            await addTaskRemark({ taskId: task._id as Id<"tasks">, content });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
