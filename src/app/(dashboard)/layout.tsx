"use client";

import { useQuery } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { useNavDepthTracker } from "@/lib/useSmartBack";

// Note: /oversight is gated server-side by oversight access (super-admins,
// oversight admins, brand managers, and team leads). Don't list it here or
// employee team leads get bounced.
const ADMIN_ONLY_ROUTES = ["/users", "/worklog", "/reports", "/notebook", "/my-tasks", "/freelancers"];
const MANAGER_OR_ADMIN_ROUTES = ["/teams", "/archive", "/analytics", "/brands-overview"];
const SUPERADMIN_ONLY_ROUTES = ["/invoices"];
const HR_HIDDEN_ROUTES = ["/content-calendar", "/brands-overview", "/client-requests"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Track in-app navigation so back buttons know whether history holds one of
  // our pages (forward navs increment, back/forward traversals decrement,
  // full page load resets).
  useNavDepthTracker(pathname);

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (user === null) {
      router.replace("/sign-in");
    }
  }, [user, router]);

  // Role-based route protection
  useEffect(() => {
    if (!user) return;
    const role = user.role ?? "employee";

    // Portal client accounts never see the internal dashboard
    if (role === "client") {
      router.replace("/portal");
      return;
    }

    if (
      role !== "admin" &&
      ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r))
    ) {
      router.replace("/dashboard");
    }
    if (
      role === "employee" &&
      MANAGER_OR_ADMIN_ROUTES.some((r) => pathname.startsWith(r))
    ) {
      router.replace("/dashboard");
    }
    if (
      user.isSuperAdmin !== true &&
      SUPERADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r))
    ) {
      router.replace("/dashboard");
    }
    if (user.isHR !== true && pathname.startsWith("/hr-requests")) {
      router.replace("/dashboard");
    }
    // HR's view is deliberately stripped of brand work.
    if (
      user.isHR === true &&
      HR_HIDDEN_ROUTES.some((r) => pathname.startsWith(r))
    ) {
      router.replace("/dashboard");
    }
  }, [user, pathname, router]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger in input fields
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Cmd+K or Ctrl+K = search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      // Escape = close panels
      if (e.key === "Escape") {
        if (searchOpen) setSearchOpen(false);
        return;
      }

      // "/" = open search
      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
    },
    [searchOpen]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <p className="text-[14px] font-medium text-[var(--text-secondary)]">
          Loading...
        </p>
      </div>
    );
  }

  if (user === null || user.role === "client") {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      <Sidebar
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 ml-0 md:ml-60">

        <TopBar
          user={user}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          onSearchClick={() => setSearchOpen(true)}
        />
        <main className="flex-1 overflow-auto min-h-0">{children}</main>
      </div>

      {/* Command Palette */}
      <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

    </div>
  );
}
