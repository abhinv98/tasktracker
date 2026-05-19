"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Brands now lives as a tab inside Brands Overview.
export default function BrandsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const filter = searchParams.get("filter");
    router.replace(
      `/brands-overview${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`
    );
  }, [router, searchParams]);
  return (
    <div className="p-8">
      <p className="text-[14px] text-[var(--text-secondary)]">
        Redirecting to Brands Overview…
      </p>
    </div>
  );
}
