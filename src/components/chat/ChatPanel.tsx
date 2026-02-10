"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
} from "lucide-react";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
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

  const chatHistory = useQuery(api.chat.getChatHistory);
  const sendMessage = useAction(api.aiAction.sendMessage);
  const clearHistory = useMutation(api.chat.clearChatHistory);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combine server messages with optimistic ones
  const allMessages = [
    ...(chatHistory ?? []),
    ...optimisticMessages,
  ];

  // Clear optimistic messages once server catches up
  useEffect(() => {
    if (chatHistory && optimisticMessages.length > 0) {
      // If server has more messages than before our optimistic adds, clear them
      const serverCount = chatHistory.length;
      const lastOptimistic = optimisticMessages[optimisticMessages.length - 1];
      const serverHasIt = chatHistory.some(
        (m) =>
          m.role === lastOptimistic.role &&
          m.content === lastOptimistic.content &&
          Math.abs(m.createdAt - lastOptimistic.createdAt) < 5000
      );
      if (serverHasIt) {
        setOptimisticMessages([]);
      }
      // Also clear if there are enough server messages
      if (serverCount > 0 && !isLoading) {
        setOptimisticMessages([]);
      }
    }
  }, [chatHistory, optimisticMessages, isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed && !pendingFile) return;
    if (isLoading) return;

    const userMsg = trimmed + (pendingFile ? ` [File: ${pendingFile.name}]` : "");

    // Add optimistic user message
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
      const sendArgs: any = { message: trimmed };
      if (fileId) sendArgs.fileId = fileId;
      if (fileName) sendArgs.fileName = fileName;

      await sendMessage(sendArgs);
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
  }

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
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleClear() {
    await clearHistory();
    setOptimisticMessages([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
                    : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                }`}
              >
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-2.5">
              <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="bg-[var(--bg-secondary)] rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:300ms]" />
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
            {/* File upload */}
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

            {/* Text input */}
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

            {/* Send button */}
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
    </>
  );
}
