"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { MessageCircle, Send } from "lucide-react";
import { PortalCard, timeAgo } from "@/components/portal/shared";

export default function PortalMessagesPage() {
  const session = useQuery(api.clientPortal.getPortalSession);
  const messages = useQuery(api.clientPortal.getPortalMessages);
  const sendMessage = useMutation(api.clientPortal.sendPortalMessage);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  if (!session || messages === undefined) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
      </div>
    );
  }

  const bc = session.brand.color;

  async function handleSend() {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({ content: content.trim() });
      setContent("");
    } catch {}
    setSending(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <MessageCircle className="h-5 w-5" style={{ color: bc }} />
        <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">Messages</h1>
      </div>
      <p className="text-[13px] text-[#737373] -mt-2">
        A direct line to your Ecultify team. They see your messages right away.
      </p>

      <PortalCard>
        <div className="px-5 py-4 h-[55vh] min-h-[320px] overflow-y-auto space-y-3">
          {messages.length === 0 && (
            <p className="text-[13px] text-[#a3a3a3] text-center py-10">
              No messages yet. Say hello to the team.
            </p>
          )}
          {messages.map((msg: any) => (
            <div key={msg._id} className={`flex ${msg.senderType === "client" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                  msg.senderType === "client" ? "rounded-br-md text-white" : "rounded-bl-md bg-[#f0f0f0] text-[#171717]"
                }`}
                style={msg.senderType === "client" ? { backgroundColor: bc } : {}}
              >
                <p className={`text-[10px] font-semibold mb-0.5 ${msg.senderType === "client" ? "text-white/70" : "text-[#737373]"}`}>
                  {msg.senderName || (msg.senderType === "client" ? "You" : "Team")}
                </p>
                <p className="text-[13px] leading-relaxed break-words">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${msg.senderType === "client" ? "text-white/50" : "text-[#a3a3a3]"}`}>
                  {timeAgo(msg.createdAt)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-[#f0f0f0] px-5 py-3 flex items-center gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a message for the team"
            className="flex-1 px-3 py-2 rounded-lg border border-[#e5e5e5] text-[13px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent bg-white"
            style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !content.trim()}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: bc }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </PortalCard>
    </div>
  );
}
