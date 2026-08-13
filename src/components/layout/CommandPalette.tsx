"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  Search,
  FileText,
  CheckSquare,
  Tag,
  Users,
  UserCircle,
  X,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { NAV_COMMANDS } from "@/lib/commands";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type Item = {
  type: string;
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
};

const RESULT_ICONS: Record<string, LucideIcon> = {
  Brief: FileText,
  Task: CheckSquare,
  Brand: Tag,
  Team: Users,
  User: UserCircle,
};

/** Trivial subsequence match, so "cdr" finds "Client Requests". */
function fuzzy(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  for (const ch of h) if (ch === n[i]) i++;
  return i === n.length;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);

  const results = useQuery(
    api.search.globalSearch,
    query.trim().length >= 2 ? { query: query.trim() } : "skip"
  );

  // Commands the current user is actually allowed to reach — an empty palette
  // is better than one that offers a page and then bounces you off it.
  const commands = useMemo(() => {
    if (!user) return [];
    return NAV_COMMANDS.filter((c) => c.visible(user));
  }, [user]);

  const allResults: Item[] = useMemo(() => {
    const q = query.trim();
    const items: Item[] = [];

    // Commands first: with no query they ARE the palette, and when you're
    // typing you almost always want the action over a search hit.
    const matchedCommands = q
      ? commands.filter(
          (c) =>
            c.label.toLowerCase().includes(q.toLowerCase()) ||
            c.keywords.some((k) => k.includes(q.toLowerCase())) ||
            fuzzy(c.label, q)
        )
      : commands;
    for (const c of matchedCommands.slice(0, q ? 6 : 12)) {
      items.push({
        type: "Go",
        label: c.label,
        sub: c.hint,
        href: c.href,
        icon: c.icon,
      });
    }

    if (results) {
      for (const b of results.briefs)
        items.push({ type: "Brief", label: b.title, sub: b.status, href: `/brief/${b._id}`, icon: RESULT_ICONS.Brief });
      for (const t of results.tasks)
        items.push({ type: "Task", label: t.title, sub: t.status, href: `/brief/${t.briefId}`, icon: RESULT_ICONS.Task });
      for (const b of results.brands)
        items.push({ type: "Brand", label: b.name, href: `/brands/${b._id}`, icon: RESULT_ICONS.Brand });
      for (const t of results.teams)
        items.push({ type: "Team", label: t.name, href: "/teams", icon: RESULT_ICONS.Team });
      for (const u of results.users)
        items.push({ type: "User", label: u.name, sub: u.role ?? undefined, href: "/users", icon: RESULT_ICONS.User });
    }
    return items;
  }, [query, commands, results]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const run = useCallback(
    (item: Item) => {
      router.push(item.href);
      onClose();
    },
    [router, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(allResults.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + allResults.length) % Math.max(allResults.length, 1)
        );
      } else if (e.key === "Enter" && allResults[selectedIndex]) {
        run(allResults[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [allResults, selectedIndex, run, onClose]
  );

  if (!isOpen) return null;

  const empty = query.trim().length >= 2 && allResults.length === 0;

  return (
    <>
      <div className="fixed inset-0 bg-[#141413]/30 z-50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-scaleIn fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-[560px] bg-white rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--border)]">
          <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to a page, or search briefs, tasks, brands…"
            className="flex-1 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close command palette"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[360px] overflow-y-auto">
          {empty ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-[var(--text-secondary)]">
                Nothing matches “{query.trim()}”
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">
                Try a brief title, a brand, or a teammate&apos;s name.
              </p>
            </div>
          ) : (
            <div className="py-2">
              {allResults.map((item, i) => {
                const Icon = item.icon;
                const active = i === selectedIndex;
                // Section break where navigation ends and search hits begin.
                const startsSearch =
                  item.type !== "Go" && allResults[i - 1]?.type === "Go";
                return (
                  <div key={`${item.type}-${item.label}-${i}`}>
                    {startsSearch && (
                      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Results
                      </div>
                    )}
                    <button
                      data-index={i}
                      onMouseEnter={() => setSelectedIndex(i)}
                      onClick={() => run(item)}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                        active ? "bg-[var(--bg-hover)]" : ""
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active
                            ? "text-[var(--accent-admin-text)]"
                            : "text-[var(--text-muted)]"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                          {item.label}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.sub && (
                          <span className="text-[11px] text-[var(--text-muted)] capitalize">
                            {item.sub}
                          </span>
                        )}
                        {active && (
                          <CornerDownLeft className="h-3 w-3 text-[var(--text-muted)]" />
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-primary)] text-[11px] text-[var(--text-muted)]">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--border)]">↑↓</kbd>{" "}
            Navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--border)]">↵</kbd>{" "}
            Open
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--border)]">esc</kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </>
  );
}
