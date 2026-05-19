"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tag, BarChart3, TrendingUp } from "lucide-react";
import BrandsTab from "@/components/brandsOverview/BrandsTab";
import WorkDataTab from "@/components/brandsOverview/WorkDataTab";
import AnalyticsTab from "@/components/brandsOverview/AnalyticsTab";

type Tab = "brands" | "work-data" | "analytics";

export default function BrandsOverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const tab: Tab =
    param === "work-data" || param === "analytics" ? param : "brands";

  const goTab = (t: Tab) => {
    // Preserve ?filter=mine for the brands tab deep-link.
    const filter = searchParams.get("filter");
    const qp = new URLSearchParams();
    if (t !== "brands") qp.set("tab", t);
    if (t === "brands" && filter) qp.set("filter", filter);
    const qs = qp.toString();
    router.replace(`/brands-overview${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
          Brands Overview
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Brands, work data, and workspace analytics.
        </p>
      </div>

      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] w-fit mb-6">
        {(
          [
            { key: "brands", label: "Brands", icon: Tag },
            { key: "work-data", label: "Work Data", icon: BarChart3 },
            { key: "analytics", label: "Analytics", icon: TrendingUp },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => goTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              tab === key
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "brands" && <BrandsTab />}
      {tab === "work-data" && <WorkDataTab />}
      {tab === "analytics" && <AnalyticsTab />}
    </div>
  );
}
