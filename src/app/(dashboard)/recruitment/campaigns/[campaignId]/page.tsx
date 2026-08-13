"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  Button,
  Modal,
  Select,
  StatusBadge,
  ConfirmModal,
  SkeletonPageHeader,
  SkeletonTable,
  useToast,
} from "@/components/ui";
import {
  Megaphone, ArrowLeft, Mail, FileText, ExternalLink, UserMinus, Check, RotateCcw,
} from "lucide-react";

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "#059669" },
  on_hold: { label: "On Hold", color: "#d97706" },
  non_active: { label: "Non Active", color: "#6b7280" },
  rejected: { label: "Rejected", color: "#b91c1c" },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.campaignId as Id<"recruitCampaigns">;
  const campaign = useQuery(api.recruitment.getCampaign, { campaignId });
  const templates = useQuery(api.recruitment.listTemplates, {});
  const logs = useQuery(api.recruitment.listEmailLogs, { limit: 200 });

  const updateMembers = useMutation(api.recruitment.updateCampaignMembers);
  const closeCampaign = useMutation(api.recruitment.closeCampaign);
  const deleteCampaign = useMutation(api.recruitment.deleteCampaign);
  const sendTemplateEmail = useAction(api.recruitment.sendTemplateEmail);
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const members = campaign?.members ?? [];
  // Nothing ticked = mail everyone. Selecting narrows it — the common case is
  // "send to the whole group", so that shouldn't need 40 clicks first.
  const targetIds = useMemo(
    () =>
      (selected.size > 0
        ? members.filter((m) => selected.has(m._id))
        : members
      ).map((m) => m._id) as Id<"recruitCandidates">[],
    [selected, members]
  );

  /** Who in this campaign has already been mailed, from the send log. */
  const mailedTo = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs ?? []) {
      if (campaign?.sourceId != null && l.campaignSourceId === campaign.sourceId) {
        set.add(l.contactEmail.toLowerCase());
      }
    }
    return set;
  }, [logs, campaign]);

  async function handleSend() {
    if (!templateId || targetIds.length === 0) return;
    setBusy(true);
    try {
      const { sent, failed } = await sendTemplateEmail({
        candidateIds: targetIds,
        templateId: templateId as Id<"recruitTemplates">,
        ...(campaign?.sourceId != null ? { campaignSourceId: campaign.sourceId } : {}),
      });
      toast(failed ? "error" : "success",
        failed ? `${sent} sent, ${failed} failed` : `Sent to ${sent}`);
      setMailOpen(false);
      setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (campaign === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={6} cols={4} what="campaign members" />
      </div>
    );
  }
  if (campaign === null) {
    return <div className="p-8"><p className="text-[15px] text-[var(--text-secondary)]">Campaign not found.</p></div>;
  }

  const allSelected = members.length > 0 && selected.size === members.length;

  return (
    <div className="p-8">
      <Link
        href="/recruitment/campaigns"
        className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={13} />
        Campaigns
      </Link>

      <PageHeader
        title={campaign.name || "Untitled campaign"}
        subtitle={`${campaign.jobName} · ${members.length} ${members.length === 1 ? "person" : "people"}${campaign.endDate ? " · closed" : ""}`}
        icon={Megaphone}
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setMailOpen(true)} disabled={members.length === 0}>
              <Mail size={14} />
              {selected.size > 0 ? `Email ${selected.size}` : "Email everyone"}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await closeCampaign({ campaignId, reopen: campaign.endDate != null });
                toast("success", campaign.endDate ? "Campaign reopened" : "Campaign closed");
              }}
            >
              {campaign.endDate ? <RotateCcw size={14} /> : <Check size={14} />}
              {campaign.endDate ? "Reopen" : "Close"}
            </Button>
          </div>
        }
      />

      {campaign.notes && (
        <p className="mb-4 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-[13px] text-[var(--text-secondary)]">
          {campaign.notes}
        </p>
      )}

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">
            Nobody in this campaign yet
          </p>
          <p className="text-[13px] text-[var(--text-muted)] mt-1">
            Add people from a position&apos;s candidate list.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-hover)]">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(members.map((m) => m._id)))
                      }
                      aria-label="Select all members"
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-admin-strong)]"
                    />
                  </th>
                  {["Candidate", "Status", "Mailed", ""].map((h, i) => (
                    <th key={h || i}
                      className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-[var(--text-secondary)] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const meta = STATUS_COLORS[m.status] ?? STATUS_COLORS.active;
                  const done = mailedTo.has(m.email.toLowerCase());
                  return (
                    <tr key={m._id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(m._id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              next.has(m._id) ? next.delete(m._id) : next.add(m._id);
                              return next;
                            })
                          }
                          aria-label={`Select ${m.name}`}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-admin-strong)]"
                        />
                      </td>
                      <td className="px-3 py-2 min-w-[220px]">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{m.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          <a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a>
                          {m.number && <span> · {m.number}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge color={meta.color} label={meta.label} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[12px]">
                        {done ? (
                          <span className="text-[var(--accent-employee-text)]">Sent</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {m.resume && (
                            <a href={m.resume} target="_blank" rel="noreferrer" title="Open résumé"
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]">
                              <FileText size={14} />
                            </a>
                          )}
                          {m.portfolioLink && (
                            <a href={m.portfolioLink} target="_blank" rel="noreferrer" title="Open portfolio"
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]">
                              <ExternalLink size={14} />
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              await updateMembers({ campaignId, remove: [m._id] });
                              toast("success", `${m.name} removed from campaign`);
                            }}
                            aria-label={`Remove ${m.name} from campaign`}
                            title="Remove from campaign"
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--danger)]"
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button
        onClick={() => setConfirmDelete(true)}
        className="mt-6 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
      >
        Delete this campaign
      </button>

      <Modal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title={`Email ${targetIds.length} ${targetIds.length === 1 ? "person" : "people"}`}
        icon={Mail}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMailOpen(false)}>Cancel</Button>
            <Button loading={busy} disabled={!templateId} onClick={handleSend}>Send now</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            label="Template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Choose a template"
            options={(templates ?? []).map((t) => ({ value: t._id, label: `${t.name} — ${t.jobName}` }))}
          />
          <p className="text-[12px] text-[var(--text-secondary)]">
            {selected.size > 0
              ? `Sending to the ${selected.size} selected.`
              : "Sending to everyone in this campaign."}{" "}
            Results are counted against this campaign.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        title="Delete campaign"
        message="Delete this campaign? The candidates and their email history stay — only the grouping is removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          await deleteCampaign({ campaignId });
          toast("success", "Campaign deleted");
          window.location.href = "/recruitment/campaigns";
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
