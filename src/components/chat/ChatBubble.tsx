"use client";

import { MessageSquare, X } from "lucide-react";

interface ChatBubbleProps {
  isOpen: boolean;
  onClick: () => void;
}

export function ChatBubble({ isOpen, onClick }: ChatBubbleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        fixed bottom-6 right-6 z-50
        w-12 h-12 rounded-full
        flex items-center justify-center
        shadow-lg transition-all duration-200 ease-in-out
        ${
          isOpen
            ? "bg-[var(--text-secondary)] hover:bg-[var(--text-primary)]"
            : "bg-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/90 animate-subtle-pulse"
        }
      `}
      title={isOpen ? "Close chat" : "Open AI Assistant"}
    >
      {isOpen ? (
        <X className="h-5 w-5 text-white" />
      ) : (
        <MessageSquare className="h-5 w-5 text-white" />
      )}
    </button>
  );
}
