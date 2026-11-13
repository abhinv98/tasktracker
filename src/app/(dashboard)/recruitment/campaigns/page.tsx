"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
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
        className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-primary)] transition-colors focus-visible:outline-offset-[-2px]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[14px] text-[var(--text-primary)]">
              {c.name || "Untitled campaign"}
            </span>
            <Badge>{c.jobName}</Badge>
            {c.source === "manual" && <Badge>Manual</Badge>}
          </div>
          <p className="mt-0.5 text-[12px] tabular-nums text-[var(--text-muted)]">
            Started {fmt(c.startDate)}
            {c.endDate ? ` · closed ${fmt(c.endDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-[12px] tabular-nums">
          <span className="text-[var(--text-secondary)]">
            {c.memberCount} {c.memberCount === 1 ? "person" : "people"}
          </span>
          {c.sent > 0 && (
            <span className="text-[var(--text-secondary)]">{c.sent} sent</span>
          )}
          {c.failed > 0 && (
            <span className="text-[var(--danger)]">{c.failed} failed</span>
          )}
          <ChevronRight
            size={15}
            className="text-[var(--text-disabled)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-[color,transform]"
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
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Open a position, tick the candidates you want, and choose “Add to campaign”. You can mail the whole group from here afterwards."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {open.length > 0 && (
            <Panel title="Open" count={open.length}>
              <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
                {open.map((c) => <Row key={c._id} c={c} />)}
              </div>
            </Panel>
          )}
          {closed.length > 0 && (
            <Panel title="Closed" count={closed.length}>
              <div className="flex flex-col divide-y divide-[var(--border-subtle)] opacity-70">
                {closed.map((c) => <Row key={c._id} c={c} />)}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
