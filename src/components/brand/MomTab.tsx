"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, ConfirmModal, EmptyState, useToast } from "@/components/ui";
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
  Clock,
} from "lucide-react";
import { fieldClass } from "@/components/ui/classes";

const FIELD = `w-full ${fieldClass}`;
const TEXTAREA =
  "w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[var(--text-primary)] px-2.5 py-2 text-[13px] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-y";
const LABEL = "text-[12px] font-medium text-[var(--text-muted)] block mb-1.5";

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
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
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
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
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
        if (!result.ok) throw new Error("The upload was refused");
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
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        content: content.trim(),
        attendees: attendees.length > 0 ? attendees : undefined,
        transcriptFileId,
        transcriptFileName,
      });

      setTitle("");
      setContent("");
      setStartTime("");
      setEndTime("");
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
    setEditStartTime(mom.startTime ?? "");
    setEditEndTime(mom.endTime ?? "");
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
        startTime: editStartTime || undefined,
        endTime: editEndTime || undefined,
      });
      setEditingId(null);
      toast("success", "Meeting minutes updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update");
    }
    setSaving(false);
  }

  if (moms === undefined) {
    return <p className="text-[13px] text-[var(--text-secondary)] py-8">Loading...</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">Meeting Minutes</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{moms.length} minute{moms.length !== 1 ? "s" : ""} recorded</p>
        </div>
        {canEdit && !showAdd && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add MOM
          </Button>
        )}
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleCreate} className="rounded-lg border border-[var(--border)] bg-white p-4 mb-4">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)] mb-4">New Meeting Minutes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={LABEL}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting title"
                required
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL}>Meeting Date</label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                required
                className={FIELD}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={LABEL}>Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL}>End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className={LABEL}>Attendees (comma-separated)</label>
            <input
              value={attendeesStr}
              onChange={(e) => setAttendeesStr(e.target.value)}
              placeholder="John, Jane, Alex"
              className={FIELD}
            />
          </div>
          <div className="mb-4">
            <label className={LABEL}>Minutes Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Meeting notes, decisions, action items..."
              required
              rows={6}
              className={TEXTAREA}
            />
          </div>
          <div className="mb-4">
            <label className={LABEL}>Meeting Transcript (optional)</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setTranscriptFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {transcriptFile ? "Change file" : "Upload transcript"}
              </Button>
              {transcriptFile && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
                  <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="truncate max-w-[200px]">{transcriptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => { setTranscriptFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    aria-label="Remove file"
                    className="inline-flex items-center justify-center h-control w-control rounded-control text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save MOM"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setShowAdd(false); setTitle(""); setContent(""); setStartTime(""); setEndTime(""); setAttendeesStr(""); setTranscriptFile(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* MOM List */}
      {moms.length === 0 && !showAdd && (
        <EmptyState
          icon={FileText}
          title={'No meeting minutes yet. Click "Add MOM" to create one.'}
        />
      )}

      <div className="space-y-3">
        {moms.map((mom) => {
          const isExpanded = expandedId === mom._id;
          const isEditing = editingId === mom._id;

          return (
            <div key={mom._id} className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : mom._id)}
                aria-expanded={isExpanded}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-primary)] transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[14px] text-[var(--text-primary)] truncate">{mom.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(mom.meetingDate)}
                    </span>
                    {(mom.startTime || mom.endTime) && (
                      <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                        <Clock className="h-3.5 w-3.5" />
                        {mom.startTime ?? "?"} – {mom.endTime ?? "?"}
                      </span>
                    )}
                    {mom.attendees && mom.attendees.length > 0 && (
                      <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                        <Users className="h-3.5 w-3.5" />
                        {mom.attendees.length} attendee{mom.attendees.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {mom.transcriptUrl && (
                      <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                        <FileText className="h-3.5 w-3.5" />
                        Transcript
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[12px] text-[var(--text-muted)] shrink-0">
                  by {mom.creatorName}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border-subtle)] px-4 py-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className={FIELD}
                      />
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className={FIELD}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={LABEL}>Start Time</label>
                          <input
                            type="time"
                            value={editStartTime}
                            onChange={(e) => setEditStartTime(e.target.value)}
                            className={FIELD}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>End Time</label>
                          <input
                            type="time"
                            value={editEndTime}
                            onChange={(e) => setEditEndTime(e.target.value)}
                            className={FIELD}
                          />
                        </div>
                      </div>
                      <input
                        value={editAttendees}
                        onChange={(e) => setEditAttendees(e.target.value)}
                        placeholder="Attendees (comma-separated)"
                        className={FIELD}
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                        className={TEXTAREA}
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleSaveEdit} disabled={saving}>
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {mom.attendees && mom.attendees.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">Attendees</p>
                          <div className="flex flex-wrap gap-1.5">
                            {mom.attendees.map((a: string, i: number) => (
                              <Badge key={i}>{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mb-3">
                        <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">Minutes</p>
                        <div className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap bg-[var(--bg-primary)] rounded-md p-3">
                          {mom.content}
                        </div>
                      </div>
                      {mom.transcriptUrl && (
                        <div className="mb-3">
                          <a
                            href={mom.transcriptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 h-control px-3 rounded-control border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {mom.transcriptFileName ?? "Download Transcript"}
                          </a>
                        </div>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
                          <Button variant="secondary" onClick={() => startEdit(mom)}>
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button variant="ghost" onClick={() => setDeletingId(mom._id)}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
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
