"use client";

import { useQuery } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatPanel } from "@/components/chat/ChatPanel";

const ADMIN_ONLY_ROUTES = ["/users"];
const MANAGER_OR_ADMIN_ROUTES = ["/teams", "/archive"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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
  }, [user, pathname, router]);

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <p className="text-[14px] font-medium text-[var(--text-secondary)]">
          Loading...
        </p>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      <Sidebar
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <div
        className={`flex-1 flex flex-col min-w-0 ml-0 transition-[margin] duration-200 ease-in-out ${
          collapsed ? "md:ml-[68px]" : "md:ml-60"
        }`}
      >
        <TopBar user={user} onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* AI Chat */}
      <ChatBubble isOpen={chatOpen} onClick={() => setChatOpen(!chatOpen)} />
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
