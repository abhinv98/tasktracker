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
  | "monthly-log"
  | "pending-client"
  | "pending-agency"
  | "feedback";

export const PORTAL_TABS: {
  key: PortalTabKey;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "jsr", label: "JSR Track", href: "/portal/jsr", icon: LayoutDashboard },
  { key: "calendar", label: "Content Calendar", href: "/portal/calendar", icon: CalendarDays },
  { key: "deck", label: "Client Deck", href: "/portal/deck", icon: Presentation },
  { key: "new-task", label: "New Task", href: "/portal/new-task", icon: Plus },
  { key: "monthly-log", label: "Monthly Log", href: "/portal/monthly-log", icon: ClipboardList },
  { key: "pending-client", label: "Your Pending Work", href: "/portal/pending-client", icon: Inbox },
  { key: "pending-agency", label: "Ecultify Pending Work", href: "/portal/pending-agency", icon: Activity },
  { key: "feedback", label: "Feedback Log", href: "/portal/feedback", icon: MessageSquareText },
];

export function PortalSidebar({
  brand,
  userName,
  hiddenTabs,
  pendingCount,
  open,
  onClose,
}: {
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

  const tabs = PORTAL_TABS.filter((t) => t.key === "jsr" || !hiddenTabs.includes(t.key));

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-[#e5e5e5] overflow-hidden">
      {/* Brand header */}
      <div className="px-5 pt-6 pb-5 border-b border-[#f0f0f0]">
        <div className="flex items-center gap-3">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="w-10 h-10 rounded-lg object-cover border border-[#e5e5e5]"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: bc + "15" }}
            >
              <span className="font-bold text-[16px]" style={{ color: bc }}>
                {brand.name[0]}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] text-[#171717] truncate">{brand.name}</p>
            <p className="text-[11px] text-[#a3a3a3] font-medium">Client Portal</p>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg hover:bg-[#f0f0f0] text-[#a3a3a3]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          const badge = tab.key === "pending-client" && pendingCount > 0 ? pendingCount : null;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              onClick={onClose}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-w-0 ${
                active ? "text-white" : "text-[#525252] hover:bg-[#f5f5f5]"
              }`}
              style={active ? { backgroundColor: bc } : {}}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">{tab.label}</span>
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
      <div className="px-5 py-4 border-t border-[#f0f0f0]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
            style={{ backgroundColor: bc }}
          >
            {userName[0]?.toUpperCase() ?? "C"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[#171717] truncate">{userName}</p>
          </div>
          <button
            onClick={() => void signOut()}
            title="Sign out"
            className="p-2 rounded-lg hover:bg-[#f5f5f5] text-[#a3a3a3] hover:text-[#171717] transition-colors"
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
