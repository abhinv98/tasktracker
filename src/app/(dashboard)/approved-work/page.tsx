"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Approved Work is now shown inside Oversight — open a done task row there
// to see its approved work.
export default function ApprovedWorkRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/oversight");
  }, [router]);
  return (
    <div className="p-8">
      <p className="text-[15px] text-[var(--text-secondary)]">
        Redirecting to Oversight…
      </p>
    </div>
  );
}
