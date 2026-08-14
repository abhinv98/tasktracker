"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LayoutGrid, UserSearch, Check, ChevronsUpDown, type LucideIcon } from "lucide-react";

export interface Workspace {
  key: string;
  label: string;
  hint: string;
  home: string;
  icon: LucideIcon;
  /** Any path under these prefixes puts you in this workspace. */
  match: string[];
}

/**
 * The workspaces this app can switch between. "Main" is everything the sidebar
 * has always shown; Recruitment is a self-contained sub-app with its own
 * navigation. Adding a workspace later is one entry here plus its nav array.
 */
export const WORKSPACES: Workspace[] = [
  {
    key: "main",
    label: "Workspace",
    hint: "Briefs, tasks and delivery",
    home: "/dashboard",
    icon: LayoutGrid,
    match: [],
  },
  {
    key: "recruitment",
    label: "Recruitment",
    hint: "Hiring, candidates and outreach",
    home: "/recruitment",
    icon: UserSearch,
    match: ["/recruitment"],
  },
];

export function workspaceForPath(pathname: string): Workspace {
  return (
    WORKSPACES.find(
      (w) => w.match.length > 0 && w.match.some((m) => pathname.startsWith(m))
    ) ?? WORKSPACES[0]
  );
}

/**
 * Sits at the top of the sidebar. Two jobs, and the second is the one the
 * previous URL-driven version got wrong: it SHOWS which context you're in, not
 * just lets you change it. A sidebar that silently rearranges itself with no
 * visible control is disorienting even when the destinations are right.
 */
export function WorkspaceSwitcher({
  available,
  onNavigate,
}: {
  available: string[];
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = WORKSPACES.filter((w) => available.includes(w.key));
  const current = workspaceForPath(pathname);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // One workspace means nothing to switch — a dropdown with a single entry is
  // just a button that lies about being a menu.
  if (options.length < 2) return null;

  const Icon = current.icon;

  return (
    <div ref={ref} className="relative px-3 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-admin-dim)]">
          <Icon className="h-3.5 w-3.5 text-[var(--accent-admin-text)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--text-primary)]">
            {current.label}
          </span>
          <span className="block truncate text-[10px] leading-tight text-[var(--text-muted)]">
            {current.hint}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-scaleIn absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-lg"
        >
          {options.map((w) => {
            const WIcon = w.icon;
            const active = w.key === current.key;
            return (
              <button
                key={w.key}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                  // Always land on the workspace home rather than trying to map
                  // the current page across — the contexts don't have matching
                  // pages, so a "smart" mapping would guess wrong.
                  if (!active) router.push(w.home);
                }}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  active ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--bg-hover)]">
                  <WIcon className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight text-[var(--text-primary)]">
                    {w.label}
                  </span>
                  <span className="block truncate text-[10px] leading-tight text-[var(--text-muted)]">
                    {w.hint}
                  </span>
                </span>
                {active && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-admin-text)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
