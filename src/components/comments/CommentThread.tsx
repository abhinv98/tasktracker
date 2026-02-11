"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Send, Trash2, AtSign, User, CheckSquare } from "lucide-react";

interface MentionableTask {
  _id: string;
  title: string;
}

interface MentionableMember {
  _id: string;
  name?: string;
  email?: string;
}

interface CommentThreadProps {
  parentType: "brief" | "task";
  parentId: string;
  /** When provided, switches to unified mode (brief + all task comments merged) */
  briefId?: string;
  /** Tasks in the brief, for @mention autocomplete (unified mode only) */
  tasks?: MentionableTask[];
  /** Members assigned to the brief, for @mention autocomplete */
  members?: MentionableMember[];
}

const ROLE_COLORS: Record<string, string> = {
  admin: "var(--accent-admin)",
  manager: "var(--accent-manager)",
  employee: "var(--accent-employee)",
};

// Parse @[user:id:name] and @[task:id:title] tokens into React elements
function renderContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /@\[(user|task):([^:]+):([^\]]*)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before the mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const [, type, , displayName] = match;
    parts.push(
      <span
        key={match.index}
        className={`font-semibold ${
          type === "user"
            ? "text-[var(--accent-manager)]"
            : "text-[var(--accent-admin)]"
        }`}
      >
        @{displayName}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [content];
}

