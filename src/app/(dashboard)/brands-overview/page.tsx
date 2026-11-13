"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tag, BarChart3, TrendingUp } from "lucide-react";
import { PageHeader, SegmentedTabs } from "@/components/ui";
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
      <PageHeader
        title="Brands Overview"
        subtitle="Brands, work data, and workspace analytics."
      />

      <div className="mb-4">
        <SegmentedTabs
          value={tab}
          onChange={goTab}
          options={[
            { value: "brands", label: "Brands", icon: Tag },
            { value: "work-data", label: "Work Data", icon: BarChart3 },
            { value: "analytics", label: "Analytics", icon: TrendingUp },
          ]}
        />
      </div>

      {tab === "brands" && <BrandsTab />}
      {tab === "work-data" && <WorkDataTab />}
      {tab === "analytics" && <AnalyticsTab />}
    </div>
  );
}
