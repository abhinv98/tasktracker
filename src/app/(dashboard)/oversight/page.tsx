"use client";

import { Eye } from "lucide-react";
import OversightBoard from "@/components/oversight/OversightBoard";

export default function OversightPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-2">
        <Eye className="h-5 w-5 text-[var(--accent-admin)]" />
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Oversight
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Every task — employee, brand, status, assigning brand manager.
            Open a done task to see its approved work.
          </p>
        </div>
      </div>
      <OversightBoard />
    </div>
  );
}