export function CommentThread({
  parentType,
  parentId,
  briefId,
  tasks,
  members,
}: CommentThreadProps) {
  const isUnifiedMode = !!briefId;

  // Queries — use unified query when briefId is provided, else single-parent query
  const unifiedComments = useQuery(
    api.comments.getCommentsForBrief,
    isUnifiedMode ? { briefId: briefId as Id<"briefs"> } : "skip"
  );
  const singleComments = useQuery(
    api.comments.getComments,
    !isUnifiedMode ? { parentType, parentId } : "skip"
  );
  const comments = isUnifiedMode ? unifiedComments : singleComments;

  const addComment = useMutation(api.comments.addComment);
  const deleteComment = useMutation(api.comments.deleteComment);
  const user = useQuery(api.users.getCurrentUser);

  const [text, setText] = useState("");
  const [postTarget, setPostTarget] = useState<{ type: "brief" | "task"; id: string; label: string }>({
    type: parentType,
    id: parentId,
    label: "Brief",
  });
  const [showTargetPicker, setShowTargetPicker] = useState(false);

  // @mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  // Build mention suggestions
  const mentionSuggestions = useMemo(() => {
    const items: { type: "user" | "task"; id: string; label: string }[] = [];
    if (members) {
      for (const m of members) {
        const name = m.name ?? m.email ?? "Unknown";
        items.push({ type: "user", id: m._id, label: name });
      }
    }
    if (tasks) {
      for (const t of tasks) {
        items.push({ type: "task", id: t._id, label: t.title });
      }
    }
    if (!mentionQuery) return items;
    const q = mentionQuery.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [members, tasks, mentionQuery]);

  // Post target options for unified mode
  const targetOptions = useMemo(() => {
    const opts: { type: "brief" | "task"; id: string; label: string }[] = [
      { type: "brief", id: parentId, label: "Brief" },
    ];
    if (tasks) {
      for (const t of tasks) {
        opts.push({ type: "task", id: t._id, label: t.title });
      }
    }
    return opts;
  }, [parentId, tasks]);

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

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
      if (targetRef.current && !targetRef.current.contains(e.target as Node)) {
        setShowTargetPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-resize textarea
  const handleTextareaResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, []);

  function insertMention(item: { type: "user" | "task"; id: string; label: string }) {
    if (mentionStartPos === null) return;
    const before = text.slice(0, mentionStartPos);
    const after = text.slice(textareaRef.current?.selectionStart ?? text.length);
    const token = `@[${item.type}:${item.id}:${item.label}] `;
    const newText = before + token + after;
    setText(newText);
    setShowMentions(false);
    setMentionQuery("");
    setMentionStartPos(null);
    // Focus textarea and set cursor after mention
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const cursorPos = before.length + token.length;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    setShowMentions(false);
    await addComment({
      parentType: postTarget.type,
      parentId: postTarget.id,
      content: text.trim(),
    });
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    handleTextareaResize();

    // Detect @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex >= 0 && (members?.length || tasks?.length)) {
      // Check there's no space between @ and cursor, and @ is at start or after a space
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      if (!/\s/.test(textAfterAt) && /[\s]/.test(charBeforeAt)) {
        setMentionStartPos(atIndex);
        setMentionQuery(textAfterAt);
        setShowMentions(true);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentions(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Handle mention dropdown navigation
    if (showMentions && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

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
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      ` ${time}`
    );
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

          // Task context label (unified mode only)
          const taskName = "taskName" in c ? (c as { taskName?: string | null }).taskName : null;

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
              <div
                className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}
              >
                {showAvatar && (
                  <div
                    className={`flex items-center gap-1.5 mb-0.5 ${isMe ? "justify-end" : ""}`}
                  >
                    <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                      {isMe ? "You" : c.authorName}
                    </span>
                    {taskName && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] font-medium">
                        on: {taskName}
                      </span>
                    )}
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
                  <span className="whitespace-pre-wrap break-words">
                    {renderContent(c.content)}
                  </span>

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
      <div className="relative">
        {/* Post target selector (unified mode) */}
        {isUnifiedMode && (
          <div className="relative mb-1.5" ref={targetRef}>
            <button
              type="button"
              onClick={() => setShowTargetPicker(!showTargetPicker)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
            >
              Posting to: <span className="text-[var(--text-primary)]">{postTarget.label}</span>
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showTargetPicker && (
              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-white border border-[var(--border)] rounded-lg shadow-lg z-20 py-1">
                {targetOptions.map((opt) => (
                  <button
                    key={`${opt.type}-${opt.id}`}
                    onClick={() => {
                      setPostTarget(opt);
                      setShowTargetPicker(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2 ${
                      postTarget.id === opt.id ? "bg-[var(--bg-hover)] font-medium" : ""
                    }`}
                  >
                    {opt.type === "brief" ? (
                      <span className="text-[var(--accent-admin)]">Brief</span>
                    ) : (
                      <CheckSquare className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span className="truncate text-[var(--text-primary)]">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* @mention autocomplete dropdown */}
        {showMentions && mentionSuggestions.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-white border border-[var(--border)] rounded-lg shadow-lg z-20 py-1"
          >
            {mentionSuggestions.map((item, idx) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => insertMention(item)}
                className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2 ${
                  idx === mentionIndex ? "bg-[var(--bg-hover)]" : ""
                }`}
              >
                {item.type === "user" ? (
                  <User className="h-3 w-3 text-[var(--accent-manager)] shrink-0" />
                ) : (
                  <CheckSquare className="h-3 w-3 text-[var(--accent-admin)] shrink-0" />
                )}
                <span className="truncate text-[var(--text-primary)]">
                  {item.label}
                </span>
                <span className="ml-auto text-[9px] text-[var(--text-muted)]">
                  {item.type === "user" ? "Person" : "Task"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* @ button */}
          {(members?.length || tasks?.length) ? (
            <button
              type="button"
              onClick={() => {
                const ta = textareaRef.current;
                if (ta) {
                  const cursorPos = ta.selectionStart;
                  const before = text.slice(0, cursorPos);
                  const after = text.slice(cursorPos);
                  const needsSpace = before.length > 0 && before[before.length - 1] !== " ";
                  const newText = before + (needsSpace ? " @" : "@") + after;
                  setText(newText);
                  setMentionStartPos(before.length + (needsSpace ? 1 : 0));
                  setMentionQuery("");
                  setShowMentions(true);
                  setMentionIndex(0);
                  setTimeout(() => {
                    ta.focus();
                    const pos = before.length + (needsSpace ? 2 : 1);
                    ta.setSelectionRange(pos, pos);
                  }, 0);
                }
              }}
              className="shrink-0 p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
              title="Mention a person or task"
            >
              <AtSign className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
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
    </div>
  );
}
