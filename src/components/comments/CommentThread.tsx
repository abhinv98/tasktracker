"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Send, Trash2 } from "lucide-react";

interface CommentThreadProps {
  parentType: "brief" | "task";
  parentId: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "var(--accent-admin)",
  manager: "var(--accent-manager)",
  employee: "var(--accent-employee)",
};

export function CommentThread({ parentType, parentId }: CommentThreadProps) {
  const comments = useQuery(api.comments.getComments, {
    parentType,
    parentId,
  });
  const addComment = useMutation(api.comments.addComment);
  const deleteComment = useMutation(api.comments.deleteComment);
  const user = useQuery(api.users.getCurrentUser);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (comments && comments.length > prevLengthRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: prevLengthRef.current === 0 ? "instant" : "smooth",
      });
    }
    prevLengthRef.current = comments?.length ?? 0;
  }, [comments?.length]);

  // Auto-resize textarea
  const handleTextareaResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, []);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    await addComment({ parentType, parentId, content: text.trim() });
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }) + ` ${time}`;
  }

  return (
    <div className="flex flex-col">
      <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide mb-2">
        Discussion ({comments?.length ?? 0})
      </h4>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-0.5 max-h-[400px] overflow-y-auto mb-3 scroll-smooth"
      >
        {comments?.map((c, i) => {
          const isMe = c.userId === user?._id;
          const roleColor = ROLE_COLORS[c.authorRole] ?? "var(--text-muted)";

          // Show avatar only if different author than previous message
          const prevMsg = i > 0 ? comments[i - 1] : null;
          const showAvatar = !prevMsg || prevMsg.userId !== c.userId;

          return (
            <div
              key={c._id}
              className={`flex gap-2 group ${isMe ? "flex-row-reverse" : ""} ${showAvatar ? "mt-3" : "mt-0.5"}`}
            >
              {/* Avatar */}
              <div className="shrink-0 w-6">
                {showAvatar && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: roleColor }}
                  >
                    {c.authorName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Message bubble */}
              <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                {showAvatar && (
                  <div
                    className={`flex items-center gap-1.5 mb-0.5 ${isMe ? "justify-end" : ""}`}
                  >
                    <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                      {isMe ? "You" : c.authorName}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {formatTime(c.createdAt)}
                    </span>
                  </div>
                )}
                <div
                  className={`relative px-3 py-1.5 rounded-xl text-[12px] leading-relaxed ${
                    isMe
                      ? "bg-[var(--accent-admin)] text-white rounded-tr-sm"
                      : "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-tl-sm"
                  }`}
                >
                  <span className="whitespace-pre-wrap break-words">{c.content}</span>

                  {/* Delete button */}
                  {(c.userId === user?._id || user?.role === "admin") && (
                    <button
                      onClick={() => deleteComment({ commentId: c._id })}
                      className={`absolute -top-1 ${isMe ? "-left-5" : "-right-5"} opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] transition-all`}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {comments?.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-[12px] text-[var(--text-muted)]">
              No messages yet. Start the conversation!
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTextareaResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send)"
          rows={1}
          className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-white text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] resize-none overflow-hidden"
          style={{ minHeight: "36px" }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="shrink-0 p-2 rounded-xl bg-[var(--accent-admin)] text-white disabled:opacity-30 hover:bg-[#c4684d] transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
