"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import "./portal-theme.css";

/** Resolves /portal to the signed-in client's own brand portal. */
export default function PortalIndexPage() {
  const user = useQuery(api.users.getCurrentUser);
  const session = useQuery(
    api.clientPortal.getPortalSession,
    user?.role === "client" ? {} : "skip"
  );
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      let token: string | null = null;
      try {
        token = localStorage.getItem("portalToken");
      } catch {}
      router.replace(token ? `/portal/${token}` : "/sign-in");
      return;
    }
    if (user && user.role !== "client") {
      router.replace("/dashboard");
      return;
    }
    if (session?.portalToken) {
      router.replace(`/portal/${session.portalToken}/jsr`);
    }
  }, [user, session, router]);

  return (
    <div className="portal-root min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md px-6 space-y-3">
        <div className="p-shimmer h-4 w-40 mx-auto" />
        <div className="p-shimmer h-9 w-full" />
        <div className="p-shimmer h-9 w-full" />
      </div>
    </div>
  );
}
