"use client";

import { useState } from "react";
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
  CheckCircle2,
  Tag,
  BarChart3,
  TrendingUp,
  X,
  MessageCircle,
  MessageSquare,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  BookOpen,
  FileBarChart,
  NotebookPen,
  Eye,
  ListTodo,
  UserCog,
  Receipt,
  Inbox,
  LifeBuoy,
  Send,
  type LucideIcon,
} from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";
import { getDisplayRole } from "@/lib/roles";

interface SidebarProps {
  user: Doc<"users">;
  open: boolean;
  onClose: () => void;
}

const ROUTE_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutGrid,
  "/my-tasks": ListTodo,
  "/briefs": Briefcase,
  "/brands-overview": BarChart3,
  "/brands": Tag,
  "/my-brands": Tag,
  "/overview": BarChart3,
  "/analytics": TrendingUp,
  "/discussions": MessageCircle,
  // "/planner": CalendarDays,
  "/messages": MessageSquare,
  "/teams": Users,
  "/users": Users,
  "/archive": Archive,
  "/profile": UserCircle,
  "/deliverables": FileCheck,
  "/approved-work": CheckCircle2,
  "/worklog": ClipboardList,
  "/content-calendar": CalendarRange,
  "/history": BookOpen,
  "/reports": FileBarChart,
  "/notebook": NotebookPen,
  "/oversight": Eye,
  "/freelancers": UserCog,
  "/client-requests": Inbox,
  "/invoices": Receipt,
  "/hr-requests": LifeBuoy,
  "/my-requests": Send,
};

interface NavCategory {
  category: string;
  items: { href: string; label: string; superAdminOnly?: boolean }[];
}

const ADMIN_NAV: NavCategory[] = [
  {
    category: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/my-tasks", label: "My Tasks" },
      { href: "/briefs", label: "Briefs" },
    ],
  },
  {
    category: "Communication",
    items: [
      { href: "/discussions", label: "Discussions" },
      { href: "/messages", label: "Messages" },
    ],
  },
  {
    category: "Planning",
    items: [{ href: "/content-calendar", label: "Content Calendar" }],
  },
  {
    category: "Organization",
    items: [{ href: "/brands-overview", label: "Brands Overview" }],
  },
  {
    category: "Management",
    items: [
      { href: "/client-requests", label: "Client Requests" },
      { href: "/deliverables", label: "Deliverables" },
      { href: "/worklog", label: "Work Log" },
      { href: "/users", label: "Users & Teams" },
      { href: "/freelancers", label: "Freelancers" },
      { href: "/archive", label: "Archive" },
    ],
  },
  {
    category: "Personal",
    items: [
      { href: "/notebook", label: "My Notebook" },
      { href: "/my-requests", label: "My Requests" },
    ],
  },
  {
    category: "Account",
    items: [{ href: "/profile", label: "Profile" }],
  },
];

// HR (role "admin" + isHR) — the brand-manager view stripped of brand work:
// no content calendar, no brands overview, no client requests.
const HR_NAV: NavCategory[] = [
  {
    category: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/my-tasks", label: "My Tasks" },
      { href: "/briefs", label: "Briefs" },
    ],
  },
  {
    category: "People",
    items: [{ href: "/hr-requests", label: "Requests" }],
  },
  {
    category: "Management",
    items: [
      { href: "/deliverables", label: "Deliverables" },
      { href: "/worklog", label: "Work Log" },
      { href: "/users", label: "Users & Teams" },
      { href: "/freelancers", label: "Freelancers" },
    ],
  },
  {
    category: "Personal",
    items: [{ href: "/notebook", label: "My Notebook" }],
  },
  {
    category: "Account",
    items: [{ href: "/profile", label: "Profile" }],
  },
];

