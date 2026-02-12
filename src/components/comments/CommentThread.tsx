"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Send, Trash2, AtSign, User, CheckSquare, Pin, SmilePlus, ChevronDown, Paperclip, FileText, Image as ImageIcon, X } from "lucide-react";

const EMOJI_PRESETS = [
  { emoji: "👍", label: "thumbsup" },
  { emoji: "✅", label: "check" },
  { emoji: "👀", label: "eyes" },
  { emoji: "❤️", label: "heart" },
  { emoji: "🔥", label: "fire" },
];
const EMOJI_MAP: Record<string, string> = { thumbsup: "👍", check: "✅", eyes: "👀", heart: "❤️", fire: "🔥" };

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
  /** When true, the thread fills the full available height (for standalone discussions page) */
  fullPage?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "var(--accent-admin)",
  manager: "var(--accent-manager)",
  employee: "var(--accent-employee)",
};

// Parse @[user:id:name] and @[task:id:title] tokens into React elements
function renderContent(content: string, isOwnMessage?: boolean): React.ReactNode[] {
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

    if (isOwnMessage) {
      // High contrast on colored bubble: white with underline
      parts.push(
        <span
          key={match.index}
          className="font-bold underline decoration-white/50 text-white"
        >
          @{displayName}
        </span>
      );
    } else {
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
    }
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
  fullPage,
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
  const pinComment = useMutation(api.comments.pinComment);
  const unpinComment = useMutation(api.comments.unpinComment);
  const toggleReaction = useMutation(api.comments.toggleReaction);
  const setTypingMut = useMutation(api.comments.setTyping);
  const user = useQuery(api.users.getCurrentUser);

  // Reactions for all visible comments
  const commentIds = useMemo(() => (comments ?? []).map((c) => c._id), [comments]);
  const reactions = useQuery(
    api.comments.getReactionsForComments,
    commentIds.length > 0 ? { commentIds: commentIds as Id<"comments">[] } : "skip"
  );

  // Typing indicators
  const typingUsers = useQuery(
    api.comments.getTypingUsers,
    isUnifiedMode && briefId ? { briefId: briefId as Id<"briefs"> } : "skip"
  );
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);

  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showPinnedSection, setShowPinnedSection] = useState(true);
  const [pendingFile, setPendingFile] = useState<{ file: File; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pinnedComments = useMemo(
    () => (comments ?? []).filter((c) => (c as { pinned?: boolean }).pinned),
    [comments]
  );

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
    if (!text.trim() && !pendingFile) return;
    setShowMentions(false);

    try {
      let attachmentId: string | undefined;
      let attachmentName: string | undefined;

      if (pendingFile) {
        setUploading(true);
        const uploadUrl = await generateUploadUrl();
        const resp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": pendingFile.file.type },
          body: pendingFile.file,
        });
        const { storageId } = await resp.json();
        attachmentId = storageId;
        attachmentName = pendingFile.name;
      }

      await addComment({
        parentType: postTarget.type,
        parentId: postTarget.id,
        content: text.trim() || (attachmentName ? `📎 ${attachmentName}` : ""),
        ...(attachmentId ? { attachmentId: attachmentId as Id<"_storage"> } : {}),
        ...(attachmentName ? { attachmentName } : {}),
      });
      setText("");
      setPendingFile(null);
      setUploading(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      setUploading(false);
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    handleTextareaResize();

    // Fire typing indicator (debounced)
    if (isUnifiedMode && briefId) {
      if (!typingTimerRef.current) {
        setTypingMut({ briefId: briefId as Id<"briefs"> });
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 2000);
    }

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
    <div className={`flex flex-col ${fullPage ? "h-full" : ""}`}>
      {!fullPage && (
        <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide mb-2">
          Discussion ({comments?.length ?? 0})
        </h4>
      )}

      {/* Pinned messages section */}
      {pinnedComments.length > 0 && (
        <div className="mb-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          <button
            onClick={() => setShowPinnedSection(!showPinnedSection)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide hover:bg-[var(--bg-hover)] rounded-t-lg transition-colors"
          >
            <Pin className="h-3 w-3 text-[var(--accent-admin)]" />
            Pinned ({pinnedComments.length})
            <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showPinnedSection ? "" : "-rotate-90"}`} />
          </button>
          {showPinnedSection && (
            <div className="px-3 pb-2 space-y-1">
              {pinnedComments.map((c) => (
                <div key={`pin-${c._id}`} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white border border-[var(--border-subtle)]">
                  <Pin className="h-3 w-3 text-[var(--accent-admin)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold text-[var(--text-primary)]">{c.authorName}: </span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{c.content.slice(0, 120)}{c.content.length > 120 ? "..." : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        className={`flex flex-col gap-0.5 overflow-y-auto mb-3 scroll-smooth ${fullPage ? "flex-1 min-h-0" : "max-h-[400px]"}`}
      >
        {comments?.map((c, i) => {
          const isMe = c.userId === user?._id;
          const roleColor = ROLE_COLORS[c.authorRole] ?? "var(--text-muted)";

          // Show avatar only if different author than previous message
          const prevMsg = i > 0 ? comments[i - 1] : null;
          const showAvatar = !prevMsg || prevMsg.userId !== c.userId;

          // Task context label (unified mode only)
          const taskName = "taskName" in c ? (c as { taskName?: string | null }).taskName : null;
          const isPinned = (c as { pinned?: boolean }).pinned;
          const commentReactions = reactions?.[c._id] ?? [];

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
                    {isPinned && <Pin className="h-2.5 w-2.5 text-[var(--accent-admin)]" />}
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
                    {renderContent(c.content, isMe)}
                  </span>

                  {/* Inline attachment */}
                  {(c as { attachmentUrl?: string | null }).attachmentUrl && (
                    <div className="mt-1.5">
                      {(c as { attachmentName?: string }).attachmentName?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <a href={(c as { attachmentUrl: string }).attachmentUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={(c as { attachmentUrl: string }).attachmentUrl}
                            alt={(c as { attachmentName?: string }).attachmentName ?? "image"}
                            className="max-w-[280px] rounded-lg border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ) : (
                        <a
                          href={(c as { attachmentUrl: string }).attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                            isMe ? "bg-white/20 text-white hover:bg-white/30" : "bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--border)]"
                          }`}
                        >
                          <FileText className="h-3 w-3" />
                          {(c as { attachmentName?: string }).attachmentName ?? "Download"}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Action buttons on hover */}
                  <div className={`absolute -top-1 ${isMe ? "-left-16" : "-right-16"} opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all`}>
                    {/* Reaction button */}
                    <button
                      onClick={() => setShowEmojiPicker(showEmojiPicker === c._id ? null : c._id)}
                      className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-admin)] transition-colors"
                    >
                      <SmilePlus className="h-3 w-3" />
                    </button>
                    {/* Pin button (admin/manager only) */}
                    {(user?.role === "admin" || user?.role === "manager") && (
                      <button
                        onClick={() => isPinned ? unpinComment({ commentId: c._id }) : pinComment({ commentId: c._id })}
                        className={`p-0.5 rounded transition-colors ${isPinned ? "text-[var(--accent-admin)]" : "text-[var(--text-muted)] hover:text-[var(--accent-admin)]"}`}
                      >
                        <Pin className="h-3 w-3" />
                      </button>
                    )}
                    {/* Delete button */}
                    {(c.userId === user?._id || user?.role === "admin") && (
                      <button
                        onClick={() => deleteComment({ commentId: c._id })}
                        className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Emoji picker */}
                  {showEmojiPicker === c._id && (
                    <div className={`absolute ${isMe ? "left-0" : "right-0"} -bottom-8 flex items-center gap-0.5 bg-white border border-[var(--border)] rounded-full shadow-lg px-1.5 py-0.5 z-20`}>
                      {EMOJI_PRESETS.map((ep) => (
                        <button
                          key={ep.label}
                          onClick={() => { toggleReaction({ commentId: c._id, emoji: ep.label }); setShowEmojiPicker(null); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)] text-[14px] transition-colors"
                        >
                          {ep.emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reactions display */}
                {commentReactions.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                    {commentReactions.map((r) => (
                      <button
                        key={r.emoji}
                        onClick={() => toggleReaction({ commentId: c._id, emoji: r.emoji })}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                          r.myReaction
                            ? "bg-[var(--accent-admin-dim)] border-[var(--accent-admin)] text-[var(--accent-admin)]"
                            : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-admin)]"
                        }`}
                      >
                        <span>{EMOJI_MAP[r.emoji] ?? r.emoji}</span>
                        <span className="font-medium">{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}
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

        {/* Typing indicator */}
        {typingUsers && typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1 mt-1">
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-[10px] text-[var(--text-muted)] italic">
              {typingUsers.map((u) => u.name).join(" and ")} {typingUsers.length === 1 ? "is" : "are"} typing...
            </span>
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

        {/* Pending file preview */}
        {pendingFile && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]">
            <Paperclip className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] text-[var(--text-primary)] truncate flex-1">{pendingFile.name}</span>
            <button onClick={() => setPendingFile(null)} className="text-[var(--text-muted)] hover:text-[var(--danger)]">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Input row */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* File upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Attach a file"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPendingFile({ file, name: file.name });
              e.target.value = "";
            }}
          />

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
            disabled={(!text.trim() && !pendingFile) || uploading}
            className="shrink-0 p-2 rounded-xl bg-[var(--accent-admin)] text-white disabled:opacity-30 hover:bg-[#c4684d] transition-colors"
          >
            {uploading ? (
              <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
