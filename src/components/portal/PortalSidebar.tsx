"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessageSquareText,
  Plus,
  Presentation,
  X,
} from "lucide-react";

export type PortalTabKey =
  | "jsr"
  | "calendar"
  | "deck"
  | "new-task"
  | "messages"
  | "monthly-log"
  | "pending-client"
  | "pending-agency"
  | "feedback";

export const PORTAL_TABS: {
  key: PortalTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "jsr", label: "JSR Track", icon: LayoutDashboard },
  { key: "calendar", label: "Content Calendar", icon: CalendarDays },
  { key: "deck", label: "Client Deck", icon: Presentation },
  { key: "new-task", label: "New Task", icon: Plus },
  { key: "messages", label: "Messages", icon: MessageCircle },
  { key: "monthly-log", label: "Monthly Log", icon: ClipboardList },
  { key: "pending-client", label: "Your Pending Work", icon: Inbox },
  { key: "pending-agency", label: "Ecultify Pending Work", icon: Activity },
  { key: "feedback", label: "Feedback Log", icon: MessageSquareText },
];

/** The tab segment of /portal/{token}/{segment}. */
export function currentPortalTab(pathname: string): PortalTabKey | null {
  const seg = pathname.split("/")[3];
  return PORTAL_TABS.some((t) => t.key === seg) ? (seg as PortalTabKey) : null;
}

export function PortalSidebar({
  token,
  brand,
  userName,
  hiddenTabs,
  pendingCount,
  open,
  onClose,
}: {
  token: string;
  brand: { name: string; color: string; logoUrl: string | null };
  userName: string;
  hiddenTabs: string[];
  pendingCount: number;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const bc = brand.color;
  const activeTab = currentPortalTab(pathname);

  const tabs = PORTAL_TABS.filter((t) => t.key === "jsr" || !hiddenTabs.includes(t.key));

  // Visible label only — keys and routes stay unchanged.
  const tabLabel = (key: PortalTabKey, label: string) =>
    key === "pending-agency" ? `With the ${brand.name} team` : label;

  const content = (
    <div className="flex flex-col h-full bg-[var(--p-surface)] border-r border-[var(--p-border)] overflow-hidden">
      {/* Brand header */}
      <div className="px-5 pt-6 pb-5 border-b border-[var(--p-border)]">
        <div className="flex items-center gap-3">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="w-10 h-10 rounded-[var(--p-radius-md)] object-cover border border-[var(--p-border)]"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-[var(--p-radius-md)] flex items-center justify-center"
              style={{ backgroundColor: "var(--p-brand-soft)" }}
            >
              <span className="font-bold text-[16px]" style={{ color: bc }}>
                {brand.name[0]}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="p-section truncate">{brand.name}</p>
            <p className="p-overline">Client portal</p>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)] text-[var(--p-text-3)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          const badge = tab.key === "pending-client" && pendingCount > 0 ? pendingCount : null;
          return (
            <Link
              key={tab.key}
              href={`/portal/${token}/${tab.key}`}
              onClick={onClose}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--p-radius-sm)] text-[13px] font-medium min-w-0 ${
                active ? "text-white" : "text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)]"
              }`}
              style={active ? { backgroundColor: bc } : {}}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">{tabLabel(tab.key, tab.label)}</span>
              {badge !== null && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                    active ? "bg-white/25 text-white" : "text-white"
                  }`}
                  style={active ? {} : { backgroundColor: bc }}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-5 py-4 border-t border-[var(--p-border)]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
            style={{ backgroundColor: bc }}
          >
            {userName[0]?.toUpperCase() ?? "C"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[var(--p-text)] truncate">{userName}</p>
          </div>
          <button
            onClick={() => void signOut()}
            title="Sign out"
            className="p-2 rounded-[var(--p-radius-sm)] hover:bg-[var(--p-surface-2)] text-[var(--p-text-3)] hover:text-[var(--p-text)]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:block fixed left-0 top-0 h-full w-64 z-30">{content}</aside>
      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />
          <aside className="fixed left-0 top-0 h-full w-72 max-w-[85vw] z-50 md:hidden">{content}</aside>
        </>
      )}
    </>
  );
}
