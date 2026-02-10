"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Send,
  Paperclip,
  X,
  Trash2,
  Loader2,
  Bot,
  User,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  XCircle,
  Plus,
  MessageSquare,
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Clock,
} from "lucide-react";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Simple markdown renderer for chat messages
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.trim() === "") {
      elements.push(<br key={`br-${i}`} />);
      continue;
    }

    const isBullet = /^[\s]*[-*]\s+/.test(line);
    if (isBullet) {
      line = line.replace(/^[\s]*[-*]\s+/, "");
    }

    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(
          <strong key={`b-${i}-${match.index}`} className="font-semibold">
            {match[2]}
          </strong>
        );
      } else if (match[3]) {
        parts.push(
          <em key={`i-${i}-${match.index}`}>{match[3]}</em>
        );
      } else if (match[4]) {
        parts.push(
          <code
            key={`c-${i}-${match.index}`}
            className="px-1 py-0.5 rounded bg-[var(--bg-hover)] text-[12px] font-mono"
          >
            {match[4]}
          </code>
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    if (isBullet) {
      elements.push(
        <div key={`line-${i}`} className="flex gap-1.5 pl-1">
          <span className="shrink-0 mt-[7px] w-1 h-1 rounded-full bg-current opacity-50" />
          <span>{parts}</span>
        </div>
      );
    } else {
      elements.push(<div key={`line-${i}`}>{parts}</div>);
    }
  }

  return elements;
}

const TOOL_LABELS: Record<string, string> = {
  list_briefs: "Listing briefs",
  get_brief_details: "Getting brief details",
  create_brief: "Creating brief",
  create_brief_from_content: "Creating brief from document",
  list_brands: "Listing brands",
  get_brand_info: "Getting brand info",
  create_brand: "Creating brand",
  list_teams: "Listing teams",
  get_team_members: "Getting team members",
  get_my_tasks: "Getting tasks",
  get_dashboard_stats: "Getting dashboard stats",
  assign_teams_to_brief: "Assigning teams to brief",
  assign_manager_to_brief: "Assigning manager",
  create_task: "Creating task",
  update_task_status: "Updating task status",
  update_brief_status: "Updating brief status",
};

interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
}

