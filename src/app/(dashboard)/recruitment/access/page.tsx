"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, EmptyState, PageHeader, SkeletonPageHeader, SkeletonTable, useToast } from "@/components/ui";
import { SearchField } from "@/components/ui/Tray";

/**
 * Who can work in recruitment. HR and super admins always can; they hand the
 * hiring trackers and applicants to a brand manager or employee from here.
 */
export default function RecruitmentAccessPage() {
  const people = useQuery(api.hrOps.accessList, {});
  const setAccess = useMutation(api.hrOps.setRecruitAccess);
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  if (people === undefined) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    );
  }

  if (people === null) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState title="Recruitment access is managed by HR" description="Only HR and super admins can change who gets in." />
      </div>
    );
  }

  const needle = search.trim().toLowerCase();
  const shown = people
    .filter((p) => !needle || `${p.name} ${p.email} ${p.designation}`.toLowerCase().includes(needle))
    // People who already have access first, so the page answers "who is in?".
    .sort((a, b) => Number(b.builtIn || b.canRecruit) - Number(a.builtIn || a.canRecruit));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Recruitment Access"
        subtitle="HR and super admins see everything. Switch on anyone else who is hiring: they get the hiring rounds, candidates, interviews, assignments, offers and website applicants, not the dashboard or the HR-only trackers."
      />
      <div className="mb-3">
        <SearchField value={search} onChange={setSearch} placeholder="Search people" label="Search people" />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nobody matches" description="Try a different name." />
      ) : (
        <ul className="max-w-3xl divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)] bg-white">
          {shown.map((p) => (
            <li key={p._id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{p.name}</p>
                <p className="truncate text-[12px] text-[var(--text-muted)]">
                  {[p.designation, p.role === "admin" ? "Brand manager" : "Employee"].filter(Boolean).join(" · ")}
                </p>
              </div>
              {p.builtIn ? (
                <Badge>Always has access</Badge>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.canRecruit}
                  aria-label={`Recruitment access for ${p.name}`}
                  onClick={async () => {
                    try {
                      await setAccess({ userId: p._id, allowed: !p.canRecruit });
                      toast("success", `${p.name} ${p.canRecruit ? "no longer has" : "now has"} recruitment access`);
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Could not change access");
                    }
                  }}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
                    p.canRecruit ? "bg-[var(--accent-employee)]" : "bg-[var(--border-strong)]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${p.canRecruit ? "left-[18px]" : "left-0.5"}`}
                    aria-hidden
                  />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
