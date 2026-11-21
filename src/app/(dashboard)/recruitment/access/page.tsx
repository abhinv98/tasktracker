"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, PageHeader, SkeletonPageHeader, SkeletonTable, useToast } from "@/components/ui";
import { SearchField, Tray, TrayItem } from "@/components/ui/Tray";

/**
 * Who can work in recruitment, position by position. HR and super admins see
 * everything; anyone else sees only the positions ticked for them here.
 */
export default function RecruitmentAccessPage() {
  const data = useQuery(api.hrOps.accessList, {});
  const setAccess = useMutation(api.hrOps.setRecruitAccess);
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  if (data === undefined) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState title="Recruitment access is managed by HR" description="Only HR and super admins can change who gets in." />
      </div>
    );
  }

  const { positions, people } = data;
  const needle = search.trim().toLowerCase();
  const shown = people
    .filter((p) => !needle || `${p.name} ${p.email} ${p.designation}`.toLowerCase().includes(needle))
    // People who already have access first, so the page answers "who is in?".
    .sort((a, b) => Number(b.builtIn || b.jobs.length > 0) - Number(a.builtIn || a.jobs.length > 0));

  async function toggle(person: { _id: Id<"users">; name: string; jobs: number[] }, id: number, name: string) {
    const has = person.jobs.includes(id);
    try {
      await setAccess({ userId: person._id, jobSourceId: id, allowed: !has });
      toast("success", has ? `${person.name} no longer sees ${name}` : `${person.name} can now work on ${name}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not change access");
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Recruitment Access"
        subtitle="HR and super admins see everything. Give anyone else the positions they are hiring for: in Recruitment they see those positions' applicants and hiring rounds, and nothing else."
      />
      <div className="mb-3">
        <SearchField value={search} onChange={setSearch} placeholder="Search people" label="Search people" />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nobody matches" description="Try a different name." />
      ) : (
        <ul className="max-w-4xl divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)] bg-white">
          {shown.map((p) => (
            <li key={p._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="min-w-[180px] flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{p.name}</p>
                <p className="truncate text-[12px] text-[var(--text-muted)]">
                  {[p.designation, p.role === "admin" ? "Brand manager" : "Employee"].filter(Boolean).join(" · ")}
                </p>
              </div>
              {p.builtIn ? (
                <Badge>Sees every position</Badge>
              ) : (
                <>
                  <div className="flex flex-wrap justify-end gap-1">
                    {p.jobs.map((id) => (
                      <Badge key={id} variant="employee">
                        {positions.find((x) => x.id === id)?.name ?? "Removed position"}
                      </Badge>
                    ))}
                  </div>
                  <Tray
                    label={p.jobs.length ? "Positions" : "Give access"}
                    active={p.jobs.length > 0}
                    title={`Positions for ${p.name}`}
                    width="w-64"
                    align="end"
                  >
                    {positions.map((pos) => (
                      <TrayItem
                        key={pos.id}
                        label={pos.name}
                        active={p.jobs.includes(pos.id)}
                        closeOnSelect={false}
                        onSelect={() => toggle(p, pos.id, pos.name)}
                      />
                    ))}
                  </Tray>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
