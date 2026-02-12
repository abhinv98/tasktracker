"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui";
import {
  MessageSquare,
  Search,
  Send,
  Check,
  CheckCheck,
  User,
} from "lucide-react";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateSeparator(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const user = useQuery(api.users.getCurrentUser);
  const contacts = useQuery(api.dm.getContacts);
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [selectedContactId, setSelectedContactId] = useState<Id<"users"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // URL param support: /messages?to=userId&msg=prefilledText
  useEffect(() => {
    const toParam = searchParams.get("to");
    const msgParam = searchParams.get("msg");
    if (toParam) {
      setSelectedContactId(toParam as Id<"users">);
    }
    if (msgParam) {
      setMessageText(msgParam);
    }
  }, [searchParams]);

  const conversation = useQuery(
    api.dm.getConversation,
    selectedContactId ? { otherUserId: selectedContactId } : "skip"
  );

  const sendMessage = useMutation(api.dm.sendMessage);
  const markRead = useMutation(api.dm.markConversationRead);

  // Auto-mark read when opening a conversation
  useEffect(() => {
    if (selectedContactId) {
      markRead({ otherUserId: selectedContactId });
    }
  }, [selectedContactId, markRead, conversation]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const selectedContact = contacts?.find((c) => c._id === selectedContactId);

  async function handleSend() {
    if (!messageText.trim() || !selectedContactId) return;
    try {
      await sendMessage({ recipientId: selectedContactId, content: messageText });
      setMessageText("");
      inputRef.current?.focus();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to send");
    }
  }

  // Group messages by date
  const groupedMessages = useMemo(() => {
    if (!conversation) return [];
    const groups: Array<{ date: string; messages: typeof conversation }> = [];
    let currentDate = "";
    for (const msg of conversation) {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: formatDateSeparator(msg.createdAt), messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [conversation]);

  if (!user) return null;

  return (
    <div className="flex h-full bg-[var(--bg-primary)]">
      {/* LEFT PANEL — Contact List */}
      <div className="w-80 shrink-0 flex flex-col border-r border-[var(--border)] bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-[var(--accent-admin)]" />
            <h1 className="font-semibold text-[14px] text-[var(--text-primary)]">Messages</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people..."
              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
            />
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <p className="px-4 py-8 text-[11px] text-[var(--text-disabled)] text-center">No contacts found</p>
          ) : (
            filteredContacts.map((contact) => {
              const isActive = selectedContactId === contact._id;
              const hasUnread = contact.unreadCount > 0;
              return (
                <button
                  key={contact._id}
                  onClick={() => setSelectedContactId(contact._id as Id<"users">)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-[var(--border-subtle)] ${
                    isActive
                      ? "bg-[var(--accent-admin-dim)] border-l-[3px] border-l-[var(--accent-admin)]"
                      : hasUnread
                        ? "bg-[#fef9f7] hover:bg-[var(--bg-hover)] border-l-[3px] border-l-transparent"
                        : "hover:bg-[var(--bg-hover)] border-l-[3px] border-l-transparent"
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${
                    hasUnread
                      ? "bg-[var(--accent-admin)] text-white"
                      : "bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  }`}>
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[12px] truncate ${hasUnread ? "font-bold text-[var(--text-primary)]" : "font-medium text-[var(--text-primary)]"}`}>
                        {contact.name}
                      </span>
                      {contact.lastMessageTime && (
                        <span className="text-[9px] text-[var(--text-muted)] shrink-0 tabular-nums">
                          {formatTime(contact.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className={`text-[10px] truncate ${hasUnread ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"}`}>
                        {contact.lastMessage
                          ? contact.lastMessage.length > 40
                            ? contact.lastMessage.slice(0, 40) + "..."
                            : contact.lastMessage
                          : `${contact.role}`}
                      </span>
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--accent-admin)] text-white text-[9px] font-bold px-1 shrink-0">
                          {contact.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-[var(--border)] bg-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[11px] font-bold text-[var(--text-secondary)]">
                {selectedContact.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{selectedContact.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] capitalize">{selectedContact.role}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {groupedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mb-3">
                    <MessageSquare className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-[13px] font-medium text-[var(--text-secondary)]">No messages yet</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Send a message to start the conversation</p>
                </div>
              ) : (
                groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 border-t border-[var(--border-subtle)]" />
                      <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-primary)] px-2">{group.date}</span>
                      <div className="flex-1 border-t border-[var(--border-subtle)]" />
                    </div>

                    {group.messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`flex mb-2 ${msg.isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[70%] ${msg.isMine ? "order-1" : ""}`}>
                          <div
                            className={`px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${
                              msg.isMine
                                ? "bg-[var(--accent-admin)] text-white rounded-br-md"
                                : "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-bl-md"
                            }`}
                          >
                            {msg.content}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${msg.isMine ? "justify-end" : "justify-start"}`}>
                            <span className="text-[9px] text-[var(--text-disabled)] tabular-nums">{formatTime(msg.createdAt)}</span>
                            {msg.isMine && (
                              msg.readAt ? (
                                <CheckCheck className="h-3 w-3 text-[var(--accent-employee)]" />
                              ) : (
                                <Check className="h-3 w-3 text-[var(--text-disabled)]" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-[var(--border)] bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Message ${selectedContact.name}...`}
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] resize-none"
                  rows={1}
                  style={{ maxHeight: 120 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim()}
                  className="p-2.5 rounded-lg bg-[var(--accent-admin)] text-white hover:bg-[#c4684d] disabled:opacity-30 transition-colors shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mb-4">
              <MessageSquare className="h-7 w-7 text-[var(--text-muted)]" />
            </div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">Your Messages</h2>
            <p className="text-[12px] text-[var(--text-muted)] max-w-[280px]">
              Select a contact from the left to start a conversation. Messages are private between you and the recipient.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
