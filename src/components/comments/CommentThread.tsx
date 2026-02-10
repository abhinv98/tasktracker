"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Send, Trash2 } from "lucide-react";

interface CommentThreadProps {
  parentType: "brief" | "task";
  parentId: string;
}

export function CommentThread({ parentType, parentId }: CommentThreadProps) {
  const comments = useQuery(api.comments.getComments, { parentType, parentId });
  const addComment = useMutation(api.comments.addComment);
  const deleteComment = useMutation(api.comments.deleteComment);
  const user = useQuery(api.users.getCurrentUser);
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await addComment({ parentType, parentId, content: text.trim() });
    setText("");
  }

  const ROLE_COLORS: Record<string, string> = {
    admin: "var(--accent-admin)",
    manager: "var(--accent-manager)",
    employee: "var(--accent-employee)",
  };

  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide">
        Comments ({comments?.length ?? 0})
      </h4>

      {/* Comment list */}
      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
        {comments?.map((c) => (
          <div key={c._id} className="flex gap-2 group">
            <div
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: ROLE_COLORS[c.authorRole] ?? "var(--text-muted)" }}
            >
              {c.authorName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                  {c.authorName}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {new Date(c.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {(c.userId === user?._id || user?.role === "admin") && (
                  <button
                    onClick={() => deleteComment({ commentId: c._id })}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger)] transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mt-0.5">
                {c.content}
              </p>
            </div>
          </div>
        ))}
        {comments?.length === 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">No comments yet.</p>
        )}
      </div>

      {/* Add comment */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white disabled:opacity-40 transition-opacity"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
