"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AudioLines,
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
import { RECRUIT_SECTIONS, inSection } from "@/lib/recruitNav";

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
  "/recruitment/overview": BarChart3,
  "/recruitment/applicants": Inbox,
  "/recruitment/t/pipeline": Users2,
  "/recruitment/campaigns": Megaphone,
  "/recruitment/t/projects": FileBarChart,
  "/my-requests": Send,
  "/petty-cash": Wallet,
  "/meetings": AudioLines,
};

interface NavCategory {
  category: string;
  items: {
    href: string;
    label: string;
    superAdminOnly?: boolean;
    /** Money — shown only to the few who are allowed in the ledger. */
    pettyCashOnly?: boolean;
    /** Shown to anyone who may work in recruitment (HR, super admins, delegates). */
    recruitOnly?: boolean;
    /** Inside recruitment: HR and super admins only, not delegates. */
    recruitFullOnly?: boolean;
    /** Is this the current place? For an item that stands for several pages (its tabs). */
    active?: (path: string) => boolean;
    /** Active on its own address only, not on the pages beneath it. */
    exact?: boolean;
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
      { href: "/meetings", label: "Meetings" },
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
      { href: "/recruitment", label: "Recruitment", recruitOnly: true },
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
    items: [
      { href: "/notebook", label: "My Notebook" },
      { href: "/meetings", label: "Meetings" },
    ],
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
      { href: "/meetings", label: "Meetings" },
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
    items: [
      { href: "/deliverables", label: "Deliverables" },
      { href: "/recruitment", label: "Recruitment", recruitOnly: true },
    ],
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

// An outside reviewer's account (users.isReviewer): only what works for them.
const REVIEWER_NAV: NavCategory[] = [
  { category: "Work", items: [{ href: "/dashboard", label: "Dashboard" }] },
  { category: "Communication", items: [{ href: "/meetings", label: "Meetings" }] },
  { category: "Account", items: [{ href: "/profile", label: "Profile" }] },
];

/**
 * Recruitment is its own workspace: once you're inside /recruitment the sidebar
 * becomes recruitment's navigation rather than the whole app's. It earns that
 * because it has destinations of its own — they were previously buttons in a
 * page header, which is not where people look for top-level navigation.
 *
 * The escape hatch at the top is not optional. A nested nav without an obvious
 * way out is how people get stranded.
 */
const RECRUITMENT_NAV: NavCategory[] = [
  {
    category: "Recruitment",
    items: RECRUIT_SECTIONS.map((s) => ({
      href: s.href,
      label: s.label,
      recruitFullOnly: s.fullOnly,
      active: (path: string) => inSection(s, path),
    })),
  },
];

const isCurrent = (item: NavCategory["items"][number], path: string) =>
  item.active ? item.active(path) : path === item.href || (!item.exact && path.startsWith(item.href + "/"));

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
  // HR and super admins see all of recruitment; anyone they gave positions to
  // (recruitJobs) sees those positions only. The backend checks the same.
  const recruitFull = user.isHR === true || user.isSuperAdmin === true;
  const canRecruit = recruitFull || !!user.recruitJobs?.length;
  // Oversight lives as a tab inside Work Log (no standalone nav item).
  const baseNav: NavCategory[] =
    inRecruitment && canRecruit
      ? RECRUITMENT_NAV
      : user.isReviewer === true
        ? REVIEWER_NAV
        : user.isHR === true ? HR_NAV : role === "admin" ? ADMIN_NAV : EMPLOYEE_NAV;
  const nav: NavCategory[] = baseNav
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (i) =>
          (!i.superAdminOnly || user.isSuperAdmin === true) &&
          (!i.pettyCashOnly || canAccessPettyCash(user)) &&
          (!i.recruitOnly || canRecruit) &&
          (!i.recruitFullOnly || recruitFull)
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  // Track the collapsed categories, not the open ones, so those from a nav set
  // swapped in later (e.g. Recruitment) also start open.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
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
            <img src="/ecultify.png" alt="Ecultify" className="h-8 w-auto max-w-full object-contain" />
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav with categories */}
        <nav className="flex flex-1 flex-col py-1 overflow-y-auto px-2.5">
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
            const isOpen = !collapsedCategories.has(group.category);
            const hasActiveItem = group.items.some(
              (item) => isCurrent(item, pathname)
            );

            return (
              <div key={group.category} className="mb-1">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(group.category)}
                  className={`
                    w-full flex items-center justify-between px-2.5 pt-3 pb-1 rounded-md
                    text-[12px] font-medium
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
                      const isActive = isCurrent(item, pathname);
                      const Icon = getIconForRoute(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className={`
                            group flex items-center gap-2.5 rounded-md h-8 px-2.5 relative
                            text-[13px] transition-colors duration-150
                            ${
                              isActive
                                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium"
                                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            }
                          `}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
                              isActive
                                ? "text-[var(--text-primary)]"
                                : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                            }`}
                          />
                          <span className="flex-1">{item.label}</span>
                          {item.href === "/messages" && unreadDmCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#c4242a] text-white text-[11px] font-semibold px-1 tabular-nums">
                              {unreadDmCount}
                            </span>
                          )}
                          {item.href === "/deliverables" && pendingDeliverableCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#c4242a] text-white text-[11px] font-semibold px-1 tabular-nums">
                              {pendingDeliverableCount}
                            </span>
                          )}
                          {item.href === "/hr-requests" && pendingHrRequestCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#c4242a] text-white text-[11px] font-semibold px-1 tabular-nums">
                              {pendingHrRequestCount}
                            </span>
                          )}
                          {item.href === "/client-requests" && pendingClientRequestCount > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#c4242a] text-white text-[11px] font-semibold px-1 tabular-nums">
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
