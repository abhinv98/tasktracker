"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  StatusBadge,
  ConfirmModal,
  SkeletonPageHeader,
  SkeletonTable,
  useToast,
} from "@/components/ui";
import {
  ArrowLeft,
  Search,
  FileText,
  ExternalLink,
  Mail,
  Trash2,
  UserSearch,
  Megaphone,
} from "lucide-react";

type Status = "active" | "non_active" | "rejected" | "on_hold";

const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: "active", label: "Active", color: "#059669" },
  { value: "on_hold", label: "On Hold", color: "#d97706" },
  { value: "non_active", label: "Non Active", color: "#6b7280" },
  { value: "rejected", label: "Rejected", color: "#b91c1c" },
];
const statusMeta = (s: string) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

function fmt(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "2-digit",
  });
}

export default function RecruitmentJobPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const jobSourceId = Number(params.jobId);
  const highlight = searchParams.get("highlight");

  const jobs = useQuery(api.recruitment.listJobs);
  const [status, setStatus] = useState<Status | "">("");
  const [search, setSearch] = useState("");
  const candidates = useQuery(api.recruitment.listCandidates, {
    jobSourceId,
    ...(status ? { status } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const templates = useQuery(api.recruitment.listTemplates, {});
  const campaigns = useQuery(api.recruitment.listCampaigns, { jobSourceId });

  const setCandidateStatus = useMutation(api.recruitment.setCandidateStatus);
  const deleteCandidates = useMutation(api.recruitment.deleteCandidates);
  const createCampaign = useMutation(api.recruitment.createCampaign);
  const updateMembers = useMutation(api.recruitment.updateCampaignMembers);
  const sendTemplateEmail = useAction(api.recruitment.sendTemplateEmail);
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [campTarget, setCampTarget] = useState("new");
  const [campName, setCampName] = useState("");
  const [campNotes, setCampNotes] = useState("");

  const job = jobs?.find((j) => j.sourceId === jobSourceId);
  const ids = useMemo(() => [...selected] as Id<"recruitCandidates">[], [selected]);

  /**
   * Which optional columns are worth a column header for THIS job.
   * Video Editors is 88% pre-migration rows with no experience/CTC/date, so a
   * fixed table renders four columns of dashes and reads as broken data. A
   * column has to earn its width on the job you're actually looking at.
   */
  const cols = useMemo(() => {
    const rows = candidates ?? [];
    if (rows.length === 0) return { details: false, added: false, role: false };
    const has = (fn: (c: (typeof rows)[number]) => boolean) =>
      rows.filter(fn).length / rows.length >= 0.15;
    return {
      details: has((c) => !!(c.experience || c.expectedCtc || c.currentCtc || c.noticePeriod)),
      added: has((c) => c.createdAt != null),
      role: has((c) => !!c.position),
    };
  }, [candidates]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyStatus(next: Status) {
    if (!ids.length) return;
    try {
      const { updated } = await setCandidateStatus({ candidateIds: ids, status: next });
      toast("success", `${updated} marked ${statusMeta(next).label.toLowerCase()}`);
      setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleSend() {
    if (!templateId || !ids.length) return;
    setBusy(true);
    try {
      const { sent, failed } = await sendTemplateEmail({
        candidateIds: ids,
        templateId: templateId as Id<"recruitTemplates">,
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

  async function handleCampaign() {
    setBusy(true);
    try {
      if (campTarget === "new") {
        if (!campName.trim()) return;
        await createCampaign({
          name: campName.trim(), jobSourceId, candidateIds: ids,
          notes: campNotes.trim() || undefined,
        });
        toast("success", `Campaign created with ${ids.length} candidates`);
      } else {
        const { memberCount } = await updateMembers({
          campaignId: campTarget as Id<"recruitCampaigns">, add: ids,
        });
        toast("success", `Campaign now has ${memberCount} candidates`);
      }
      setCampOpen(false); setCampName(""); setCampNotes(""); setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (jobs === undefined || candidates === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={5} what="candidates" />
      </div>
    );
  }

  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  return (
    <div className="p-8">
      <Link
        href="/recruitment"
        className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={13} />
        All positions
      </Link>

      <PageHeader
        title={job?.name ?? "Position"}
        subtitle={
          job?.parentName
            ? `Sub-position of ${job.parentName}`
            : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`
        }
        icon={UserSearch}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, phone…"
            className="w-[240px] bg-[var(--bg-input)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
          />
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)]">
          {[{ value: "", label: "All" }, ...STATUSES].map((s) => (
            <button
              key={s.value || "all"}
              onClick={() => setStatus(s.value as Status | "")}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                status === s.value
                  ? "bg-white shadow-sm text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batch bar. One primary action, a status menu, one secondary, one
          destructive icon — six competing buttons was the old version. */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent-admin)] bg-white px-3 py-2 shadow-sm">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
          >
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => setMailOpen(true)}>
              <Mail size={14} />
              Send email
            </Button>
            <Button variant="secondary" onClick={() => setCampOpen(true)}>
              <Megaphone size={14} />
              Add to campaign
            </Button>
            <select
              value=""
              onChange={(e) => e.target.value && applyStatus(e.target.value as Status)}
              aria-label="Set status"
              className="bg-white border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">Set status…</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete selected"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UserSearch size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">
            No candidates match
          </p>
        </div>
      ) : (
        <>
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
                          setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c._id)))
                        }
                        aria-label="Select all shown"
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-admin-strong)]"
                      />
                    </th>
                    {["Candidate",
                      ...(cols.role ? ["Applied for"] : []),
                      ...(cols.details ? ["Details"] : []),
                      "Status",
                      ...(cols.added ? ["Added"] : []),
                      ""].map((h, i) => (
                      <th
                        key={h || i}
                        className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-[var(--text-secondary)] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const meta = statusMeta(c.status);
                    // Whatever this candidate actually has, joined — beats
                    // three columns each mostly showing a dash.
                    const details = [
                      c.experience && `${c.experience} yr`,
                      c.currentCtc && `now ${c.currentCtc}`,
                      c.expectedCtc && `want ${c.expectedCtc}`,
                      c.noticePeriod,
                    ].filter(Boolean).join(" · ");
                    return (
                      <tr
                        key={c._id}
                        className={`border-b border-[var(--border-subtle)] transition-colors ${
                          highlight === c._id ? "bg-[var(--accent-admin-dim)]" : "hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(c._id)}
                            onChange={() => toggle(c._id)}
                            aria-label={`Select ${c.name}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-admin-strong)]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[220px]">
                          <p className="text-[13px] font-medium text-[var(--text-primary)]">
                            {c.name}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                            {c.number && <span> · {c.number}</span>}
                          </p>
                        </td>
                        {cols.role && (
                          <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                            {c.position || "—"}
                          </td>
                        )}
                        {cols.details && (
                          <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                            {details || "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusBadge color={meta.color} label={meta.label} />
                        </td>
                        {cols.added && (
                          <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                            {fmt(c.createdAt) || "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {c.resume && (
                              <a href={c.resume} target="_blank" rel="noreferrer"
                                title="Open résumé"
                                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]">
                                <FileText size={14} />
                              </a>
                            )}
                            {c.portfolioLink && (
                              <a href={c.portfolioLink} target="_blank" rel="noreferrer"
                                title="Open portfolio"
                                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]">
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Say why columns are absent rather than leaving it a mystery. */}
          {(!cols.details || !cols.added) && (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              {!cols.details && "Experience and salary "}
              {!cols.details && !cols.added && "and "}
              {!cols.added && "application dates "}
              {!cols.details && !cols.added ? "are" : "is"} hidden for this position — these
              candidates came through the older application form, which didn&apos;t collect
              {!cols.added ? " them" : " it"}.
            </p>
          )}
        </>
      )}

      {/* Send email */}
      <Modal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title={`Email ${selected.size} candidate${selected.size === 1 ? "" : "s"}`}
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
            Sends from <strong>HR Team &lt;hr@ecultify.com&gt;</strong>. Placeholders
            fill per candidate, and every send is recorded.
          </p>
        </div>
      </Modal>

      {/* Campaign */}
      <Modal
        open={campOpen}
        onClose={() => setCampOpen(false)}
        title={`Add ${selected.size} to a campaign`}
        icon={Megaphone}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCampOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={campTarget === "new" && !campName.trim()}
              onClick={handleCampaign}
            >
              {campTarget === "new" ? "Create campaign" : "Add to campaign"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            label="Campaign"
            value={campTarget}
            onChange={(e) => setCampTarget(e.target.value)}
            options={[
              { value: "new", label: "＋ New campaign" },
              ...(campaigns ?? [])
                .filter((c) => c.isOpen)
                .map((c) => ({ value: c._id, label: `${c.name} (${c.memberCount})` })),
            ]}
          />
          {campTarget === "new" && (
            <>
              <Input
                label="Campaign name"
                value={campName}
                onChange={(e) => setCampName(e.target.value)}
                placeholder="e.g. Video Editor shortlist — August"
              />
              <Textarea
                label="Notes (optional)"
                value={campNotes}
                onChange={(e) => setCampNotes(e.target.value)}
                placeholder="What this round is for…"
                className="min-h-[80px]"
              />
            </>
          )}
          <p className="text-[12px] text-[var(--text-secondary)]">
            A campaign is just a saved group. You can mail everyone in it from the
            Campaigns page whenever you like.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        title="Delete candidates"
        message={`Permanently delete ${selected.size} candidate${selected.size === 1 ? "" : "s"}? Their details and résumé links go too. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          try {
            const { deleted } = await deleteCandidates({ candidateIds: ids });
            toast("success", `${deleted} deleted`);
            setSelected(new Set());
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Failed");
          }
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
