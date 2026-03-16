"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, ConfirmModal, useToast } from "@/components/ui";
import {
  Plus,
  FileText,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  Upload,
  Download,
  Calendar,
  Users,
  X,
} from "lucide-react";

interface MomTabProps {
  brandId: Id<"brands">;
  isAdmin: boolean;
  isBrandManager: boolean;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MomTab({ brandId, isAdmin, isBrandManager }: MomTabProps) {
  const { toast } = useToast();
  const canEdit = isAdmin || isBrandManager;

  const moms = useQuery(api.meetingMinutes.listByBrand, { brandId });
  const createMom = useMutation(api.meetingMinutes.create);
  const updateMom = useMutation(api.meetingMinutes.update);
  const deleteMomMut = useMutation(api.meetingMinutes.deleteMom);
  const generateUploadUrl = useMutation(api.meetingMinutes.generateUploadUrl);

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [content, setContent] = useState("");
  const [attendeesStr, setAttendeesStr] = useState("");
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"meetingMinutes"> | null>(null);

  const [editingId, setEditingId] = useState<Id<"meetingMinutes"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editAttendees, setEditAttendees] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      let transcriptFileId: Id<"_storage"> | undefined;
      let transcriptFileName: string | undefined;

      if (transcriptFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": transcriptFile.type },
          body: transcriptFile,
        });
        const { storageId } = await result.json();
        transcriptFileId = storageId;
        transcriptFileName = transcriptFile.name;
      }

      const attendees = attendeesStr
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      await createMom({
        brandId,
        title: title.trim(),
        meetingDate: new Date(meetingDate + "T00:00:00").getTime(),
        content: content.trim(),
        attendees: attendees.length > 0 ? attendees : undefined,
        transcriptFileId,
        transcriptFileName,
      });

      setTitle("");
      setContent("");
      setAttendeesStr("");
      setTranscriptFile(null);
      setShowAdd(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast("success", "Meeting minutes added");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create");
    }
    setSubmitting(false);
  }

  function startEdit(mom: any) {
    setEditingId(mom._id);
    setEditTitle(mom.title);
    setEditContent(mom.content);
    setEditAttendees((mom.attendees ?? []).join(", "));
    setEditDate(new Date(mom.meetingDate).toISOString().split("T")[0]);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      const attendees = editAttendees
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      await updateMom({
        momId: editingId,
        title: editTitle.trim() || undefined,
        content: editContent.trim() || undefined,
        attendees: attendees.length > 0 ? attendees : undefined,
        meetingDate: editDate ? new Date(editDate + "T00:00:00").getTime() : undefined,
      });
      setEditingId(null);
      toast("success", "Meeting minutes updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update");
    }
    setSaving(false);
  }

  if (moms === undefined) {
    return <p className="text-[14px] text-[var(--text-secondary)] py-8">Loading...</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">Meeting Minutes</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{moms.length} minute{moms.length !== 1 ? "s" : ""} recorded</p>
        </div>
        {canEdit && !showAdd && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add MOM
          </Button>
        )}
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleCreate} className="rounded-xl border border-[var(--border)] bg-white p-5 mb-6">
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">New Meeting Minutes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting title"
                required
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Meeting Date</label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                required
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Attendees (comma-separated)</label>
            <input
              value={attendeesStr}
              onChange={(e) => setAttendeesStr(e.target.value)}
              placeholder="John, Jane, Alex"
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            />
          </div>
          <div className="mb-4">
            <label className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Minutes Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Meeting notes, decisions, action items..."
              required
              rows={6}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-y"
            />
          </div>
          <div className="mb-4">
            <label className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Meeting Transcript (optional)</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setTranscriptFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                {transcriptFile ? "Change file" : "Upload transcript"}
              </button>
              {transcriptFile && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
                  <FileText className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
                  <span className="truncate max-w-[200px]">{transcriptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => { setTranscriptFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save MOM"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setTitle(""); setContent(""); setAttendeesStr(""); setTranscriptFile(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* MOM List */}
      {moms.length === 0 && !showAdd && (
        <div className="text-center py-12 rounded-xl border border-[var(--border)] bg-white">
          <FileText className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">No meeting minutes yet. Click "Add MOM" to create one.</p>
        </div>
      )}

      <div className="space-y-3">
        {moms.map((mom) => {
          const isExpanded = expandedId === mom._id;
          const isEditing = editingId === mom._id;

          return (
            <div key={mom._id} className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : mom._id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--bg-hover)] transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] text-[var(--text-primary)] truncate">{mom.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                      <Calendar className="h-3 w-3" />
                      {formatDate(mom.meetingDate)}
                    </span>
                    {mom.attendees && mom.attendees.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                        <Users className="h-3 w-3" />
                        {mom.attendees.length} attendee{mom.attendees.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {mom.transcriptUrl && (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--accent-admin)]">
                        <FileText className="h-3 w-3" />
                        Transcript
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  by {mom.creatorName}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border)] px-5 py-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      />
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      />
                      <input
                        value={editAttendees}
                        onChange={(e) => setEditAttendees(e.target.value)}
                        placeholder="Attendees (comma-separated)"
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-y"
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleSaveEdit} disabled={saving}>
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {mom.attendees && mom.attendees.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Attendees</p>
                          <div className="flex flex-wrap gap-1.5">
                            {mom.attendees.map((a: string, i: number) => (
                              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-primary)]">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Minutes</p>
                        <div className="text-[12px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap bg-[var(--bg-primary)] rounded-lg p-3 border border-[var(--border-subtle)]">
                          {mom.content}
                        </div>
                      </div>
                      {mom.transcriptUrl && (
                        <div className="mb-3">
                          <a
                            href={mom.transcriptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/5 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {mom.transcriptFileName ?? "Download Transcript"}
                          </a>
                        </div>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                          <button
                            onClick={() => startEdit(mom)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <Edit3 className="h-3 w-3" /> Edit
                          </button>
                          <button
                            onClick={() => setDeletingId(mom._id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--danger)] hover:bg-[var(--danger)]/5 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={!!deletingId}
        title="Delete Meeting Minutes"
        message="Are you sure you want to delete these meeting minutes? This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingId) {
            await deleteMomMut({ momId: deletingId });
            toast("success", "Meeting minutes deleted");
          }
          setDeletingId(null);
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
