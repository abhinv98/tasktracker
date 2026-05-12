import {
  LayoutGrid,
  Briefcase,
  Tag,
  BarChart3,
  TrendingUp,
  MessageCircle,
  MessageSquare,
  Users,
  Shield,
  Archive,
  UserCircle,
  FileCheck,
  CheckCircle2,
  ClipboardList,
  CalendarRange,
  BookOpen,
  FileBarChart,
  Bell,
  Search,
  type LucideIcon,
} from "lucide-react";

type Role = "admin" | "manager" | "employee";

interface NavItem {
  label: string;
  route: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { label: "Dashboard", route: "/dashboard", icon: LayoutGrid },
  { label: "Briefs", route: "/briefs", icon: Briefcase },
  { label: "Brands", route: "/brands", icon: Tag },
  { label: "Overview", route: "/overview", icon: BarChart3 },
  { label: "Analytics", route: "/analytics", icon: TrendingUp },
  { label: "Discussions", route: "/discussions", icon: MessageCircle },
  { label: "Messages", route: "/messages", icon: MessageSquare },
  { label: "Teams", route: "/teams", icon: Users },
  { label: "Users", route: "/users", icon: Shield },
  { label: "Deliverables", route: "/deliverables", icon: FileCheck },
  { label: "Approved Work", route: "/approved-work", icon: CheckCircle2 },
  { label: "Worklog", route: "/worklog", icon: ClipboardList },
  { label: "Content Calendar", route: "/content-calendar", icon: CalendarRange },
  { label: "History", route: "/history", icon: BookOpen },
  { label: "Reports", route: "/reports", icon: FileBarChart },
  { label: "Archive", route: "/archive", icon: Archive },
  { label: "Profile", route: "/profile", icon: UserCircle },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Brand Manager",
  employee: "Team Member",
};

const ROLE_ACCENT: Record<Role, string> = {
  admin: "var(--accent-admin)",
  manager: "var(--accent-manager)",
  employee: "var(--accent-employee)",
};

export function AppShell({
  active,
  user,
  children,
  pageTitle,
}: {
  active: string;
  user: { name: string; role: Role; initial?: string };
  children: React.ReactNode;
  pageTitle?: string;
}) {
  const accent = ROLE_ACCENT[user.role];
  return (
    <div className="w-full h-full flex" style={{ background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside
        className="w-[240px] h-full flex flex-col border-r"
        style={{ background: "#FFFFFF", borderColor: "var(--border)" }}
      >
        <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-[14px]"
              style={{ background: "var(--accent-admin)" }}
            >
              T
            </div>
            <div>
              <p className="font-bold text-[14px] text-[var(--text-primary)] leading-tight">
                The Orchestrator
              </p>
              <p className="text-[10px] text-[var(--text-muted)] leading-tight">
                Task Tracker
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-hidden px-2 py-3 space-y-0.5">
          {NAV.map(({ label, route, icon: Icon }) => {
            const isActive = active === route;
            return (
              <div
                key={route}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors"
                style={{
                  background: isActive ? "var(--bg-hover)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={{ color: isActive ? accent : "var(--text-muted)" }}
                />
                <span>{label}</span>
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <div
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg"
            style={{ background: "var(--bg-hover)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[12px] shrink-0"
              style={{ background: accent }}
            >
              {user.initial ?? user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">
                {ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <header
          className="h-14 shrink-0 flex items-center justify-between px-6 border-b"
          style={{ background: "#FFFFFF", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {pageTitle && (
              <h1 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                {pageTitle}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px]"
              style={{
                background: "var(--bg-hover)",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <span
                className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{ background: "#FFFFFF", color: "var(--text-muted)" }}
              >
                ⌘K
              </span>
            </div>
            <button
              className="p-2 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden relative">{children}</main>
      </div>
    </div>
  );
}
