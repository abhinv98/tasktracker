"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Bell, Menu, X, Search, Square } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui";
import { formatMinutes } from "@/components/ui/TaskTimeSection";
import { getDisplayRole } from "@/lib/roles";

interface TopBarProps {
  user: Doc<"users">;
  onMenuToggle: () => void;
  onSearchClick?: () => void;
}

const PATH_TO_TITLE: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/my-tasks": "My Tasks",
  "/briefs": "Briefs",
  "/brief": "Brief Details",
  "/users": "Users & Teams",
  "/teams": "Users & Teams",
  "/archive": "Archive",
  "/profile": "Profile",
  "/meetings": "Meetings",
  "/deliverables": "Deliverables",
  "/brands-overview": "Brands Overview",
  "/brands": "Brands",
  "/overview": "Brands Overview",
  "/analytics": "Brands Overview",
  "/oversight": "Oversight",
  "/notebook": "My Notebook",
  "/worklog": "Work Log",
  "/client-requests": "Client Requests",
  "/hr-requests": "HR Requests",
  "/recruitment": "Recruitment",
  "/recruitment/candidates": "All Applicants",
  "/recruitment/setup": "Recruitment Setup",
  "/recruitment/templates": "Templates",
  "/recruitment/activity": "Email Activity",
  "/my-requests": "My Requests",
  "/petty-cash": "Petty Cash",
  "/content-calendar": "Content Calendar",
  "/planner": "Planner",
  "/discussions": "Discussions",
  "/messages": "Messages",
  "/freelancers": "Freelancers",
  "/invoices": "Invoices",
  "/approved-work": "Approved Work",
  "/history": "History",
  "/my-brands": "My Brands",
  "/reports": "Reports",
};

function getPageTitle(pathname: string): string {
  // Longest matching prefix wins, so /recruitment/candidates beats /recruitment.
  let best = "";
  for (const path of Object.keys(PATH_TO_TITLE)) {
    if ((pathname === path || pathname.startsWith(path + "/")) && path.length > best.length) {
      best = path;
    }
  }
  return best ? PATH_TO_TITLE[best] : "";
}

export function TopBar({ user, onMenuToggle, onSearchClick }: TopBarProps) {
  const { signOut } = useAuthActions();
  const pathname = usePathname();
  const unreadCount = useQuery(api.notifications.getUnreadCount);
  const notificationsData = useQuery(api.notifications.getNotifications, { limit: 20 });
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const [showNotifs, setShowNotifs] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const role = user.role ?? "employee";

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    if (showNotifs) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifs]);

  const roleVariant =
    role === "admin" ? "admin" : "employee";
  const pageTitle = getPageTitle(pathname);
  const notifications = notificationsData?.notifications ?? [];

  function formatTimeAgo(ts: number) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 px-4 sm:px-6 bg-white border-b border-[var(--border)]">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={onMenuToggle}
          aria-label="Open menu"
          className="md:hidden -ml-1.5 inline-flex items-center justify-center h-control w-control rounded-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
          {pageTitle}
        </span>
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="hidden sm:flex items-center gap-2 h-control px-3 rounded-control text-[13px] font-medium border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded-[5px] bg-white border border-[var(--border)] border-b-[2px] text-[11px] font-mono text-[var(--text-secondary)]">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <RunningTimerPill />
        {/* Notifications */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            aria-label="Notifications"
            aria-expanded={showNotifs}
            className={`relative flex items-center gap-2 h-control px-3 rounded-control text-[13px] font-medium transition-colors duration-150 ${
              showNotifs
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Bell className="h-4 w-4" />
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--accent-admin-strong)] text-[11px] font-semibold tabular-nums text-white">
                {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifs && (
            // Phones: pin to the viewport (the bell isn't at the right edge, so
            // anchoring to it pushed the panel off-screen).
            <div className="fixed left-4 right-4 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full z-30 mt-2 sm:w-[24rem] bg-white rounded-lg border border-[var(--border)] shadow-lg overflow-hidden">
              <div className="flex items-center justify-between pl-4 pr-2 h-11 border-b border-[var(--border-subtle)]">
                <span className="font-semibold text-[14px] text-[var(--text-primary)]">
                  Notifications
                </span>
                <div className="flex items-center gap-2">
                  {(unreadCount ?? 0) > 0 && (
                    <button
                      onClick={() => markAllAsRead({})}
                      className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifs(false)}
                    aria-label="Close notifications"
                    className="inline-flex items-center justify-center h-control w-control rounded-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[13px] text-[var(--text-muted)]">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif._id}
                      className={`px-4 py-3 border-b border-[var(--border-subtle)] transition-colors duration-150 ${
                        notif.read
                          ? "bg-white"
                          : "bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                            {notif.title}
                          </p>
                          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                          <p className="text-[12px] text-[var(--text-muted)] mt-1">
                            {formatTimeAgo(notif.createdAt)}
                          </p>
                        </div>
                        {!notif.read && (
                          <button
                            onClick={() => markAsRead({ notificationId: notif._id })}
                            className="shrink-0 mt-1 w-2 h-2 rounded-full bg-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/80"
                            title="Mark as read"
                            aria-label="Mark as read"
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-[var(--border)]" aria-hidden />

        <span className="hidden sm:inline text-[13px] text-[var(--text-secondary)]">
          {user.name ?? user.email ?? "User"}
        </span>

        <span className="hidden sm:inline-flex">
          <Badge variant={roleVariant}>{getDisplayRole(user)}</Badge>
        </span>

        <button
          onClick={() => signOut()}
          className="whitespace-nowrap h-control px-3 rounded-control text-[13px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

/** A running timer is easy to forget; keep it visible from every page. */
function RunningTimerPill() {
  const active = useQuery(api.timeTracking.getActiveTimer);
  const stopTimer = useMutation(api.timeTracking.stopTimer);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  const mins = Math.max(0, Math.round((now - active.startedAt) / 60000));
  return (
    <button
      onClick={() => void stopTimer({ entryId: active._id })}
      title={`Stop timer on "${active.taskTitle ?? "task"}"`}
      className="inline-flex items-center gap-1.5 h-control px-3 rounded-control text-[13px] font-medium bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)] hover:opacity-90"
    >
      <Square className="h-3 w-3" />
      <span className="tabular-nums">{formatMinutes(mins)}</span>
      <span className="hidden md:inline max-w-[140px] truncate">{active.taskTitle}</span>
    </button>
  );
}
