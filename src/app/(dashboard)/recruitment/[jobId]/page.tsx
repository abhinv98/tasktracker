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
  Select,
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
  if (!ts) return "—";
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

  const setCandidateStatus = useMutation(api.recruitment.setCandidateStatus);
  const deleteCandidates = useMutation(api.recruitment.deleteCandidates);
  const sendTemplateEmail = useAction(api.recruitment.sendTemplateEmail);
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const job = jobs?.find((j) => j.sourceId === jobSourceId);
  const ids = useMemo(
    () => [...selected] as Id<"recruitCandidates">[],
    [selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyStatus(next: Status) {
    if (ids.length === 0) return;
    try {
      const { updated } = await setCandidateStatus({ candidateIds: ids, status: next });
      toast("success", `${updated} candidate${updated === 1 ? "" : "s"} marked ${statusMeta(next).label.toLowerCase()}`);
      setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleSend() {
    if (!templateId || ids.length === 0) return;
    setSending(true);
    try {
      const { sent, failed } = await sendTemplateEmail({
        candidateIds: ids,
        templateId: templateId as Id<"recruitTemplates">,
      });
      toast(
        failed > 0 ? "error" : "success",
        failed > 0 ? `${sent} sent, ${failed} failed` : `Sent to ${sent} candidate${sent === 1 ? "" : "s"}`
      );
      setMailOpen(false);
      setSelected(new Set());
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (jobs === undefined || candidates === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={6} what="candidates" />
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
            ? `Sub-position of ${job.parentName} · ${candidates.length} shown`
            : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} shown`
        }
        icon={UserSearch}
      />

      {/* Filters */}
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

      {/* Batch bar */}
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
            {STATUSES.map((s) => (
              <Button key={s.value} variant="secondary" onClick={() => applyStatus(s.value)}>
                {s.label}
              </Button>
            ))}
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
            </Button>
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
                  {["Name", "Contact", "Role applied", "Experience", "Expected", "Status", "Added", ""].map((h) => (
                    <th
                      key={h}
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
                  const isHit = highlight === c._id;
                  return (
                    <tr
                      key={c._id}
                      className={`border-b border-[var(--border-subtle)] transition-colors ${
                        isHit ? "bg-[var(--accent-admin-dim)]" : "hover:bg-[var(--bg-hover)]"
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
                      <td className="px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                        {c.name}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                        <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                        {c.number && (
                          <span className="block text-[11px] text-[var(--text-muted)]">{c.number}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                        {c.position || "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                        {c.experience || "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                        {c.expectedCtc || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge color={meta.color} label={meta.label} />
                      </td>
                      <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                        {fmt(c.createdAt)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {c.resume && (
                            <a
                              href={c.resume}
                              target="_blank"
                              rel="noreferrer"
                              title="Open résumé"
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]"
                            >
                              <FileText size={14} />
                            </a>
                          )}
                          {c.portfolioLink && (
                            <a
                              href={c.portfolioLink}
                              target="_blank"
                              rel="noreferrer"
                              title="Open portfolio"
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]"
                            >
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
      )}

      {/* Send email */}
      <Modal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title={`Email ${selected.size} candidate${selected.size === 1 ? "" : "s"}`}
        icon={Mail}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMailOpen(false)}>
              Cancel
            </Button>
            <Button loading={sending} disabled={!templateId} onClick={handleSend}>
              Send now
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            label="Template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Choose a template"
            options={(templates ?? []).map((t) => ({
              value: t._id,
              label: `${t.name} — ${t.jobName}`,
            }))}
          />
          <p className="text-[12px] text-[var(--text-secondary)]">
            Sends from <strong>HR Team &lt;hr@ecultify.com&gt;</strong> via
            ZeptoMail — the same sender the recruitment site already uses.
            Placeholders like <code>{"{{name}}"}</code> are filled per candidate,
            and every send is recorded in Email activity.
          </p>
          {(templates ?? []).length === 0 && (
            <p className="text-[12px] text-[var(--danger)]">
              No templates yet — create one under Templates first.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        title="Delete candidates"
        message={`Permanently delete ${selected.size} candidate${selected.size === 1 ? "" : "s"}? Their details and résumé links go with them. This cannot be undone.`}
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
