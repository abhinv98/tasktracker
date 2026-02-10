"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Search, FileText, CheckSquare, Tag, Users, UserCircle, X } from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = useQuery(
    api.search.globalSearch,
    query.trim().length >= 2 ? { query: query.trim() } : "skip"
  );

  // Flatten results for keyboard navigation
  const allResults: { type: string; label: string; sub?: string; href: string }[] = [];
  if (results) {
    for (const b of results.briefs) {
      allResults.push({ type: "Brief", label: b.title, sub: b.status, href: `/brief/${b._id}` });
    }
    for (const t of results.tasks) {
      allResults.push({ type: "Task", label: t.title, sub: t.status, href: `/brief/${t.briefId}` });
    }
    for (const b of results.brands) {
      allResults.push({ type: "Brand", label: b.name, href: `/brands/${b._id}` });
    }
    for (const t of results.teams) {
      allResults.push({ type: "Team", label: t.name, href: "/teams" });
    }
    for (const u of results.users) {
      allResults.push({ type: "User", label: u.name, sub: u.role ?? undefined, href: "/users" });
    }
  }

  const ICONS: Record<string, typeof FileText> = {
    Brief: FileText,
    Task: CheckSquare,
    Brand: Tag,
    Team: Users,
    User: UserCircle,
  };

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && allResults[selectedIndex]) {
        router.push(allResults[selectedIndex].href);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [allResults, selectedIndex, router, onClose]
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-[520px] bg-white rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--border)]">
          <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search briefs, tasks, brands, teams..."
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none"
          />
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">
                Type at least 2 characters to search
              </p>
              <p className="text-[11px] text-[var(--text-disabled)] mt-1">
                Tip: Use Cmd+K to open this anytime
              </p>
            </div>
          ) : allResults.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">No results found</p>
            </div>
          ) : (
            <div className="py-2">
              {allResults.map((item, i) => {
                const Icon = ICONS[item.type] ?? FileText;
                return (
                  <button
                    key={`${item.type}-${item.label}-${i}`}
                    onClick={() => {
                      router.push(item.href);
                      onClose();
                    }}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                      i === selectedIndex ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {item.label}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.sub && (
                        <span className="text-[10px] text-[var(--text-muted)] capitalize">
                          {item.sub}
                        </span>
                      )}
                      <span className="text-[10px] font-medium text-[var(--text-disabled)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">
                        {item.type}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            <span><kbd className="px-1 py-0.5 rounded bg-white border border-[var(--border)] text-[9px]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white border border-[var(--border)] text-[9px]">↵</kbd> Open</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white border border-[var(--border)] text-[9px]">esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </>
  );
}
