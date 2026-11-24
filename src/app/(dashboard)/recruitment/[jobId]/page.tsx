"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  Button,
  EmptyState,
  Modal,
  Input,
  Select,
  Textarea,
  ConfirmModal,
  SkeletonPageHeader,
  SkeletonTable,
  useToast,
} from "@/components/ui";
import { FilterTray, SearchField, StatChips, Tray, TrayItem } from "@/components/ui/Tray";
import { POSITION_STATUSES, isPositionStatus, positionStatus, type PositionStatus } from "@/lib/recruitStages";
import { NO_NARROW, narrow, type Narrow } from "@/lib/applicantSearch";
import { useHrData } from "@/components/recruitment/hrShared";
import { ApplicantsTable, NarrowTray, placesOf, useMoveApplicants, type Applicant } from "@/components/recruitment/ApplicantsTable";
import { CandidatePanel } from "@/components/recruitment/CandidatePanel";
import { Rounds } from "@/components/recruitment/OpenRound";
import { EmailPreview } from "@/components/recruitment/TemplateEditor";
import { valuesFor } from "@/lib/templateHtml";
import { ArrowLeft, Check, Mail, Megaphone, Pause, RotateCcw, Trash2, UserSearch, X } from "lucide-react";

type Chip = PositionStatus | "all";

/**
 * One position: who applied, and the decision on each of them. The whole list is
 * here already, so searching and filtering answer on every keystroke.
 */
