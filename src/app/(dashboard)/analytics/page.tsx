"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Analytics is now a tab inside Brands Overview.
export default function AnalyticsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/brands-overview?tab=analytics");
  }, [router]);
  return (
    <div className="p-8">
      <p className="text-[14px] text-[var(--text-secondary)]">
        Redirecting to Brands Overview…
      </p>
    </div>
  );
}
