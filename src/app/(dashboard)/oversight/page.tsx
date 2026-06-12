"use client";

import { Eye } from "lucide-react";
import { PageHeader } from "@/components/ui";
import OversightBoard from "@/components/oversight/OversightBoard";

export default function OversightPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Oversight"
        icon={Eye}
        subtitle="Every task — employee, brand, status, assigning brand manager. Open a done task to see its approved work."
      />
      <OversightBoard />
    </div>
  );
}
