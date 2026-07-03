"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { Inbox, Menu } from "lucide-react";
import { PortalSidebar, currentPortalTab } from "@/components/portal/PortalSidebar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const urlToken = params.token as string;
  const user = useQuery(api.users.getCurrentUser);
  const session = useQuery(
    api.clientPortal.getPortalSession,
    user?.role === "client" ? {} : "skip"
  );
  const logEvent = useMutation(api.clientPortal.logPortalEvent);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Logged out: back to this brand's login. Internal users: back to the dashboard.
  useEffect(() => {
    if (user === null) {
      router.replace(`/portal/${urlToken}`);
    } else if (user && user.role !== "client") {
      router.replace("/dashboard");
    }
  }, [user, urlToken, router]);

  // Canonical URL: the signed-in client's own brand slug. Visiting another
  // brand's slug (or a stale one) lands them on their own portal.
  useEffect(() => {
    if (!session?.portalToken || session.portalToken === urlToken) return;
    const tab = currentPortalTab(pathname) ?? "jsr";
    router.replace(`/portal/${session.portalToken}/${tab}`);
  }, [session, urlToken, pathname, router]);

  // Record the login once the authenticated session is up (deduped server-side).
  const loginLogged = useRef(false);
  useEffect(() => {
    if (!session?.portalActive || loginLogged.current) return;
    loginLogged.current = true;
    void logEvent({ action: "login" }).catch(() => {});
  }, [session, logEvent]);

  // Track tab views (deduped server-side)
  useEffect(() => {
    if (user?.role !== "client") return;
    const tab = currentPortalTab(pathname);
    if (tab) {
      void logEvent({ action: "view_tab", details: tab }).catch(() => {});
    }
  }, [pathname, user, logEvent]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Hidden tab guard: bounce to JSR Track if the admin hid the current tab
  useEffect(() => {
    if (!session?.portalToken) return;
    const tab = currentPortalTab(pathname);
    if (tab && tab !== "jsr" && session.hiddenTabs.includes(tab)) {
      router.replace(`/portal/${session.portalToken}/jsr`);
    }
  }, [session, pathname, router]);

  if (user === undefined || (user?.role === "client" && session === undefined)) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
          <p className="text-[13px] text-[#a3a3a3] font-medium">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (user === null || user.role !== "client" || !session) {
    return null;
  }

  // Portal deactivated by the team: block access without deleting the account
  if (!session.portalActive) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8">
          <div className="w-16 h-16 rounded-xl bg-[#fef2f2] flex items-center justify-center mx-auto mb-4">
            <Inbox className="h-8 w-8 text-[#ef4444]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#171717] mb-2">Portal Deactivated</h1>
          <p className="text-[14px] text-[#737373] leading-relaxed mb-5">
            The {session.brand.name} portal is currently deactivated. Please contact your account
            manager for access.
          </p>
          <button
            onClick={() => void signOut()}
            className="px-4 py-2 rounded-lg bg-[#171717] text-white text-[13px] font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const bc = session.brand.color;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: "#f8f8f8" }}>
      <PortalSidebar
        token={session.portalToken ?? urlToken}
        brand={session.brand}
        userName={session.user.name ?? session.user.email ?? "Client"}
        hiddenTabs={session.hiddenTabs}
        pendingCount={session.pendingCounts.clientPending}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="md:ml-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-20 bg-white border-b border-[#e5e5e5]">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg hover:bg-[#f0f0f0] text-[#525252]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: bc + "15" }}
            >
              <span className="font-bold text-[12px]" style={{ color: bc }}>
                {session.brand.name[0]}
              </span>
            </div>
            <p className="font-semibold text-[14px] text-[#171717]">{session.brand.name}</p>
          </div>
        </header>
        <main className="flex-1 min-h-0">{children}</main>
        <footer className="text-center py-6">
          <p className="text-[11px] text-[#d4d4d4]">Powered by Ecultify</p>
        </footer>
      </div>
    </div>
  );
}
