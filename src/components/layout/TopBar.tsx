"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Bell, Menu, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui";

interface TopBarProps {
  user: Doc<"users">;
  onMenuToggle: () => void;
}

const PATH_TO_TITLE: Record<string, string> = {
  "/dashboard": "Overview",
  "/briefs": "Briefs",
  "/brief": "Brief Details",
  "/teams": "Teams",
  "/users": "Users & Roles",
  "/archive": "Archive",
  "/profile": "Profile",
  "/deliverables": "Deliverables",
  "/brands": "Brands",
  "/overview": "Brand Overview",
};

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(PATH_TO_TITLE)) {
    if (pathname === path || pathname.startsWith(path + "/")) {
      return title;
    }
  }
  return "Overview";
}

export function TopBar({ user, onMenuToggle }: TopBarProps) {
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
    role === "admin" ? "admin" : role === "manager" ? "manager" : "employee";
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
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between px-6 bg-white/70 backdrop-blur-xl border-b border-[var(--border)]">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="md:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold text-[15px] text-[var(--text-primary)]">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
              showNotifs
                ? "bg-[var(--accent-admin-dim)] text-[var(--accent-admin)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Bell className="h-4 w-4" />
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--accent-admin)] text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl border border-[var(--border)] shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <span className="font-semibold text-[13px] text-[var(--text-primary)]">
                  Notifications
                </span>
                <div className="flex items-center gap-2">
                  {(unreadCount ?? 0) > 0 && (
                    <button
                      onClick={() => markAllAsRead({})}
                      className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifs(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
                          : "bg-[var(--accent-admin-dim)] hover:bg-[var(--bg-hover)]"
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
                          <p className="text-[11px] text-[var(--text-muted)] mt-1">
                            {formatTimeAgo(notif.createdAt)}
                          </p>
                        </div>
                        {!notif.read && (
                          <button
                            onClick={() => markAsRead({ notificationId: notif._id })}
                            className="shrink-0 mt-1 w-2 h-2 rounded-full bg-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/80"
                            title="Mark as read"
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

        <Badge variant={roleVariant}>{role}</Badge>

        <button
          onClick={() => signOut()}
          className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