function ToolStepsDisplay({ stepsJson }: { stepsJson: string }) {
  const [expanded, setExpanded] = useState(false);

  let steps: ToolStep[] = [];
  try {
    steps = JSON.parse(stepsJson);
  } catch {
    return null;
  }

  if (steps.length === 0) return null;

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <Wrench className="h-3 w-3" />
        <span>Used {steps.length} tool{steps.length > 1 ? "s" : ""}</span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5 pl-1 border-l-2 border-[var(--border-subtle)] ml-1">
          {steps.map((step, i) => {
            let resultPreview = "";
            try {
              const parsed = JSON.parse(step.result);
              if (parsed.error) {
                resultPreview = `Error: ${parsed.error}`;
              } else if (parsed.success) {
                resultPreview = parsed.message || "Success";
              } else if (Array.isArray(parsed)) {
                resultPreview = `${parsed.length} result${parsed.length !== 1 ? "s" : ""}`;
              } else if (parsed.title) {
                resultPreview = parsed.title;
              } else if (parsed.name) {
                resultPreview = parsed.name;
              } else {
                resultPreview = "Done";
              }
            } catch {
              resultPreview = step.result.slice(0, 80);
            }

            return (
              <div key={i} className="flex items-start gap-1.5 pl-2">
                {step.success ? (
                  <CheckCircle2 className="h-3 w-3 text-[var(--accent-employee)] shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-3 w-3 text-[var(--danger)] shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[var(--text-primary)]">
                    {TOOL_LABELS[step.tool] ?? step.tool.replace(/_/g, " ")}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[250px]">
                    {resultPreview}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Relative time helper ───────────────────
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Conversation List View ─────────────────
function ConversationList({
  conversations,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  conversations: { _id: Id<"chatConversations">; title: string; createdAt: number; updatedAt: number }[];
  onSelect: (id: Id<"chatConversations">) => void;
  onNew: () => void;
  onDelete: (id: Id<"chatConversations">) => void;
  onRename: (id: Id<"chatConversations">, title: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  return (
    <div className="flex flex-col h-full">
      {/* New chat button */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-[var(--border)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--accent-admin)] transition-all"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mb-3">
              <MessageSquare className="h-5 w-5 text-[var(--text-muted)]" />
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mb-1">No conversations yet</p>
            <p className="text-[11px] text-[var(--text-disabled)]">
              Start a new chat to begin
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((convo) => (
              <div
                key={convo._id}
                className="group relative rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-hover)] transition-all"
              >
                {renaming === convo._id ? (
                  <form
                    className="flex items-center gap-1 px-3 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renameValue.trim()) {
                        onRename(convo._id, renameValue.trim());
                      }
                      setRenaming(null);
                    }}
                  >
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim()) {
                          onRename(convo._id, renameValue.trim());
                        }
                        setRenaming(null);
                      }}
                      className="flex-1 text-[13px] px-1.5 py-0.5 rounded border border-[var(--accent-admin)] focus:outline-none bg-white"
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => onSelect(convo._id)}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-2.5"
                  >
                    <MessageSquare className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate leading-tight">
                        {convo.title}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-[var(--text-disabled)]" />
                        <span className="text-[10px] text-[var(--text-disabled)]">
                          {timeAgo(convo.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Context menu trigger */}
                {renaming !== convo._id && (
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === convo._id ? null : convo._id);
                      }}
                      className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>

                    {/* Dropdown */}
                    {menuOpen === convo._id && (
                      <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-[var(--border)] rounded-lg shadow-lg z-10 py-1 animate-[scaleIn_0.1s_ease-out]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameValue(convo.title);
                            setRenaming(convo._id);
                            setMenuOpen(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
                        >
                          <Pencil className="h-3 w-3" /> Rename
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(null);
                            onDelete(convo._id);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat View (messages for a conversation) ──
function ChatView({
  conversationId,
  onBack,
}: {
  conversationId: Id<"chatConversations">;
  onBack: () => void;
}) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    storageId: string;
    name: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<
    { role: "user" | "assistant"; content: string; createdAt: number }[]
  >([]);

  const convoMessages = useQuery(api.chat.getConversationMessages, { conversationId });
  const sendMessageAction = useAction(api.aiAction.sendMessage);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const conversations = useQuery(api.chat.listConversations);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const convoTitle = conversations?.find((c) => c._id === conversationId)?.title ?? "Chat";

  const allMessages = [
    ...(convoMessages ?? []),
    ...optimisticMessages,
  ];

  // Clear optimistic messages once server catches up
  useEffect(() => {
    if (convoMessages && optimisticMessages.length > 0) {
      const lastOptimistic = optimisticMessages[optimisticMessages.length - 1];
      const serverHasIt = convoMessages.some(
        (m) =>
          m.role === lastOptimistic.role &&
          m.content === lastOptimistic.content &&
          Math.abs(m.createdAt - lastOptimistic.createdAt) < 5000
      );
      if (serverHasIt || !isLoading) {
        setOptimisticMessages([]);
      }
    }
  }, [convoMessages, optimisticMessages, isLoading]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length, isLoading]);

  // Focus input
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [conversationId]);

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed && !pendingFile) return;
    if (isLoading) return;

    const userMsg = trimmed + (pendingFile ? ` [File: ${pendingFile.name}]` : "");

    setOptimisticMessages((prev) => [
      ...prev,
      { role: "user", content: userMsg, createdAt: Date.now() },
    ]);

    setMessage("");
    setIsLoading(true);

    try {
      const fileId = pendingFile?.storageId;
      const fileName = pendingFile?.name;
      setPendingFile(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendArgs: any = {
        message: trimmed,
        conversationId,
      };
      if (fileId) sendArgs.fileId = fileId;
      if (fileName) sendArgs.fileName = fileName;

      await sendMessageAction(sendArgs);
    } catch (error) {
      console.error("Chat error:", error);
      setOptimisticMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [message, pendingFile, isLoading, conversationId, sendMessageAction]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      setPendingFile({ storageId, name: file.name });
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header with back button and convo title */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-[12px] font-medium text-[var(--text-secondary)] truncate flex-1">
          {convoTitle}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {allMessages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mb-3">
              <Bot className="h-6 w-6 text-[var(--text-muted)]" />
            </div>
            <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">
              How can I help?
            </p>
            <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
              Ask about briefs, tasks, brands, or stats. Upload a document to
              create a brief from it.
            </p>
            <div className="mt-4 flex flex-col gap-2 w-full max-w-[280px]">
              {[
                "Show me all active briefs",
                "What are my current tasks?",
                "Give me a dashboard summary",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setMessage(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {allMessages.map((msg, i) => (
          <div
            key={`${msg.createdAt}-${i}`}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                msg.role === "user"
                  ? "bg-[var(--accent-admin)]"
                  : "bg-[var(--bg-hover)]"
              }`}
            >
              {msg.role === "user" ? (
                <User className="h-3.5 w-3.5 text-white" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-[var(--accent-admin)] text-white"
                  : "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
              }`}
            >
              {/* Tool steps (thinking) */}
              {msg.role === "assistant" && (msg as { toolSteps?: string }).toolSteps && (
                <ToolStepsDisplay stepsJson={(msg as { toolSteps?: string }).toolSteps!} />
              )}
              <div className="text-[13px] leading-relaxed break-words space-y-0.5">
                {msg.role === "assistant"
                  ? renderMarkdown(msg.content)
                  : <span className="whitespace-pre-wrap">{msg.content}</span>
                }
              </div>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isLoading && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-xl px-4 py-3 border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-admin)]" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Pending file indicator */}
      {pendingFile && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--accent-admin)] shrink-0" />
          <span className="text-[12px] text-[var(--text-secondary)] truncate flex-1">
            {pendingFile.name}
          </span>
          <button
            onClick={() => setPendingFile(null)}
            className="text-[var(--text-muted)] hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border)] px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.pdf,.doc,.docx,.csv,.json"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="shrink-0 p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
            title="Attach file"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>

          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white max-h-[120px]"
            style={{ minHeight: "38px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "38px";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />

          <button
            onClick={handleSend}
            disabled={isLoading || (!message.trim() && !pendingFile)}
            className="shrink-0 p-2 rounded-lg bg-[var(--accent-admin)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatPanel ─────────────────────────
export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [activeConversationId, setActiveConversationId] = useState<Id<"chatConversations"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const conversations = useQuery(api.chat.listConversations);
  const createConversation = useMutation(api.chat.createConversation);
  const deleteConversation = useMutation(api.chat.deleteConversation);
  const renameConversation = useMutation(api.chat.renameConversation);

  // When panel closes, optionally reset to list
  useEffect(() => {
    if (!isOpen) {
      // Keep the conversation selected so reopening shows same chat
    }
  }, [isOpen]);

  async function handleNewChat() {
    setIsCreating(true);
    try {
      const id = await createConversation({ title: "New chat" });
      setActiveConversationId(id);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteConversation(id: Id<"chatConversations">) {
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
    await deleteConversation({ conversationId: id });
  }

  async function handleRenameConversation(id: Id<"chatConversations">, title: string) {
    await renameConversation({ conversationId: id, title });
  }

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 z-50 h-full
          w-full sm:w-[420px]
          bg-white border-l border-[var(--border)]
          shadow-xl flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-admin)] flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-[14px] text-[var(--text-primary)]">
              AI Assistant
            </span>
          </div>
          <div className="flex items-center gap-1">
            {activeConversationId && (
              <button
                onClick={handleNewChat}
                disabled={isCreating}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                title="New chat"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {activeConversationId ? (
          <ChatView
            conversationId={activeConversationId}
            onBack={() => setActiveConversationId(null)}
          />
        ) : (
          <ConversationList
            conversations={conversations ?? []}
            onSelect={setActiveConversationId}
            onNew={handleNewChat}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
          />
        )}
      </div>
    </>
  );
}
