"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  SkeletonPageHeader,
  SkeletonList,
} from "@/components/ui";
import { Megaphone, ArrowLeft, ChevronRight } from "lucide-react";

function fmt(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "2-digit",
  });
}

export default function RecruitmentCampaignsPage() {
  const campaigns = useQuery(api.recruitment.listCampaigns, {});

  if (campaigns === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonList rows={5} what="campaigns" />
      </div>
    );
  }

  const open = campaigns.filter((c) => c.isOpen);
  const closed = campaigns.filter((c) => !c.isOpen);

  function Row({ c }: { c: NonNullable<typeof campaigns>[number] }) {
    return (
      <Link
        href={`/recruitment/campaigns/${c._id}`}
        className="group flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[13px] text-[var(--text-primary)]">
              {c.name || "Untitled campaign"}
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)]">
              {c.jobName}
            </span>
            {c.source === "manual" && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]">
                Manual
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            Started {fmt(c.startDate)}
            {c.endDate ? ` · closed ${fmt(c.endDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-[12px] tabular-nums">
          <span className="text-[var(--text-secondary)]">
            {c.memberCount} {c.memberCount === 1 ? "person" : "people"}
          </span>
          {c.sent > 0 && (
            <span className="text-[var(--accent-employee-text)]">{c.sent} sent</span>
          )}
          {c.failed > 0 && (
            <span className="text-[var(--danger)]">{c.failed} failed</span>
          )}
          <ChevronRight
            size={15}
            className="text-[var(--text-disabled)] group-hover:text-[var(--accent-admin-text)] group-hover:translate-x-0.5 transition-all"
          />
        </div>
      </Link>
    );
  }

  return (
    <div className="p-8">
      <Link
        href="/recruitment"
        className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={13} />
        Recruitment
      </Link>

      <PageHeader
        title="Campaigns"
        subtitle="Saved groups of candidates you can mail together"
        icon={Megaphone}
      />

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">
            No campaigns yet
          </p>
          <p className="text-[13px] text-[var(--text-muted)] mt-1 max-w-[380px]">
            Open a position, tick the candidates you want, and choose
            “Add to campaign”. You can mail the whole group from here afterwards.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {open.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Open
              </h2>
              <div className="flex flex-col gap-2">
                {open.map((c) => <Row key={c._id} c={c} />)}
              </div>
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Closed
              </h2>
              <div className="flex flex-col gap-2 opacity-70">
                {closed.map((c) => <Row key={c._id} c={c} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
