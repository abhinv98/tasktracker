"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

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
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
    </div>
  );
}
