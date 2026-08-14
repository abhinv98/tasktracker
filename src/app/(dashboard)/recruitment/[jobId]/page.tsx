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
import { STAGES, OPEN_STAGES, stageMeta, type Stage } from "@/lib/recruitStages";
import { CandidatePanel } from "@/components/recruitment/CandidatePanel";
import {
  parseCtcLpa, formatLpa, parseYears, formatYears, parseNoticeDays, formatNotice,
} from "@/lib/recruitParse";
import {
  ArrowLeft,
  Search,
  FileText,
  ExternalLink,
  Mail,
  Trash2,
  UserSearch,
  Megaphone,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

type SortKey = "name" | "years" | "current" | "expected" | "notice" | "status" | "added";

/** Every column is its own column. Numbers sit right-aligned and sortable —
 *  the whole point of a recruitment table is comparing salary and experience
 *  across candidates, which a merged text blob makes impossible. */
const COLUMNS: { key: SortKey | null; label: string; align?: "right"; cls: string }[] = [
  { key: "name", label: "Candidate", cls: "min-w-[190px]" },
  { key: null, label: "Email", cls: "min-w-[210px]" },
  { key: null, label: "Phone", cls: "min-w-[130px]" },
  { key: null, label: "Applied for", cls: "min-w-[140px]" },
  { key: "years", label: "Exp", align: "right", cls: "min-w-[80px]" },
  { key: "current", label: "Current", align: "right", cls: "min-w-[90px]" },
  { key: "expected", label: "Expected", align: "right", cls: "min-w-[95px]" },
  { key: "notice", label: "Notice", align: "right", cls: "min-w-[85px]" },
  { key: "status", label: "Stage", cls: "min-w-[105px]" },
  { key: "added", label: "Added", align: "right", cls: "min-w-[90px]" },
  { key: null, label: "", cls: "min-w-[70px]" },
];



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
  const [stage, setStage] = useState<Stage | "" | "open">("open");
  const [openId, setOpenId] = useState<Id<"recruitCandidates"> | null>(null);
  const [search, setSearch] = useState("");
  const candidates = useQuery(api.recruitment.listCandidates, {
    jobSourceId,
    ...(stage && stage !== "open" ? { stage } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const templates = useQuery(api.recruitment.listTemplates, {});
  const campaigns = useQuery(api.recruitment.listCampaigns, { jobSourceId });

  const setStageMut = useMutation(api.recruitment.setStage);
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
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "added", dir: -1 });

  const job = jobs?.find((j) => j.sourceId === jobSourceId);
  const undatedCount = (candidates ?? []).filter((c) => c.createdAt == null).length;
  const ids = useMemo(() => [...selected] as Id<"recruitCandidates">[], [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyStage(next: Stage) {
    if (!ids.length) return;
    try {
      const { updated } = await setStageMut({ candidateIds: ids, stage: next });
      toast("success", `${updated} moved to ${stageMeta(next).label}`);
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

  // Parse once, then sort on the parsed numbers — sorting the raw strings
  // would put "900000 LPA" above "9 LPA" despite being the same salary.
  const visible =
    stage === "open"
      ? candidates.filter((c) => OPEN_STAGES.includes((c.stage ?? "applied") as Stage))
      : candidates;

  const rows = visible
    .map((c) => ({
      c,
      years: parseYears(c.experience),
      current: parseCtcLpa(c.currentCtc),
      expected: parseCtcLpa(c.expectedCtc),
      notice: parseNoticeDays(c.noticePeriod),
    }))
    .sort((a, b) => {
      const dir = sort.dir;
      // Missing values always sink, whichever way the column is sorted.
      const nul = (v: number | null | undefined) =>
        v == null ? (dir === 1 ? Infinity : -Infinity) : v;
      switch (sort.key) {
        case "name": return a.c.name.localeCompare(b.c.name) * dir;
        case "years": return (nul(a.years) - nul(b.years)) * dir;
        case "current": return (nul(a.current) - nul(b.current)) * dir;
        case "expected": return (nul(a.expected) - nul(b.expected)) * dir;
        case "notice": return (nul(a.notice) - nul(b.notice)) * dir;
        case "status": return (a.c.stage ?? "applied").localeCompare(b.c.stage ?? "applied") * dir;
        default: return (nul(a.c.createdAt) - nul(b.c.createdAt)) * dir;
      }
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;

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
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] flex-wrap">
          {/* "In play" first and selected by default — the closed-out majority
              is history, and opening a position to 1,437 rejected+applied rows
              buries the handful actually moving. */}
          {[{ value: "open", label: "In play" }, { value: "", label: "All" }, ...STAGES].map((t) => (
            <button
              key={t.value || "all"}
              onClick={() => setStage(t.value as Stage | "" | "open")}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                stage === t.value
                  ? "bg-white shadow-sm text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
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
              onChange={(e) => e.target.value && applyStage(e.target.value as Stage)}
              aria-label="Move to stage"
              className="bg-white border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">Move to…</option>
              {STAGES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
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

      {rows.length === 0 ? (
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
                          setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.c._id)))
                        }
                        aria-label="Select all shown"
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-admin-strong)]"
                      />
                    </th>
                    {COLUMNS.map((col, i) => {
                      const active = col.key && sort.key === col.key;
                      return (
                        <th
                          key={col.label || i}
                          className={`${col.cls} px-3 py-2 font-semibold text-[11px] uppercase tracking-[0.04em] text-[var(--text-secondary)] whitespace-nowrap ${
                            col.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          {col.key ? (
                            <button
                              onClick={() =>
                                setSort((p) =>
                                  p.key === col.key
                                    ? { key: p.key, dir: p.dir === 1 ? -1 : 1 }
                                    : { key: col.key as SortKey, dir: 1 }
                                )
                              }
                              className={`inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ${
                                active ? "text-[var(--text-primary)]" : ""
                              }`}
                            >
                              {col.label}
                              {active &&
                                (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                            </button>
                          ) : (
                            col.label
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, years, current, expected, notice }) => {
                    const meta = stageMeta((c.stage ?? "applied") as Stage);
                    const dash = <span className="text-[var(--text-disabled)]">—</span>;
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
                        <td className="px-3 py-2">
                          {/* A handful of applicants pasted a whole paragraph
                              into the name field (one hit the varchar(255)
                              ceiling). With auto table layout one of those
                              widens the column and shoves every other column
                              off screen, so the cell is capped and the full
                              text lives in the tooltip. */}
                          <button
                            onClick={() => setOpenId(c._id)}
                            title={c.name}
                            className="block max-w-[200px] truncate text-left text-[13px] font-medium text-[var(--text-primary)] hover:text-[var(--accent-admin-text)] hover:underline"
                          >
                            {c.name}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-[12px]">
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              title={c.email}
                              className="block max-w-[220px] truncate text-[var(--text-secondary)] hover:text-[var(--accent-admin-text)] hover:underline"
                            >
                              {c.email}
                            </a>
                          ) : dash}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                          {c.number || dash}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                          {/* Blank position = the old form recorded no sub-position,
                              so they applied for the job itself. */}
                          <div className="max-w-[160px] truncate" title={c.position || job?.name || ""}>
                            {c.position || job?.name || dash}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] tabular-nums text-right whitespace-nowrap">
                          {years == null ? dash : formatYears(years)}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] tabular-nums text-right whitespace-nowrap">
                          {current == null ? dash : formatLpa(current)}
                        </td>
                        <td className="px-3 py-2 text-[12px] font-medium text-[var(--text-primary)] tabular-nums text-right whitespace-nowrap">
                          {expected == null ? dash : formatLpa(expected)}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] tabular-nums text-right whitespace-nowrap">
                          {notice == null ? dash : formatNotice(notice)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusBadge color={meta.color} label={meta.label} />
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] tabular-nums text-right whitespace-nowrap">
                          {fmt(c.createdAt) || dash}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {c.resume && (
                              <a href={c.resume} target="_blank" rel="noreferrer" title="Open résumé"
                                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]">
                                <FileText size={14} />
                              </a>
                            )}
                            {c.portfolioLink && (
                              <a href={c.portfolioLink} target="_blank" rel="noreferrer" title="Open portfolio"
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

          {undatedCount > 0 && (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              {undatedCount} of these {candidates.length} came through the older
              application form, which didn&apos;t record a date or salary details.
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

      {openId && (
        <CandidatePanel
          candidateId={openId}
          onClose={() => setOpenId(null)}
          onOpenOther={(id, job) => {
            if (job === jobSourceId) setOpenId(id);
            else window.location.href = `/recruitment/${job}?highlight=${id}`;
          }}
        />
      )}

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
