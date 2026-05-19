"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Brand Overview is now the "Work Data" tab inside Brands Overview.
export default function OverviewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/brands-overview?tab=work-data");
  }, [router]);
  return (
    <div className="p-8">
      <p className="text-[14px] text-[var(--text-secondary)]">
        Redirecting to Brands Overview…
      </p>
    </div>
  );
}
