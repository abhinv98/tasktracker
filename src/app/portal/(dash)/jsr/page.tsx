"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  Tag,
} from "lucide-react";
import { PortalCard, formatDate, monthLabel, timeAgo } from "@/components/portal/shared";
import { DeliverableCard, RemarkComposer, RemarkThread } from "@/components/portal/DeliverableCard";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: "Awaiting Review", color: "#b45309", bg: "#fffbeb" },
  accepted: { label: "Accepted", color: "#0f766e", bg: "#f0fdfa" },
  in_progress: { label: "In Progress", color: "#1d4ed8", bg: "#eff6ff" },
  in_review: { label: "In Review", color: "#7c3aed", bg: "#f5f3ff" },
  completed: { label: "Completed", color: "#047857", bg: "#ecfdf5" },
  declined: { label: "Declined", color: "#b91c1c", bg: "#fef2f2" },
};

export default function PortalJsrPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const dashboard = useQuery(api.clientPortal.getPortalDashboard);
  const sendMessage = useMutation(api.clientPortal.sendPortalMessage);
  const addTaskRemark = useMutation(api.clientPortal.addTaskRemark);

  const [monthFilter, setMonthFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [msgContent, setMsgContent] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  const rows = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.rows.filter((r: any) => {
      if (monthFilter && r.monthKey !== monthFilter) return false;
      if (tagFilter && r.tag !== tagFilter) return false;
      return true;
    });
  }, [dashboard, monthFilter, tagFilter]);

  if (!session || dashboard === undefined) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }
  if (!dashboard) return null;

  const bc = session.brand.color;

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
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <LayoutDashboard className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">JSR Track</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">
        Every task you have requested, with its live status. Use the filters to view by month or category.
      </p>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Requests", value: dashboard.summary.total, color: "#171717" },
          { label: "Awaiting Review", value: dashboard.summary.pendingReview, color: "#b45309" },
          { label: "In Progress", value: dashboard.summary.inProgress, color: bc },
          { label: "Completed", value: dashboard.summary.completed, color: "#047857" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#e5e5e5] p-4">
            <p className="text-[11px] font-medium text-[#737373]">{stat.label}</p>
            <p className="text-[24px] font-bold tabular-nums mt-0.5" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-[12px] text-[#525252] focus:outline-none"
        >
          <option value="">All months</option>
          {dashboard.months.map((m: string) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        {dashboard.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTagFilter("")}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                tagFilter === "" ? "text-white border-transparent" : "text-[#525252] border-[#e5e5e5] bg-white"
              }`}
              style={tagFilter === "" ? { backgroundColor: bc } : {}}
            >
              All categories
            </button>
            {dashboard.tags.map((t: string) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? "" : t)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  tagFilter === t ? "text-white border-transparent" : "text-[#525252] border-[#e5e5e5] bg-white"
                }`}
                style={tagFilter === t ? { backgroundColor: bc } : {}}
              >
                <Tag className="h-3 w-3" />
                {t}
              </button>
            ))}
          </div>
        )}
        <span className="text-[11px] text-[#a3a3a3] ml-auto">
          {rows.length} task{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Sheet-style table */}
      <PortalCard>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[13px] text-[#737373]">
              {dashboard.rows.length === 0
                ? "No task requests yet."
                : "Nothing matches the current filters."}
            </p>
            {dashboard.rows.length === 0 && (
              <Link
                href="/portal/new-task"
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-white text-[13px] font-semibold"
                style={{ backgroundColor: bc }}
              >
                <Plus className="h-4 w-4" /> Request your first task
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[#f0f0f0] bg-[#fafafa]">
                  {["Task", "Category", "Status", "Requested by", "Submitted", "Delivery date", ""].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[#a3a3a3] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const meta = STATUS_META[r.displayStatus] ?? STATUS_META.pending_review;
                  const open = expandedRow === r._id;
                  const threadCount = r.remarks.length + r.deliverables.length;
                  return (
                    <RowGroup
                      key={r._id}
                      row={r}
                      meta={meta}
                      open={open}
                      threadCount={threadCount}
                      brandColor={bc}
                      onToggle={() => setExpandedRow(open ? null : r._id)}
                      addTaskRemark={addTaskRemark}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PortalCard>

      {/* Messages */}
      <PortalCard>
        <button
          onClick={() => setMessagesOpen(!messagesOpen)}
          className="flex items-center justify-between w-full px-6 py-4 hover:bg-[#fafafa] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bc + "12" }}>
              <MessageCircle className="h-3.5 w-3.5" style={{ color: bc }} />
            </div>
            <h2 className="font-semibold text-[15px] text-[#171717]">Messages</h2>
            {(dashboard.messages ?? []).length > 0 && (
              <span className="text-[12px] text-[#a3a3a3] ml-1">({dashboard.messages.length})</span>
            )}
          </div>
          {messagesOpen ? <ChevronUp className="h-4 w-4 text-[#a3a3a3]" /> : <ChevronDown className="h-4 w-4 text-[#a3a3a3]" />}
        </button>
        {messagesOpen && (
          <div className="border-t border-[#f0f0f0]">
            <div className="px-6 py-4 max-h-[360px] overflow-y-auto space-y-3">
              {(dashboard.messages ?? []).length === 0 && (
                <p className="text-[13px] text-[#a3a3a3] text-center py-4">
                  No messages yet. Say hello to the team.
                </p>
              )}
              {(dashboard.messages ?? []).map((msg: any) => (
                <div key={msg._id} className={`flex ${msg.senderType === "client" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      msg.senderType === "client" ? "rounded-br-md text-white" : "rounded-bl-md bg-[#f0f0f0] text-[#171717]"
                    }`}
                    style={msg.senderType === "client" ? { backgroundColor: bc } : {}}
                  >
                    <p className={`text-[10px] font-semibold mb-0.5 ${msg.senderType === "client" ? "text-white/70" : "text-[#737373]"}`}>
                      {msg.senderName || (msg.senderType === "client" ? "You" : "Team")}
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
                placeholder="Type a message for the team"
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

function RowGroup({
  row,
  meta,
  open,
  threadCount,
  brandColor,
  onToggle,
  addTaskRemark,
}: {
  row: any;
  meta: { label: string; color: string; bg: string };
  open: boolean;
  threadCount: number;
  brandColor: string;
  onToggle: () => void;
  addTaskRemark: (args: { taskId: Id<"tasks">; content: string }) => Promise<unknown>;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors cursor-pointer"
      >
        <td className="px-4 py-3 max-w-[280px]">
          <p className="text-[13px] font-medium text-[#171717] leading-snug">{row.title}</p>
          {row.description && (
            <p className="text-[11px] text-[#a3a3a3] truncate mt-0.5">{row.description}</p>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {row.tag ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ color: brandColor, backgroundColor: brandColor + "10" }}
            >
              <Tag className="h-3 w-3" />
              {row.tag}
            </span>
          ) : (
            <span className="text-[11px] text-[#d4d4d4]">-</span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ color: meta.color, backgroundColor: meta.bg }}
          >
            {meta.label}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#525252]">
          {row.clientName ?? "-"}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-[11px] text-[#737373] tabular-nums">
          {formatDate(row.createdAt)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-[11px] text-[#737373] tabular-nums">
          {row.finalDeadline ? formatDate(row.finalDeadline) : "-"}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: brandColor }}
          >
            {threadCount > 0 && <Paperclip className="h-3 w-3" />}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[#f0f0f0] bg-[#fafafa]/60">
          <td colSpan={7} className="px-6 py-4">
            {row.description && (
              <p className="text-[12px] text-[#525252] leading-relaxed mb-3 max-w-2xl">{row.description}</p>
            )}
            {row.proposedDeadline && (
              <p className="text-[11px] text-[#a3a3a3] mb-3 inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> You requested this for {formatDate(row.proposedDeadline)}
              </p>
            )}
            {row.deliverables.length > 0 && (
              <div className="mb-3 -ml-7">
                {row.deliverables.map((del: any) => (
                  <DeliverableCard key={del._id} deliverable={del} brandColor={brandColor} />
                ))}
              </div>
            )}
            {row.taskId ? (
              <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden max-w-2xl">
                {row.remarks.length > 0 && (
                  <div className="px-4 py-2 border-b border-[#f0f0f0]">
                    <RemarkThread remarks={row.remarks} brandColor={brandColor} />
                  </div>
                )}
                <div className="px-4 py-2">
                  <RemarkComposer
                    brandColor={brandColor}
                    placeholder="Write a comment on this task"
                    onSubmit={async (content) => {
                      await addTaskRemark({ taskId: row.taskId as Id<"tasks">, content });
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[#a3a3a3]">
                You can comment here once the team accepts this request.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
