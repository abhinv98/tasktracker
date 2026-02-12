"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  LayoutGrid,
  Briefcase,
  Users,
  Shield,
  Archive,
  UserCircle,
  FileCheck,
  Tag,
  BarChart3,
  TrendingUp,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  MessageCircle,
  MessageSquare,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";

interface SidebarProps {
  user: Doc<"users">;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ROUTE_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutGrid,
  "/briefs": Briefcase,
  "/brands": Tag,
  "/overview": BarChart3,
  "/analytics": TrendingUp,
  "/discussions": MessageCircle,
  "/planner": CalendarDays,
  "/messages": MessageSquare,
  "/teams": Users,
  "/users": Shield,
  "/archive": Archive,
  "/profile": UserCircle,
  "/deliverables": FileCheck,
};

const ADMIN_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/briefs", label: "Briefs" },
  { href: "/discussions", label: "Discussions" },
  { href: "/planner", label: "Planner" },
  { href: "/messages", label: "Messages" },
  { href: "/brands", label: "Brands" },
  { href: "/overview", label: "Brand Overview" },
  { href: "/analytics", label: "Analytics" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/teams", label: "Teams" },
  { href: "/users", label: "Users & Roles" },
  { href: "/archive", label: "Archive" },
  { href: "/profile", label: "Profile" },
];

const MANAGER_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/briefs", label: "Briefs" },
  { href: "/discussions", label: "Discussions" },
  { href: "/planner", label: "Planner" },
  { href: "/messages", label: "Messages" },
  { href: "/brands", label: "Brands" },
  { href: "/analytics", label: "Analytics" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/teams", label: "Teams" },
  { href: "/archive", label: "Archive" },
  { href: "/profile", label: "Profile" },
];

const EMPLOYEE_NAV = [
  { href: "/dashboard", label: "Queue" },
  { href: "/discussions", label: "Discussions" },
  { href: "/planner", label: "Planner" },
  { href: "/messages", label: "Messages" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/profile", label: "Profile" },
];

function getIconForRoute(href: string): LucideIcon {
  return ROUTE_ICONS[href] ?? LayoutGrid;
}

export function Sidebar({ user, open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const role = user.role ?? "employee";
  const unreadDmCount = useQuery(api.dm.getUnreadTotal) ?? 0;

  const nav =
    role === "admin"
      ? ADMIN_NAV
      : role === "manager"
        ? MANAGER_NAV
        : EMPLOYEE_NAV;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-full flex-col border-r border-[var(--border)] bg-white
          transition-all duration-200 ease-in-out
          ${collapsed ? "md:w-[68px]" : "md:w-60"}
          w-60
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Logo + Toggle */}
        <div className={`flex shrink-0 items-center h-14 border-b border-[var(--border)] ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          {collapsed ? (
            <button
              onClick={onToggleCollapse}
              className="w-8 h-8 rounded-lg bg-[var(--accent-admin)] flex items-center justify-center hover:opacity-90 transition-opacity"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4 text-white" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[var(--accent-admin)] flex items-center justify-center">
                  <span className="text-white font-bold text-[12px]">O</span>
                </div>
                <span className="font-semibold text-[14px] text-[var(--text-primary)]">
                  Orchestrator
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggleCollapse}
                  className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex flex-1 flex-col gap-1 py-4 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
          {nav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = getIconForRoute(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={`
                  flex items-center rounded-lg transition-colors duration-150 relative
                  ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"}
                  font-medium text-[13px]
                  ${
                    isActive
                      ? "bg-[var(--accent-admin)] text-white"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }
                `}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && item.href === "/messages" && unreadDmCount > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
                    {unreadDmCount}
                  </span>
                )}
                {collapsed && item.href === "/messages" && unreadDmCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--border)]">
          {/* User info */}
          <div className={`py-3 ${collapsed ? "px-2 text-center" : "px-5"}`}>
            {collapsed ? (
              <div
                className="w-8 h-8 mx-auto rounded-full bg-[var(--bg-hover)] flex items-center justify-center"
                title={`${user.name ?? user.email} (${role})`}
              >
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                </span>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  {user.name ?? user.email}
                </p>
                <p className="text-[10px] text-[var(--text-disabled)] capitalize">
                  {role}
                </p>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
