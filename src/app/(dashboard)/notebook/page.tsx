"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, ConfirmModal, useToast } from "@/components/ui";
import {
  Plus,
  NotebookPen,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Search,
  Archive,
  ArchiveRestore,
  Bell,
  BellRing,
  CheckSquare,
  Square,
  ArrowRightCircle,
  FileText,
  X,
  Tag as TagIcon,
  ClipboardList,
} from "lucide-react";

const NOTE_COLORS = [
  { name: "Default", value: "" },
  { name: "Yellow", value: "#fef9c3" },
  { name: "Green", value: "#dcfce7" },
  { name: "Blue", value: "#dbeafe" },
  { name: "Pink", value: "#fce7f3" },
  { name: "Purple", value: "#ede9fe" },
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const inputCls =
  "w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]";
const labelCls =
  "text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5";

type Note = {
  _id: Id<"personalNotes">;
  title: string;
  content: string;
  date: string;
  brandId?: Id<"brands">;
  brandName?: string | null;
  tags?: string[];
  color?: string;
  pinned?: boolean;
  checklist?: { text: string; done: boolean }[];
  remindAt?: number;
  archived?: boolean;
  convertedTo?: { kind: string; refId: string; at: number };
};

export default function NotebookPage() {
  const user = useQuery(api.users.getCurrentUser);
  const [tab, setTab] = useState<"notes" | "worklog">("notes");

  if (user === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }
  if (!user || user.role !== "admin") {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Access denied. The notebook is available to managers only.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
          My Notebook
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Private notes &amp; your brand-wise daily worklog. Only you can see this.
        </p>
      </div>

      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] w-fit mb-6">
        {[
          { key: "notes" as const, label: "Notes", icon: NotebookPen },
          { key: "worklog" as const, label: "Daily Worklog", icon: ClipboardList },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              tab === key
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "notes" ? <NotesTab /> : <WorklogTab />}
    </div>
  );
}

// ─── NOTES TAB ──────────────────────────────────────────────────

function NotesTab() {
  const { toast } = useToast();
  const [date, setDate] = useState(getTodayStr());
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [scope, setScope] = useState<"day" | "all">("day");

  const brands = useQuery(api.brands.listBrands) ?? [];
  const notes = useQuery(api.personalNotes.listMine, {
    ...(scope === "day" ? { date } : {}),
    ...(brandFilter ? { brandId: brandFilter as Id<"brands"> } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    includeArchived,
  });
  const dueReminders = useQuery(api.personalNotes.dueReminders) ?? [];

  const createNote = useMutation(api.personalNotes.create);
  const updateNote = useMutation(api.personalNotes.update);
  const removeNote = useMutation(api.personalNotes.remove);
  const togglePin = useMutation(api.personalNotes.togglePin);
  const toggleChecklistItem = useMutation(api.personalNotes.toggleChecklistItem);

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [color, setColor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState<Note | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"personalNotes"> | null>(null);
  const [converting, setConverting] = useState<Note | null>(null);
  const [momNote, setMomNote] = useState<Note | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;
    setSubmitting(true);
    try {
      await createNote({
        title: title.trim() || "Untitled note",
        content: content.trim(),
        date,
        ...(brandFilter ? { brandId: brandFilter as Id<"brands"> } : {}),
        tags: tagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        color: color || undefined,
      });
      setTitle("");
      setContent("");
      setTagsStr("");
      setColor("");
      setShowAdd(false);
      toast("success", "Note saved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to save");
    }
    setSubmitting(false);
  }

  return (
    <div>
      {/* Due reminders */}
      {dueReminders.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BellRing className="h-4 w-4 text-amber-600" />
            <p className="text-[13px] font-semibold text-amber-800">
              {dueReminders.length} note{dueReminders.length !== 1 ? "s" : ""} to revisit
            </p>
          </div>
          <div className="space-y-1">
            {dueReminders.map((n: any) => (
              <div
                key={n._id}
                className="flex items-center justify-between text-[12px] text-amber-900"
              >
                <span className="truncate">{n.title}</span>
                <button
                  onClick={async () => {
                    await updateNote({ noteId: n._id, clearReminder: true });
                    toast("success", "Reminder cleared");
                  }}
                  className="text-amber-700 hover:text-amber-900 text-[11px] font-medium shrink-0 ml-3"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-[var(--bg-hover)]">
          {(["day", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                scope === s
                  ? "bg-white shadow-sm text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {s === "day" ? "By Day" : "All Notes"}
            </button>
          ))}
        </div>

        {scope === "day" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)]"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
            />
            <button
              onClick={() => setDate(shiftDate(date, 1))}
              className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)]"
            >
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => setDate(getTodayStr())}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              Today
            </button>
          </div>
        )}

        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
        >
          <option value="">All brands</option>
          {brands.map((b: any) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] pl-8 pr-3 py-1.5 text-[13px]"
          />
        </div>

        <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Show archived
        </label>

        <div className="ml-auto">
          {!showAdd && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Note
            </Button>
          )}
        </div>
      </div>

      {scope === "day" && (
        <p className="text-[12px] text-[var(--text-muted)] mb-4">{formatDate(date)}</p>
      )}

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-[var(--border)] bg-white p-5 mb-6"
        >
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
            New Note
          </h3>
          <div className="mb-4">
            <label className={labelCls}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className={inputCls}
            />
          </div>
          <div className="mb-4">
            <label className={labelCls}>Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note..."
              rows={5}
              className={`${inputCls} resize-y`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Tags (comma-separated)</label>
              <input
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="follow-up, idea"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <div className="flex items-center gap-2 pt-1">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    onClick={() => setColor(c.value)}
                    className={`h-7 w-7 rounded-full border-2 ${
                      color === c.value
                        ? "border-[var(--accent-admin)]"
                        : "border-[var(--border)]"
                    }`}
                    style={{ background: c.value || "#ffffff" }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Note"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Notes list */}
      {notes === undefined ? (
        <p className="text-[13px] text-[var(--text-muted)] py-8">Loading...</p>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-[var(--border)] bg-white">
          <NotebookPen className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            No notes here yet. Click "New Note" to start.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {notes.map((n: any) => (
            <div
              key={n._id}
              className="rounded-xl border border-[var(--border)] p-4 flex flex-col"
              style={{ background: n.color || "#ffffff" }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="font-semibold text-[14px] text-[var(--text-primary)] break-words">
                  {n.title}
                </p>
                <button
                  onClick={() => togglePin({ noteId: n._id })}
                  title={n.pinned ? "Unpin" : "Pin"}
                  className="text-[var(--text-muted)] hover:text-[var(--accent-admin)] shrink-0"
                >
                  {n.pinned ? (
                    <Pin className="h-4 w-4 fill-[var(--accent-admin)] text-[var(--accent-admin)]" />
                  ) : (
                    <PinOff className="h-4 w-4" />
                  )}
                </button>
              </div>

              {n.content && (
                <p className="text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap break-words mb-2">
                  {n.content}
                </p>
              )}

              {n.checklist && n.checklist.length > 0 && (
                <div className="space-y-1 mb-2">
                  {n.checklist.map((item: any, i: number) => (
                    <button
                      key={i}
                      onClick={() =>
                        toggleChecklistItem({ noteId: n._id, index: i })
                      }
                      className="flex items-center gap-2 text-[12px] text-left w-full"
                    >
                      {item.done ? (
                        <CheckSquare className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                      )}
                      <span
                        className={
                          item.done
                            ? "line-through text-[var(--text-muted)]"
                            : "text-[var(--text-primary)]"
                        }
                      >
                        {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {n.brandName && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-primary)]">
                    {n.brandName}
                  </span>
                )}
                {(n.tags ?? []).map((t: string, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/70 text-[var(--text-secondary)] border border-[var(--border)]"
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    {t}
                  </span>
                ))}
                {n.remindAt && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                    <Bell className="h-2.5 w-2.5" />
                    {new Date(n.remindAt).toLocaleDateString()}
                  </span>
                )}
                {n.convertedTo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                    <ArrowRightCircle className="h-2.5 w-2.5" />
                    {n.convertedTo.kind}
                  </span>
                )}
              </div>

              <div className="mt-auto pt-2 border-t border-[var(--border)]/60 flex flex-wrap items-center gap-1">
                <IconBtn label="Edit" onClick={() => setEditing(n)}>
                  <Edit3 className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Convert" onClick={() => setConverting(n)}>
                  <ArrowRightCircle className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Add as MoM" onClick={() => setMomNote(n)}>
                  <FileText className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  label={n.archived ? "Unarchive" : "Archive"}
                  onClick={async () => {
                    await updateNote({
                      noteId: n._id,
                      archived: !n.archived,
                    });
                    toast("success", n.archived ? "Unarchived" : "Archived");
                  }}
                >
                  {n.archived ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                </IconBtn>
                <IconBtn
                  label="Delete"
                  danger
                  onClick={() => setDeletingId(n._id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditNoteModal
          note={editing}
          brands={brands}
          onClose={() => setEditing(null)}
        />
      )}
      {converting && (
        <ConvertModal
          note={converting}
          brands={brands}
          onClose={() => setConverting(null)}
        />
      )}
      {momNote && (
        <AddMomModal
          note={momNote}
          brands={brands}
          onClose={() => setMomNote(null)}
        />
      )}

      <ConfirmModal
        open={!!deletingId}
        title="Delete Note"
        message="Delete this note permanently? This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingId) {
            await removeNote({ noteId: deletingId });
            toast("success", "Note deleted");
          }
          setDeletingId(null);
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
        danger
          ? "text-[var(--danger)] hover:bg-[var(--danger)]/10"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── EDIT NOTE MODAL (title, content, tags, color, checklist, reminder) ──

function EditNoteModal({
  note,
  brands,
  onClose,
}: {
  note: Note;
  brands: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const updateNote = useMutation(api.personalNotes.update);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tagsStr, setTagsStr] = useState((note.tags ?? []).join(", "));
  const [color, setColor] = useState(note.color ?? "");
  const [brandId, setBrandId] = useState<string>(note.brandId ?? "");
  const [checklist, setChecklist] = useState(note.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [remindDate, setRemindDate] = useState(
    note.remindAt
      ? new Date(note.remindAt).toISOString().slice(0, 16)
      : ""
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateNote({
        noteId: note._id,
        title: title.trim() || "Untitled note",
        content: content.trim(),
        tags: tagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        color: color || undefined,
        ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
        checklist,
        ...(remindDate
          ? { remindAt: new Date(remindDate).getTime() }
          : { clearReminder: true }),
      });
      toast("success", "Note updated");
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update");
    }
    setSaving(false);
  }

  return (
    <Modal onClose={onClose} title="Edit Note">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Brand</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={inputCls}
            >
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tags</label>
            <input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <div className="flex items-center gap-2">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColor(c.value)}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === c.value
                    ? "border-[var(--accent-admin)]"
                    : "border-[var(--border)]"
                }`}
                style={{ background: c.value || "#ffffff" }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Checklist</label>
          <div className="space-y-1.5 mb-2">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setChecklist((cl) =>
                      cl.map((it, idx) =>
                        idx === i ? { ...it, done: !it.done } : it
                      )
                    )
                  }
                >
                  {item.done ? (
                    <CheckSquare className="h-4 w-4 text-green-600" />
                  ) : (
                    <Square className="h-4 w-4 text-[var(--text-muted)]" />
                  )}
                </button>
                <span
                  className={`flex-1 text-[13px] ${
                    item.done
                      ? "line-through text-[var(--text-muted)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setChecklist((cl) => cl.filter((_, idx) => idx !== i))
                  }
                  className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim()) {
                  e.preventDefault();
                  setChecklist((cl) => [
                    ...cl,
                    { text: newItem.trim(), done: false },
                  ]);
                  setNewItem("");
                }
              }}
              placeholder="Add a checklist item, press Enter"
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Revisit reminder (optional)</label>
          <input
            type="datetime-local"
            value={remindDate}
            onChange={(e) => setRemindDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── CONVERT MODAL ──────────────────────────────────────────────

function ConvertModal({
  note,
  brands,
  onClose,
}: {
  note: Note;
  brands: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const teams = useQuery(api.teams.listTeams) ?? [];
  const users = useQuery(api.users.listAllUsers) ?? [];
  const createEntryForBrand = useMutation(api.contentCalendar.createEntryForBrand);
  const createIndividualTaskBrief = useMutation(
    api.briefs.createIndividualTaskBrief
  );
  const createBrief = useMutation(api.briefs.createBrief);
  const markConverted = useMutation(api.personalNotes.markConverted);

  const [kind, setKind] = useState<"task" | "calendar" | "brief">("task");
  const [brandId, setBrandId] = useState<string>(note.brandId ?? "");
  const [teamId, setTeamId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [deadline, setDeadline] = useState<string>("");
  const [postDate, setPostDate] = useState<string>(note.date);
  const [briefType, setBriefType] = useState<string>("developmental");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const title = note.title || "Untitled note";
      const description = note.content || undefined;
      if (kind === "calendar") {
        if (!brandId) throw new Error("Pick a brand for the calendar entry");
        const taskId = await createEntryForBrand({
          brandId: brandId as Id<"brands">,
          title,
          description,
          ...(assigneeId ? { assigneeId: assigneeId as Id<"users"> } : {}),
          platform: "Other",
          contentType: "Post",
          postDate,
        });
        await markConverted({
          noteId: note._id,
          kind: "calendar",
          refId: String(taskId),
        });
      } else if (kind === "task") {
        if (!teamId || !assigneeId)
          throw new Error("Pick a team and assignee for the task");
        const briefId = await createIndividualTaskBrief({
          title,
          description,
          ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
          teams: [
            {
              teamId: teamId as Id<"teams">,
              assigneeId: assigneeId as Id<"users">,
              ...(deadline
                ? { deadline: new Date(deadline + "T23:59:59").getTime() }
                : {}),
            },
          ],
        });
        await markConverted({
          noteId: note._id,
          kind: "task",
          refId: String(briefId),
        });
      } else {
        const briefId = await createBrief({
          title,
          description: note.content || title,
          briefType: briefType as any,
          ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
          ...(teamId ? { teamIds: [teamId as Id<"teams">] } : {}),
          ...(deadline
            ? { deadline: new Date(deadline + "T23:59:59").getTime() }
            : {}),
        });
        await markConverted({
          noteId: note._id,
          kind: "brief",
          refId: String(briefId),
        });
      }
      toast("success", "Note converted");
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to convert");
    }
    setBusy(false);
  }

  return (
    <Modal onClose={onClose} title="Convert Note">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Convert into</label>
          <div className="flex gap-1.5 p-0.5 rounded-lg bg-[var(--bg-hover)]">
            {[
              { k: "task" as const, l: "Individual Task" },
              { k: "calendar" as const, l: "Content Calendar" },
              { k: "brief" as const, l: "Master Brief" },
            ].map(({ k, l }) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  kind === k
                    ? "bg-white shadow-sm text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Brand {kind === "calendar" ? "(required)" : "(optional)"}
          </label>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={inputCls}
          >
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {(kind === "task" || kind === "brief") && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Team {kind === "task" ? "(required)" : "(optional)"}
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select team</option>
                {teams.map((t: any) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {kind === "task" && (
              <div>
                <label className={labelCls}>Assignee (required)</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select assignee</option>
                  {users.map((u: any) => (
                    <option key={u._id} value={u._id}>
                      {u.name ?? u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {kind === "calendar" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Post date</label>
              <input
                type="date"
                value={postDate}
                onChange={(e) => setPostDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Assignee (optional)</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {users.map((u: any) => (
                  <option key={u._id} value={u._id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {kind === "brief" && (
          <div>
            <label className={labelCls}>Brief type</label>
            <select
              value={briefType}
              onChange={(e) => setBriefType(e.target.value)}
              className={inputCls}
            >
              <option value="developmental">Developmental</option>
              <option value="designing">Designing</option>
              <option value="video_editing">Video Editing</option>
              <option value="copywriting">Copywriting</option>
            </select>
          </div>
        )}

        {(kind === "task" || kind === "brief") && (
          <div>
            <label className={labelCls}>Deadline (optional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

        <div className="rounded-lg bg-[var(--bg-hover)] p-3 text-[12px] text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">
            {note.title || "Untitled note"}
          </span>
          {note.content ? ` — ${note.content.slice(0, 120)}` : ""}
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Converting..." : "Convert"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── ADD AS BRAND MoM MODAL ─────────────────────────────────────

function AddMomModal({
  note,
  brands,
  onClose,
}: {
  note: Note;
  brands: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const createMom = useMutation(api.meetingMinutes.create);
  const markConverted = useMutation(api.personalNotes.markConverted);
  const [brandId, setBrandId] = useState<string>(note.brandId ?? "");
  const [title, setTitle] = useState(note.title || "Meeting");
  const [meetingDate, setMeetingDate] = useState(note.date);
  const [attendeesStr, setAttendeesStr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!brandId) {
      toast("error", "Pick the brand this MoM belongs to");
      return;
    }
    setBusy(true);
    try {
      const momId = await createMom({
        brandId: brandId as Id<"brands">,
        title: title.trim() || "Meeting",
        meetingDate: new Date(meetingDate + "T00:00:00").getTime(),
        content: note.content || note.title,
        attendees: attendeesStr
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      });
      await markConverted({
        noteId: note._id,
        kind: "mom",
        refId: String(momId),
      });
      toast("success", "Added to the brand's MoM page");
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to add MoM");
    }
    setBusy(false);
  }

  return (
    <Modal onClose={onClose} title="Add as Brand MoM">
      <div className="space-y-4">
        <p className="text-[12px] text-[var(--text-secondary)]">
          This posts the note as Minutes of Meeting on the selected brand's MoM
          page.
        </p>
        <div>
          <label className={labelCls}>Brand (required)</label>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select brand</option>
            {brands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Meeting title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Meeting date</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Attendees (comma-separated)</label>
            <input
              value={attendeesStr}
              onChange={(e) => setAttendeesStr(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Adding..." : "Add MoM"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── DAILY WORKLOG TAB ──────────────────────────────────────────

function WorklogTab() {
  const { toast } = useToast();
  const [date, setDate] = useState(getTodayStr());
  const managedBrands = useQuery(api.managerWorklog.myManagedBrands) ?? [];
  const entries = useQuery(api.managerWorklog.listMine, { date });
  const addEntry = useMutation(api.managerWorklog.addEntry);
  const updateEntry = useMutation(api.managerWorklog.updateEntry);
  const deleteEntry = useMutation(api.managerWorklog.deleteEntry);
  const toggleDone = useMutation(api.managerWorklog.toggleDone);

  const [brandId, setBrandId] = useState<string>("");
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] =
    useState<Id<"managerWorklog"> | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editHours, setEditHours] = useState("");
  const [deletingId, setDeletingId] =
    useState<Id<"managerWorklog"> | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId || !content.trim()) {
      toast("error", "Pick a brand and write what you did");
      return;
    }
    setSubmitting(true);
    try {
      await addEntry({
        brandId: brandId as Id<"brands">,
        date,
        content: content.trim(),
        ...(hours ? { hoursSpent: Number(hours) } : {}),
      });
      setContent("");
      setHours("");
      toast("success", "Worklog saved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to save");
    }
    setSubmitting(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => setDate(shiftDate(date, -1))}
          className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)]"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
        />
        <button
          onClick={() => setDate(shiftDate(date, 1))}
          className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)]"
        >
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
        <button
          onClick={() => setDate(getTodayStr())}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          Today
        </button>
        <span className="text-[12px] text-[var(--text-muted)] ml-1">
          {formatDate(date)}
        </span>
      </div>

      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-[var(--border)] bg-white p-5 mb-6"
      >
        <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-4">
          Log work for {formatDate(date)}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelCls}>Brand</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select brand</option>
              {managedBrands.map((b: any) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Hours spent (optional)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 2.5"
              className={inputCls}
            />
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls}>What did you do for this brand?</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Summary of work done today for this brand..."
            className={`${inputCls} resize-y`}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save Worklog"}
        </Button>
      </form>

      {entries === undefined ? (
        <p className="text-[13px] text-[var(--text-muted)] py-8">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-[var(--border)] bg-white">
          <ClipboardList className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            No worklog entries for this day.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e: any) => (
            <div
              key={e._id}
              className="rounded-xl border border-[var(--border)] bg-white p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleDone({ entryId: e._id })}
                    title={e.done ? "Mark as not done" : "Mark as done"}
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--accent-employee)] transition-colors"
                  >
                    {e.done ? (
                      <CheckSquare className="h-4 w-4 text-[var(--accent-employee)]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                    style={{ background: e.brandColor }}
                  >
                    {e.brandName}
                  </span>
                  {e.done && (
                    <span className="text-[10px] font-medium text-[var(--accent-employee)] uppercase tracking-wider">
                      Done
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {e.hoursSpent != null && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {e.hoursSpent}h
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(e._id);
                      setEditContent(e.content);
                      setEditHours(
                        e.hoursSpent != null ? String(e.hoursSpent) : ""
                      );
                    }}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingId(e._id)}
                    className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {editingId === e._id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(ev) => setEditContent(ev.target.value)}
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editHours}
                    onChange={(ev) => setEditHours(ev.target.value)}
                    placeholder="Hours"
                    className={inputCls}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        await updateEntry({
                          entryId: e._id,
                          content: editContent.trim(),
                          ...(editHours
                            ? { hoursSpent: Number(editHours) }
                            : {}),
                        });
                        setEditingId(null);
                        toast("success", "Updated");
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className={`text-[13px] whitespace-pre-wrap ${
                    e.done
                      ? "line-through text-[var(--text-muted)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {e.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deletingId}
        title="Delete Worklog Entry"
        message="Delete this worklog entry? This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingId) {
            await deleteEntry({ entryId: deletingId });
            toast("success", "Deleted");
          }
          setDeletingId(null);
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

// ─── SHARED MODAL SHELL ─────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-[var(--border)] w-full max-w-xl my-8 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
