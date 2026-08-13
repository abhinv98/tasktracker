"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Teams now lives as a tab inside Users & Teams.
export default function TeamsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/users?tab=teams");
  }, [router]);
  return (
    <div className="p-8">
      <p className="text-[15px] text-[var(--text-secondary)]">
        Redirecting to Users &amp; Teams…
      </p>
    </div>
  );
}
