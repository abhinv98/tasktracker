"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { tabsFor } from "@/lib/recruitNav";

/** A section's screens as tabs, so the sidebar needs one line for all of them. */
export default function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useQuery(api.users.getCurrentUser);
  const tabs = tabsFor(pathname, me?.isHR === true || me?.isSuperAdmin === true);
  return (
    <>
      {tabs.length > 1 && (
        <nav aria-label="Section" className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-white px-4 sm:px-8">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex h-11 shrink-0 items-center border-b-2 px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-admin)] ${
                  active
                    ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </>
  );
}
