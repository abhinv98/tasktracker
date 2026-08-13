"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { MessageCircle, Send } from "lucide-react";
import { PortalCard } from "@/components/portal/shared";
import { PortalSkeleton } from "@/components/portal/ui";

type Message = {
  _id: string;
  senderType: "client" | "manager";
  senderName?: string;
  content: string;
  createdAt: number;
};

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Slack-style grouping: day dividers, and consecutive messages from the
 *  same sender within 5 minutes collapse under one name/avatar. */
function groupMessages(messages: Message[]) {
  const days: { label: string; groups: { first: Message; rest: Message[] }[] }[] = [];
  for (const msg of messages) {
    const label = dayLabel(msg.createdAt);
    let day = days[days.length - 1];
    if (!day || day.label !== label) {
      day = { label, groups: [] };
      days.push(day);
    }
    const lastGroup = day.groups[day.groups.length - 1];
    const lastMsg = lastGroup ? (lastGroup.rest[lastGroup.rest.length - 1] ?? lastGroup.first) : null;
    if (
      lastGroup &&
      lastMsg &&
      lastGroup.first.senderType === msg.senderType &&
      (lastGroup.first.senderName ?? "") === (msg.senderName ?? "") &&
      msg.createdAt - lastMsg.createdAt < 5 * 60 * 1000
    ) {
      lastGroup.rest.push(msg);
    } else {
      day.groups.push({ first: msg, rest: [] });
    }
  }
  return days;
}

export default function PortalMessagesPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const messages = useQuery(api.clientPortal.getPortalMessages);
  const sendMessage = useMutation(api.clientPortal.sendPortalMessage);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  if (!session || messages === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <div className="p-shimmer h-6 w-40" />
        <PortalSkeleton rows={4} />
      </div>
    );
  }

  const bc = session.brand.color;
  const days = groupMessages(messages as Message[]);

  async function handleSend() {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({ content: content.trim() });
      setContent("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch {}
    setSending(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      <h1 className="p-title mb-1">Messages</h1>
      <p className="p-secondary mb-4">
        A direct line to your Ecultify team. They see your messages right away.
      </p>

      <PortalCard className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {days.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-[var(--p-radius-md)] flex items-center justify-center mb-3 bg-[var(--p-surface-2)]">
                <MessageCircle className="h-6 w-6 text-[var(--p-text-3)]" />
              </div>
              <p className="p-body text-[var(--p-text-2)]">No messages yet.</p>
              <p className="p-secondary text-[var(--p-text-3)] mt-0.5">Say hello to the team to get started.</p>
            </div>
          )}
          {days.map((day) => (
            <div key={day.label}>
              {/* Day divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[var(--p-border)]" />
                <span className="text-[11px] font-semibold text-[var(--p-text-2)] bg-[var(--p-surface)] border border-[var(--p-border)] rounded-full px-3 py-1">
                  {day.label}
                </span>
                <div className="flex-1 h-px bg-[var(--p-border)]" />
              </div>
              {/* Message groups */}
              {day.groups.map((group) => {
                const isClient = group.first.senderType === "client";
                const name = group.first.senderName || (isClient ? "You" : "Ecultify Team");
                return (
                  <div
                    key={group.first._id}
                    className="flex gap-3 px-1 py-1.5 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)]"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5 text-white ${
                        isClient ? "" : "bg-[var(--p-text)]"
                      }`}
                      style={isClient ? { backgroundColor: bc } : {}}
                    >
                      {name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-bold text-[var(--p-text)]">{name}</span>
                        <span className="text-[11px] text-[var(--p-text-3)]">{timeLabel(group.first.createdAt)}</span>
                      </div>
                      <p className="p-body break-words whitespace-pre-wrap">{group.first.content}</p>
                      {group.rest.map((m) => (
                        <p key={m._id} className="p-body break-words whitespace-pre-wrap mt-1">
                          {m.content}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--p-border)] px-4 py-3">
          <div
            className="flex items-end gap-2 rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-2 focus-within:border-[var(--p-brand)] focus-within:bg-[var(--p-surface)]"
            style={{ transition: "border-color 150ms ease-out, background-color 150ms ease-out" }}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder={`Message the ${session.brand.name} team`}
              className="flex-1 resize-none text-[13.5px] text-[var(--p-text)] placeholder-[var(--p-text-3)] focus:outline-none bg-transparent leading-relaxed max-h-[120px]"
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || !content.trim()}
              className="shrink-0 w-8 h-8 rounded-[var(--p-radius-sm)] flex items-center justify-center text-white disabled:opacity-40 hover:opacity-90"
              style={{ backgroundColor: bc }}
              title="Send (Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-[var(--p-text-3)] mt-1.5 px-1">
            Enter to send, Shift+Enter for a new line
          </p>
        </div>
      </PortalCard>
    </div>
  );
}
