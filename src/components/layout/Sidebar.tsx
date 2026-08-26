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
  UserSearch,
  Megaphone,
  Wallet,
  ArrowLeft,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";
import { getDisplayRole } from "@/lib/roles";
import { canAccessPettyCash } from "@/lib/pettyCash";

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
  "/recruitment": UserSearch,
  "/recruitment/candidates": Users2,
  "/recruitment/campaigns": Megaphone,
  "/recruitment/templates": FileBarChart,
  "/recruitment/activity": MessageSquare,
  "/my-requests": Send,
  "/petty-cash": Wallet,
};

interface NavCategory {
  category: string;
  items: {
    href: string;
    label: string;
    superAdminOnly?: boolean;
    /** Money — shown only to the few who are allowed in the ledger. */
    pettyCashOnly?: boolean;
  }[];
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
      { href: "/petty-cash", label: "Petty Cash", pettyCashOnly: true },
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
    items: [
      { href: "/hr-requests", label: "Requests" },
      { href: "/recruitment", label: "Recruitment" },
    ],
  },
  {
    category: "Management",
    items: [
      { href: "/deliverables", label: "Deliverables" },
      { href: "/worklog", label: "Work Log" },
      { href: "/petty-cash", label: "Petty Cash", pettyCashOnly: true },
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

/**
 * Recruitment is its own workspace: once you're inside /recruitment the sidebar
 * becomes recruitment's navigation rather than the whole app's. It earns that
 * because it has five destinations of its own plus a live list of positions —
 * they were previously buttons in a page header, which is not where people
 * look for top-level navigation.
 *
 * The escape hatch at the top is not optional. A nested nav without an obvious
 * way out is how people get stranded.
 */
const RECRUITMENT_NAV: NavCategory[] = [
  {
    category: "Recruitment",
    items: [
      { href: "/recruitment", label: "Overview" },
      { href: "/recruitment/candidates", label: "All Candidates" },
      { href: "/recruitment/campaigns", label: "Campaigns" },
      { href: "/recruitment/templates", label: "Templates" },
      { href: "/recruitment/activity", label: "Email Activity" },
    ],
  },
];

function getIconForRoute(href: string): LucideIcon {
  return ROUTE_ICONS[href] ?? LayoutGrid;
}

export function Sidebar({ user, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const role = user.role ?? "employee";
  const unreadDmCount = useQuery(api.dm.getUnreadTotal) ?? 0;
  const pendingDeliverableCount = useQuery(api.approvals.getPendingDeliverableCount) ?? 0;
  const pendingClientRequestCount = useQuery(api.jsr.countPendingClientRequests) ?? 0;
  const pendingHrRequestCount = useQuery(api.hr.countPending) ?? 0;

  const inRecruitment = pathname.startsWith("/recruitment");
  // HR only for now — superadmins keep backend access but don't see the nav.
  const canRecruit = user.isHR === true;
  // Positions are fetched only inside the workspace — no point paying for the
  // query on every other page in the app.
  const jobs = useQuery(
    api.recruitment.listJobs,
    inRecruitment && canRecruit ? {} : "skip"
  );

  // Oversight lives as a tab inside Work Log (no standalone nav item).
  const baseNav: NavCategory[] =
    inRecruitment && canRecruit
      ? RECRUITMENT_NAV
      : user.isHR === true ? HR_NAV : role === "admin" ? ADMIN_NAV : EMPLOYEE_NAV;
  const nav: NavCategory[] = baseNav
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (i) =>
          (!i.superAdminOnly || user.isSuperAdmin === true) &&
          (!i.pettyCashOnly || canAccessPettyCash(user))
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
          {/* Leaving the workspace has to be the first thing you see. */}
          {inRecruitment && canRecruit && (
            <Link
              href="/dashboard"
              onClick={onClose}
              className="mb-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to workspace
            </Link>
          )}
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
                    font-mono text-[10px] font-medium uppercase tracking-[0.08em]
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
                                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
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
          {/* Live positions — jumping straight to a role is the single most
              common thing HR does in here, so it belongs in the nav rather
              than two clicks deep behind Overview. */}
          {inRecruitment && canRecruit && jobs && jobs.length > 0 && (
            <div className="mb-1 mt-2">
              <div className="px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Positions
              </div>
              <div className="mt-0.5 space-y-0.5">
                {jobs
                  .filter((j) => j.parentSourceId == null)
                  .map((j) => {
                    const href = `/recruitment/${j.sourceId}`;
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={j._id}
                        href={href}
                        onClick={onClose}
                        className={`group flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] transition-colors duration-150 ${
                          isActive
                            ? "bg-[var(--accent-admin-dim)] font-medium text-[var(--accent-admin-text)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <span className="flex-1 truncate">{j.name}</span>
                        {j.moving > 0 ? (
                          <span className="shrink-0 rounded-full bg-[var(--accent-admin-strong)] px-1.5 text-[9px] font-bold text-white">
                            {j.moving}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                            {j.inPlay}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}
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