export default function RecruitmentJobPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobSourceId = Number(params.jobId);
  const highlight = searchParams.get("highlight");
  const asked = searchParams.get("status");

  const jobs = useQuery(api.recruitment.listJobs);
  const candidates = useQuery(api.recruitment.listCandidates, { jobSourceId });
  const templates = useQuery(api.recruitment.listTemplates, {});
  const campaigns = useQuery(api.recruitment.listCampaigns, { jobSourceId });

  const deleteCandidates = useMutation(api.recruitment.deleteCandidates);
  const createCampaign = useMutation(api.recruitment.createCampaign);
  const updateMembers = useMutation(api.recruitment.updateCampaignMembers);
  const sendTemplateEmail = useAction(api.recruitment.sendTemplateEmail);
  const addApplicants = useMutation(api.hrOps.addApplicants);
  const move = useMoveApplicants();
  const hr = useHrData();
  const { toast } = useToast();

  const [chip, setChip] = useState<Chip>(isPositionStatus(asked) ? asked : highlight ? "all" : "new");
  const [filter, setFilter] = useState<Narrow>(NO_NARROW);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ id: Id<"recruitCandidates">; order: Id<"recruitCandidates">[] } | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [campTarget, setCampTarget] = useState("new");
  const [campName, setCampName] = useState("");
  const [campNotes, setCampNotes] = useState("");

  // Bulk delete, mail and move act on every pick, so drop the ones a new filter hides.
  useEffect(() => setSelected(new Set()), [chip, filter, jobSourceId]);

  const job = jobs?.find((j) => j.sourceId === jobSourceId);
  const places = useMemo(() => placesOf(hr), [hr]);
  const narrowed = useMemo(() => narrow((candidates ?? []) as Applicant[], filter), [candidates, filter]);
  const rows = useMemo(() => (chip === "all" ? narrowed : narrowed.filter((c) => positionStatus(c.stage) === chip)), [narrowed, chip]);
  const roles = useMemo(
    () => [...new Set((candidates ?? []).map((c) => c.position.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [candidates]
  );
  // Only who is still listed: someone decided on from their own row has left it.
  const picks = useMemo(() => new Set(rows.filter((r) => selected.has(r._id)).map((r) => r._id as string)), [rows, selected]);
  const ids = useMemo(() => [...picks] as Id<"recruitCandidates">[], [picks]);

  if (jobs === undefined || candidates === undefined) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={6} what="applicants" />
      </div>
    );
  }

  const openRounds = (hr?.book.rounds ?? []).filter((r) => !String(r.fields.hiringStatus ?? "").startsWith("Closed"));
  const count = (c: Chip) => (c === "all" ? narrowed.length : narrowed.filter((x) => positionStatus(x.stage) === c).length);
  const filtersOn = Object.values(filter).some(Boolean);
  const picked = templates?.find((t) => t._id === templateId);
  const firstPicked = rows.find((r) => picks.has(r._id) && r.email);
  const undated = candidates.filter((c) => c.createdAt == null).length;

  async function moveSelected(to: PositionStatus) {
    if (ids.length && (await move(ids, to))) setSelected(new Set());
  }

  async function addToRound(roundId: string) {
    try {
      const { added, skipped } = await addApplicants({ candidateIds: ids, roundId: roundId as Id<"hrRecords"> });
      const code = openRounds.find((r) => r._id === roundId)?.code ?? "the hiring round";
      toast("success", `${added} added to ${code}${skipped ? `, ${skipped} already there` : ""}. Find them under Candidates.`);
      setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleSend() {
    if (!templateId || !ids.length) return;
    setBusy(true);
    try {
      const { sent, unsent, reason } = await sendTemplateEmail({
        candidateIds: ids,
        templateId: templateId as Id<"recruitTemplates">,
      });
      toast(unsent.length ? "error" : "success",
        unsent.length ? `${sent} sent, ${unsent.length} not sent. ${reason}`.trim() : `Sent to ${sent}`);
      // Whoever it did not reach stays picked, with the dialog open, to try again.
      setSelected(new Set(unsent));
      if (unsent.length === 0) setMailOpen(false);
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
        toast("success", `Campaign created with ${ids.length} people`);
      } else {
        const { memberCount } = await updateMembers({
          campaignId: campTarget as Id<"recruitCampaigns">, add: ids,
        });
        toast("success", `Campaign now has ${memberCount} people`);
      }
      setCampOpen(false); setCampName(""); setCampNotes(""); setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/recruitment/applicants"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={13} />
          All positions
        </Link>
        {/* Straight to another position, without going back to the list. */}
        <select
          value={String(jobSourceId)}
          onChange={(e) => router.push(`/recruitment/${e.target.value}`)}
          aria-label="Switch position"
          className="max-w-[280px] cursor-pointer rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
        >
          {!job && <option value={String(jobSourceId)}>Choose a position</option>}
          {jobs.map((j) => (
            <option key={j._id} value={String(j.sourceId)}>
              {j.parentSourceId != null ? "\u00a0\u00a0\u00a0" : ""}
              {j.name}
              {j.fresh ? ` (${j.fresh} new)` : ""}
            </option>
          ))}
        </select>
      </div>

      <PageHeader
        title={job ? job.name[0].toUpperCase() + job.name.slice(1) : "Position"}
        subtitle={
          job?.parentName
            ? `Under ${job.parentName}`
            : `${candidates.length.toLocaleString()} ${candidates.length === 1 ? "person has" : "people have"} applied. Shortlisted people carry on under Candidates.`
        }
        icon={UserSearch}
        actions={job && <Rounds data={hr} job={job} />}
      />

      <StatChips<Chip>
        className="mb-3"
        label="Filter by decision"
        value={chip}
        onChange={setChip}
        options={[
          ...POSITION_STATUSES.map((s) => ({ value: s.value as Chip, label: s.label, dot: s.color, count: count(s.value) })),
          { value: "all", label: "All", count: count("all") },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchField
          value={filter.search}
          onChange={(search) => setFilter((f) => ({ ...f, search }))}
          placeholder="Name, email, phone or role"
          label={`Search ${job?.name ?? "this position"}`}
        />
        {roles.length > 1 && (
          <FilterTray
            label="Applied for"
            allLabel="Any role"
            value={filter.role}
            options={roles.map((r) => ({ value: r, label: r }))}
            onChange={(role) => setFilter((f) => ({ ...f, role }))}
          />
        )}
        <NarrowTray value={filter} onChange={setFilter} />
        {filtersOn && (
          <button
            type="button"
            onClick={() => setFilter(NO_NARROW)}
            className="text-[12px] font-medium text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        )}
      </div>

      {picks.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 shadow-sm">
          <span className="text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{picks.size} selected</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[12px] font-medium text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => moveSelected("shortlisted")}>
              <Check size={14} />
              Shortlist
            </Button>
            <Button variant="secondary" onClick={() => moveSelected("on_hold")}>
              <Pause size={14} />
              Hold
            </Button>
            <Button variant="secondary" onClick={() => moveSelected("rejected")}>
              <X size={14} />
              Reject
            </Button>
            <Button variant="secondary" onClick={() => setMailOpen(true)}>
              <Mail size={14} />
              Email
            </Button>
            <Tray label="More" align="end" width="w-64">
              <TrayItem label="Back to New" icon={RotateCcw} onSelect={() => moveSelected("new")} />
              <TrayItem label="Add to an email campaign" icon={Megaphone} onSelect={() => setCampOpen(true)} />
              {openRounds.length > 0 && (
                <p className="px-2 pb-1 pt-2 text-[12px] font-medium text-[var(--text-muted)]">Put into a hiring round</p>
              )}
              {openRounds.map((r) => (
                <TrayItem key={r._id} label={`${r.code} · ${String(r.fields.role ?? "")}`} onSelect={() => addToRound(r._id)} />
              ))}
              <TrayItem label="Delete for good" icon={Trash2} destructive onSelect={() => setConfirmDelete(true)} />
            </Tray>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        filtersOn ? (
          <EmptyState icon={UserSearch} title="Nobody matches" description="Try fewer letters, or clear the filters." />
        ) : (
          <EmptyState
            icon={UserSearch}
            title={chip === "new" ? "Nobody is waiting" : "Nobody here"}
            description={chip === "new" ? "Everyone who applied for this position has been looked at." : "Pick another list above."}
          />
        )
      ) : (
        <>
          <ApplicantsTable
            rows={rows}
            // Blank means they applied for the position itself.
            roleColumn={roles.length > 1 ? { label: "Applied for", of: (a) => a.position || job?.name || "" } : null}
            selected={picks}
            onSelect={setSelected}
            onOpen={(id, order) => setPanel({ id, order })}
            onMove={(a, to) => move([a._id], to, a.name)}
            places={places}
            highlight={highlight}
          />
          {undated > 0 && (
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">
              {undated.toLocaleString()} of these {candidates.length.toLocaleString()} came through the older
              application form, which didn&apos;t record a date or salary details.
            </p>
          )}
        </>
      )}

      {/* Send email */}
      <Modal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title={`Email ${picks.size} candidate${picks.size === 1 ? "" : "s"}`}
        icon={Mail}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMailOpen(false)}>Cancel</Button>
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
            {firstPicked && picked
              ? `This is how ${firstPicked.name} gets it. The rest get the same with their own details, and every send is recorded.`
              : "Pick a template to see the email before it goes. Every send is recorded."}
          </p>
          {firstPicked && picked && (
            <EmailPreview
              subject={picked.subject}
              body={picked.body}
              values={valuesFor(firstPicked, job?.name ?? "")}
              to={`${firstPicked.name}, ${firstPicked.email}`}
            />
          )}
        </div>
      </Modal>

      {/* Campaign */}
      <Modal
        open={campOpen}
        onClose={() => setCampOpen(false)}
        title={`Add ${picks.size} to a campaign`}
        icon={Megaphone}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCampOpen(false)}>Cancel</Button>
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

      {panel && (
        <CandidatePanel
          candidateId={panel.id}
          order={panel.order}
          onGo={(id) => setPanel((p) => p && { ...p, id })}
          onClose={() => setPanel(null)}
          onOpenOther={(id, other) => {
            if (other === jobSourceId) setPanel((p) => p && { ...p, id });
            else router.push(`/recruitment/${other}?highlight=${id}`);
          }}
        />
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Delete candidates"
        message={`Permanently delete ${picks.size} candidate${picks.size === 1 ? "" : "s"}? Their details and résumé links go too. This cannot be undone.`}
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
