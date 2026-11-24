"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  Badge,
  Button,
  EmptyState,
  Modal,
  Input,
  SegmentedTabs,
  Select,
  ConfirmModal,
  SkeletonPageHeader,
  SkeletonList,
  useToast,
} from "@/components/ui";
import { iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";
import { BodyEditor, EmailPreview, SubjectEditor } from "@/components/recruitment/TemplateEditor";
import { SAMPLE, TEMPLATE_FIELDS, excerpt, subjectPreview } from "@/lib/templateHtml";
import { FileText, ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";

/** A subject for the list: its fields by name rather than as {{code}}. */
const FIELD_NAMES = Object.fromEntries(TEMPLATE_FIELDS.map((f) => [f.key, `[${f.label}]`]));

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
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Id<"recruitTemplates"> | null>(null);

  function open(next: Editing) {
    setTab("write");
    setEditing(next);
  }

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
        href="/recruitment/applicants"
        className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={13} />
        Recruitment
      </Link>

      <PageHeader
        title="Email Templates"
        subtitle="Messages you can send to candidates in a click. Each person's name and details are filled in when it goes out."
        icon={FileText}
        actions={
          <Button
            onClick={() =>
              open({
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
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Create one to send interview invites or rejections in a click."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div
              key={t._id}
              className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-white px-4 py-3 transition-colors hover:border-[var(--border-strong)]"
            >
              <button type="button" onClick={() => open({ ...t })} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text-primary)]">{t.name}</span>
                  <Badge>{t.jobName}</Badge>
                </span>
                <span className="mt-1 block truncate text-[13px] text-[var(--text-secondary)]">
                  {subjectPreview(t.subject, FIELD_NAMES)}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] text-[var(--text-muted)]">{excerpt(t.body)}</span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => open({ ...t })} aria-label={`Edit ${t.name}`} title="Edit" className={iconButtonClass}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleting(t._id)} aria-label={`Delete ${t.name}`} title="Delete" className={iconButtonDangerClass}>
                  <Trash2 size={14} />
                </button>
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
            <Button variant="ghost" onClick={() => setEditing(null)}>
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
            <SegmentedTabs<"write" | "preview">
              value={tab}
              options={[
                { value: "write", label: "Write" },
                { value: "preview", label: "Preview" },
              ]}
              onChange={setTab}
            />
            {/* Hidden rather than removed: the boxes hold what is being typed. */}
            <div className={tab === "write" ? "flex flex-col gap-4" : "hidden"}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Template name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Interview invite"
                />
                <Select
                  label="Position"
                  value={String(editing.jobSourceId)}
                  onChange={(e) => setEditing({ ...editing, jobSourceId: Number(e.target.value) })}
                  options={jobs.map((j) => ({ value: String(j.sourceId), label: j.name }))}
                />
              </div>
              <SubjectEditor value={editing.subject} onChange={(subject) => setEditing((e) => e && { ...e, subject })} />
              <BodyEditor value={editing.body} onChange={(body) => setEditing((e) => e && { ...e, body })} />
              <p className="text-[12px] text-[var(--text-muted)]">
                Highlighted words are filled in for each candidate when the email is sent. Press Preview to see it with sample details.
              </p>
            </div>
            {tab === "preview" && (
              <EmailPreview
                subject={editing.subject}
                body={editing.body}
                values={{ ...SAMPLE, jobname: jobs.find((j) => j.sourceId === editing.jobSourceId)?.name ?? SAMPLE.jobname, position: jobs.find((j) => j.sourceId === editing.jobSourceId)?.name ?? SAMPLE.position }}
                to={`${SAMPLE.name}, ${SAMPLE.email}`}
              />
            )}
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
