"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
  ConfirmModal,
  SkeletonPageHeader,
  SkeletonList,
  useToast,
} from "@/components/ui";
import { FileText, ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";

const PLACEHOLDERS = [
  "name", "email", "number", "position", "currentctc", "expectedctc", "jobname",
];

type Editing = {
  _id?: Id<"recruitTemplates">;
  jobSourceId: number;
  name: string;
  subject: string;
  body: string;
};

export default function RecruitmentTemplatesPage() {
  const templates = useQuery(api.recruitment.listTemplates, {});
  const jobs = useQuery(api.recruitment.listJobs);
  const saveTemplate = useMutation(api.recruitment.saveTemplate);
  const deleteTemplate = useMutation(api.recruitment.deleteTemplate);
  const { toast } = useToast();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Id<"recruitTemplates"> | null>(null);

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      await saveTemplate({
        templateId: editing._id,
        jobSourceId: editing.jobSourceId,
        name: editing.name,
        subject: editing.subject,
        body: editing.body,
      });
      toast("success", editing._id ? "Template updated" : "Template created");
      setEditing(null);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (templates === undefined || jobs === undefined) {
    return (
      <div className="p-8">
        <SkeletonPageHeader />
        <SkeletonList rows={5} what="templates" />
      </div>
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
        title="Email Templates"
        subtitle="Reusable messages for candidate outreach"
        icon={FileText}
        actions={
          <Button
            onClick={() =>
              setEditing({
                jobSourceId: jobs[0]?.sourceId ?? 0,
                name: "",
                subject: "",
                body: "",
              })
            }
          >
            <Plus size={14} />
            New Template
          </Button>
        }
      />

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={28} className="text-[var(--text-disabled)] mb-3" />
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">
            No templates yet
          </p>
          <p className="text-[13px] text-[var(--text-muted)] mt-1">
            Create one to send interview invites or rejections in a click.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div
              key={t._id}
              className="group rounded-lg border border-[var(--border)] bg-white px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[13px] text-[var(--text-primary)]">
                      {t.name}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)]">
                      {t.jobName}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)] truncate">
                    {t.subject}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() =>
                      setEditing({
                        _id: t._id,
                        jobSourceId: t.jobSourceId,
                        name: t.name,
                        subject: t.subject,
                        body: t.body,
                      })
                    }
                    aria-label={`Edit ${t.name}`}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-admin-text)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleting(t._id)}
                    aria-label={`Delete ${t.name}`}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?._id ? "Edit Template" : "New Template"}
        icon={FileText}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={saving}
              disabled={!editing?.name.trim() || !editing?.subject.trim()}
              onClick={handleSave}
            >
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Select
              label="Position"
              value={String(editing.jobSourceId)}
              onChange={(e) =>
                setEditing({ ...editing, jobSourceId: Number(e.target.value) })
              }
              options={jobs.map((j) => ({ value: String(j.sourceId), label: j.name }))}
            />
            <Input
              label="Template name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Interview invite"
            />
            <Input
              label="Subject"
              value={editing.subject}
              onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              placeholder="Interview for {{position}} at Ecultify"
            />
            <Textarea
              label="Body (HTML allowed)"
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              className="min-h-[220px] font-mono text-[12px]"
              placeholder="<p>Hi {{name}},</p>"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
                Placeholders
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setEditing({ ...editing, body: editing.body + `{{${p}}}` })
                    }
                    className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-admin)] hover:text-[var(--accent-admin-text)] transition-colors"
                  >
                    {`{{${p}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title="Delete template"
        message="Delete this template? Emails already sent with it are unaffected."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteTemplate({ templateId: deleting });
            toast("success", "Template deleted");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Failed");
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