const EMPLOYEE_NAV: NavCategory[] = [
  {
    category: "Work",
    items: [
      { href: "/dashboard", label: "Queue" },
      { href: "/history", label: "History" },
    ],
  },
  {
    category: "Communication",
    items: [
      { href: "/discussions", label: "Discussions" },
      { href: "/messages", label: "Messages" },
    ],
  },
  {
    category: "Planning",
    items: [{ href: "/content-calendar", label: "Content Calendar" }],
  },
  {
    category: "Organization",
    items: [{ href: "/my-brands", label: "Brands" }],
  },
  {
    category: "Management",
    items: [{ href: "/deliverables", label: "Deliverables" }],
  },
  {
    category: "Personal",
    items: [{ href: "/my-requests", label: "My Requests" }],
  },
  {
    category: "Account",
    items: [{ href: "/profile", label: "Profile" }],
  },
];

function getIconForRoute(href: string): LucideIcon {
  return ROUTE_ICONS[href] ?? LayoutGrid;
}

export function Sidebar({ user, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const role = user.role ?? "employee";
  const unreadDmCount = useQuery(api.dm.getUnreadTotal) ?? 0;
  const pendingCalendarCount = useQuery(api.contentCalendar.getPendingCalendarTaskCount) ?? 0;
  const pendingDeliverableCount = useQuery(api.approvals.getPendingDeliverableCount) ?? 0;
  const pendingClientRequestCount = useQuery(api.jsr.countPendingClientRequests) ?? 0;
  const pendingHrRequestCount = useQuery(api.hr.countPending) ?? 0;

  // Oversight lives as a tab inside Work Log (no standalone nav item).
  const baseNav: NavCategory[] =
    user.isHR === true ? HR_NAV : role === "admin" ? ADMIN_NAV : EMPLOYEE_NAV;
  const nav: NavCategory[] = baseNav
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (i) => !i.superAdminOnly || user.isSuperAdmin === true
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  // All categories open by default
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(nav.map((c) => c.category))
  );

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

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
          fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-[var(--border)] bg-white
          transition-transform duration-200 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="flex shrink-0 items-center justify-between h-14 border-b border-[var(--border)] px-5">
          <div className="flex items-center flex-1 min-w-0">
            <img src="/ecultify.png" alt="Ecultify" className="w-full h-auto object-contain" />
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav with categories */}
        <nav className="flex flex-1 flex-col py-2 overflow-y-auto px-3">
          {nav.map((group) => {
            const isOpen = openCategories.has(group.category);
            const hasActiveItem = group.items.some(
              (item) => pathname === item.href || pathname.startsWith(item.href + "/")
            );

            return (
              <div key={group.category} className="mb-1">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(group.category)}
                  className={`
                    w-full flex items-center justify-between px-2 py-1.5 rounded-md
                    text-[11px] font-semibold uppercase tracking-wider
                    transition-colors duration-150
                    ${hasActiveItem && !isOpen
                      ? "text-[var(--accent-admin-text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }
                  `}
                >
                  <span>{group.category}</span>
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>

                {/* Category items */}
                {isOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => {
                      const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
                      const Icon = getIconForRoute(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className={`
                            group flex items-center gap-2.5 rounded-md px-3 py-1.5 relative
                            font-medium text-[13px] transition-colors duration-150
                            ${
                              isActive
                                ? "bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-[var(--accent-admin)]"
                                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            }
                          `}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
                              isActive
                                ? ""
                                : "group-hover:text-[var(--accent-admin-text)]"
                            }`}
                          />
                          <span className="flex-1">{item.label}</span>
                          {item.href === "/messages" && unreadDmCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold px-1">
                              {unreadDmCount}
                            </span>
                          )}
                          {item.href === "/content-calendar" && pendingCalendarCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold px-1">
                              {pendingCalendarCount}
                            </span>
                          )}
                          {item.href === "/deliverables" && pendingDeliverableCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-purple-500 text-white text-[11px] font-bold px-1">
                              {pendingDeliverableCount}
                            </span>
                          )}
                          {item.href === "/hr-requests" && pendingHrRequestCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold px-1">
                              {pendingHrRequestCount}
                            </span>
                          )}
                          {item.href === "/client-requests" && pendingClientRequestCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold px-1">
                              {pendingClientRequestCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--border)]">
          <div className="py-3 px-5">
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {user.name ?? user.email}
            </p>
            <p className="text-[11px] text-[var(--text-disabled)] capitalize">
              {getDisplayRole(user)}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
