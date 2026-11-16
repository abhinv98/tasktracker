"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionHeader,
  SegmentedTabs,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { EchoCard } from "@/components/EchoCard";
import {
  Camera,
  Loader2,
  Lightbulb,
  Paperclip,
  Pencil,
  Shield,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { getDisplayRole } from "@/lib/roles";
import type { Id } from "@/convex/_generated/dataModel";

type ProfileTab = "account" | "suggestions";
type AdminView = "mine" | "all";
type SuggestionStatus = "new" | "reviewing" | "planned" | "done" | "declined";

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

// The label carries the stage; colour is kept for the one that means
// something on its own (done).
const STATUS_VARIANT: Record<SuggestionStatus, "status" | "neutral" | "success"> = {
  new: "status",
  reviewing: "neutral",
  planned: "neutral",
  done: "success",
  declined: "neutral",
};

function StatusPill({ status }: { status: SuggestionStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}

function formatWhen(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ProfilePage() {
  const user = useQuery(api.users.getCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);
  const updateProfileImage = useMutation(api.users.updateProfileImage);
  const removeProfileImage = useMutation(api.users.removeProfileImage);
  const generateUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const changePasswordAction = useAction(api.passwordChange.changePassword);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("account");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  if (user === undefined) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[var(--text-muted)]">Loading...</p>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  const displayName = name || user.name || user.email || "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({ name: displayName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast("success", "Profile updated");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update profile",
      );
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("error", "Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("error", "Image must be under 5MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("The upload was refused");
      const { storageId } = await res.json();
      await updateProfileImage({ storageId });
      toast("success", "Profile photo updated");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to upload photo",
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    try {
      await removeProfileImage();
      toast("success", "Profile photo removed");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to remove photo",
      );
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");

    if (!currentPassword) {
      setPwError("Please enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }

    setPwSaving(true);
    try {
      await changePasswordAction({ currentPassword, newPassword });
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPwForm(false);
      setTimeout(() => setPwSuccess(false), 3000);
      toast("success", "Password updated");
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setPwSaving(false);
    }
  }

  return (
    // Page used to clamp at max-w-3xl which left a huge dead band on the
    // right when Suggestion Box landed on the All Suggestions view (and
    // truncated the tab underline). Drop the page-level cap; the Account
    // form keeps its own max-w-xl below so it stays compact.
    <div className="p-8">
      <PageHeader title="Profile" subtitle="Manage your account" />

      {/* ═══ TAB BAR ═══ */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)] -mx-8 px-8">
        {(
          [
            { id: "account" as ProfileTab, label: "Account", icon: UserIcon },
            {
              id: "suggestions" as ProfileTab,
              label: "Suggestion Box",
              icon: Lightbulb,
            },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: ACCOUNT ═══ */}
      {activeTab === "account" && (
        // Two columns from lg up: who you are on the left, password and Echo on
        // the right. One column below that, in the same order as before.
        <div className="grid gap-4 lg:grid-cols-2 items-start max-w-6xl">
          <Card>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {/* Profile Photo */}
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-3">
                  Profile photo
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    {user.avatarUrl || user.image ? (
                      <img
                        src={user.avatarUrl || user.image}
                        alt="Profile"
                        className="w-20 h-20 rounded-full object-cover border-2 border-[var(--border)]"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-[var(--accent-admin-strong)] flex items-center justify-center border-2 border-[var(--border)]">
                        <span className="text-white text-[24px] font-bold">
                          {(user.name ?? user.email ?? "?")
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      aria-label="Change profile photo"
                      className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      ) : (
                        <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="text-[13px] font-medium text-[var(--accent-admin-text)] hover:underline disabled:opacity-50 text-left"
                    >
                      {uploadingPhoto ? "Uploading..." : "Upload photo"}
                    </button>
                    {(user.avatarUrl || user.image) && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--danger)] hover:underline text-left transition-colors"
                      >
                        Remove photo
                      </button>
                    )}
                    <p className="text-[12px] text-[var(--text-muted)]">
                      JPG, PNG or GIF. Max 5MB.
                    </p>
                  </div>
                </div>
              </div>

              <Input
                label="Name"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
              />
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Email
                </label>
                <p className="text-[var(--text-primary)]">
                  {user.email ?? "-"}
                </p>
              </div>
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Role
                </label>
                <Badge variant={user.role === "admin" ? "admin" : "employee"}>
                  {getDisplayRole(user)}
                </Badge>
              </div>
              <Button type="submit" variant="primary">
                {saved ? "Saved" : "Save"}
              </Button>
            </form>
          </Card>

          <div className="flex flex-col gap-4 min-w-0">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
                  Password
                </h2>
                <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                  Update your password
                </p>
              </div>
              {!showPwForm && (
                <Button variant="secondary" onClick={() => setShowPwForm(true)}>
                  Change Password
                </Button>
              )}
            </div>

            {pwSuccess && (
              <div className="rounded-md bg-[var(--accent-employee-dim)] px-3 py-2 text-[12px] text-[var(--accent-employee-text)] mb-4">
                Password updated successfully
              </div>
            )}

            {showPwForm && (
              <form
                onSubmit={handlePasswordChange}
                className="flex flex-col gap-4"
              >
                <Input
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                />
                <Input
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
                {pwError && (
                  <p className="text-[13px] text-[var(--danger)]">{pwError}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" disabled={pwSaving}>
                    {pwSaving ? "Updating..." : "Update Password"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowPwForm(false);
                      setPwError("");
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </Card>

          <EchoCard email={user.email} />
          </div>
        </div>
      )}

      {/* ═══ TAB: SUGGESTION BOX ═══ */}
      {activeTab === "suggestions" && (
        <SuggestionBox isSuperAdmin={!!user.isSuperAdmin} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  SUGGESTION BOX
// ═══════════════════════════════════════════════════════

function SuggestionBox({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [view, setView] = useState<AdminView>("mine");

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
          Suggestion Box
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          Have an idea to improve the platform? Drop it here. Your submissions
          go straight to the super admins.
        </p>
      </div>

      {isSuperAdmin && (
        <div className="mb-4">
          <SegmentedTabs
            value={view}
            options={[
              { value: "mine", label: "My Suggestions", icon: UserIcon },
              { value: "all", label: "All Suggestions", icon: Shield },
            ]}
            onChange={setView}
          />
        </div>
      )}

      {view === "mine" && <MySuggestionsView />}
      {view === "all" && isSuperAdmin && <AllSuggestionsView />}
    </div>
  );
}

// ─── USER VIEW: submit + list your own ───────────────────

const SUGGESTION_FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

function MySuggestionsView() {
  const mySuggestions = useQuery(api.suggestions.listMine);
  const createSuggestion = useMutation(api.suggestions.create);
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      toast("error", "Please write your suggestion first");
      return;
    }
    // Checked again on the server; this just avoids uploading a file that
    // would be refused.
    if (file && !SUGGESTION_FILE_ACCEPT.split(",").includes(file.type)) {
      toast("error", "Attach an image (PNG, JPG, WebP, GIF) or a PDF");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      toast("error", "The attached file is too large (max 10 MB)");
      return;
    }
    setSubmitting(true);
    try {
      let fileId: Id<"_storage"> | undefined;
      if (file) {
        const res = await fetch(await generateUploadUrl(), {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Could not upload the file. Please try again.");
        fileId = (await res.json()).storageId;
      }
      await createSuggestion({
        title: title.trim() || undefined,
        content: content.trim(),
        ...(fileId ? { fileId, fileName: file!.name } : {}),
      });
      setTitle("");
      setContent("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast("success", "Suggestion submitted. Thank you!");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to submit suggestion",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-1">
              New suggestion
            </h3>
            <p className="text-[12px] text-[var(--text-muted)]">
              Shared privately with super admins only.
            </p>
          </div>
          <Input
            label="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.g. Add keyboard shortcut for task review"
            maxLength={200}
          />
          <Textarea
            label="Suggestion"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Describe your idea. What would it change? Why would it help?"
            maxLength={5000}
          />
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
            Screenshot or PDF (optional, max 10 MB)
            <input
              ref={fileInputRef}
              type="file"
              accept={SUGGESTION_FILE_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[13px] font-normal text-[var(--text-primary)]"
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
              {content.length}/5000
            </span>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit suggestion"}
            </Button>
          </div>
        </form>
      </Card>

      <div>
        <SectionHeader title="Your submissions" count={mySuggestions?.length} />

        {mySuggestions === undefined ? (
          <p className="text-[13px] text-[var(--text-muted)]">Loading...</p>
        ) : mySuggestions.length === 0 ? (
          <EmptyState title="You haven't submitted any suggestions yet." />
        ) : (
          <div className="flex flex-col gap-3">
            {mySuggestions.map((s) => (
              <MySuggestionItem key={s._id} suggestion={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionFile({ suggestion }: { suggestion: { fileUrl: string | null; fileName?: string } }) {
  if (!suggestion.fileUrl) return null;
  return (
    <a
      href={suggestion.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
    >
      <Paperclip className="h-3.5 w-3.5" />
      {suggestion.fileName ?? "Attachment"}
    </a>
  );
}

function MySuggestionItem({
  suggestion,
}: {
  suggestion: {
    _id: Id<"suggestions">;
    title?: string;
    content: string;
    fileUrl: string | null;
    fileName?: string;
    status: SuggestionStatus;
    adminNote?: string;
    createdAt: number;
    updatedAt: number;
  };
}) {
  const updateMine = useMutation(api.suggestions.updateMine);
  const removeSuggestion = useMutation(api.suggestions.remove);
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(suggestion.title ?? "");
  const [editContent, setEditContent] = useState(suggestion.content);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSave() {
    if (!editContent.trim()) {
      toast("error", "Suggestion cannot be empty");
      return;
    }
    setSaving(true);
    try {
      await updateMine({
        suggestionId: suggestion._id,
        title: editTitle.trim() || undefined,
        content: editContent.trim(),
      });
      toast("success", "Suggestion updated");
      setEditing(false);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await removeSuggestion({ suggestionId: suggestion._id });
      toast("success", "Suggestion deleted");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to delete",
      );
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={200}
            />
          ) : (
            <h4 className="font-medium text-[14px] text-[var(--text-primary)] truncate">
              {suggestion.title || "Untitled suggestion"}
            </h4>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusPill status={suggestion.status} />
            <span className="text-[12px] text-[var(--text-muted)]">
              Submitted {formatWhen(suggestion.createdAt)}
              {suggestion.updatedAt !== suggestion.createdAt &&
                ` · edited ${formatWhen(suggestion.updatedAt)}`}
            </span>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setEditTitle(suggestion.title ?? "");
                setEditContent(suggestion.content);
                setEditing(true);
              }}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="Edit"
              aria-label="Edit suggestion"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
              title="Delete"
              aria-label="Delete suggestion"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 mt-3">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={5000}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed mt-2">
          {suggestion.content}
        </p>
      )}
      <SuggestionFile suggestion={suggestion} />

      {suggestion.adminNote && !editing && (
        <div className="mt-3 rounded-md bg-[var(--bg-primary)] px-3 py-2">
          <div className="mb-1">
            <span className="text-[12px] font-medium text-[var(--text-muted)]">
              Response from admin
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
            {suggestion.adminNote}
          </p>
        </div>
      )}

      {confirmingDelete && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-[var(--danger-dim)] pl-3 pr-2 py-2">
          <p className="text-[13px] text-[var(--text-primary)]">
            Delete this suggestion?
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── SUPER ADMIN VIEW: all suggestions ─────────────────

function AllSuggestionsView() {
  const allSuggestions = useQuery(api.suggestions.listAll);
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "all">(
    "all",
  );

  const filtered = useMemo(() => {
    if (!allSuggestions) return allSuggestions;
    if (statusFilter === "all") return allSuggestions;
    return allSuggestions.filter((s) => s.status === statusFilter);
  }, [allSuggestions, statusFilter]);

  if (allSuggestions === undefined) {
    return (
      <p className="text-[13px] text-[var(--text-muted)]">Loading...</p>
    );
  }

  if (allSuggestions === null) {
    return (
      <p className="text-[13px] text-[var(--text-muted)]">
        Only super admins can view all suggestions.
      </p>
    );
  }

  const counts = allSuggestions.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<SuggestionStatus, number>,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[12px] text-[var(--text-muted)] font-medium">
          Filter:
        </span>
        <SegmentedTabs<SuggestionStatus | "all">
          value={statusFilter}
          options={[
            { value: "all", label: `All (${allSuggestions.length})` },
            { value: "new", label: `New (${counts.new ?? 0})` },
            { value: "reviewing", label: `Reviewing (${counts.reviewing ?? 0})` },
            { value: "planned", label: `Planned (${counts.planned ?? 0})` },
            { value: "done", label: `Done (${counts.done ?? 0})` },
            { value: "declined", label: `Declined (${counts.declined ?? 0})` },
          ]}
          onChange={setStatusFilter}
          className="flex-wrap"
        />
      </div>

      {!filtered || filtered.length === 0 ? (
        <EmptyState
          title={`No suggestions${statusFilter !== "all" ? ` with status "${STATUS_LABELS[statusFilter]}"` : ""}.`}
        />
      ) : (
        // Two-column masonry layout. CSS `columns` keeps the natural
        // newest-first order (the listAll query already sorts createdAt
        // DESC) while letting cards of different heights tile cleanly
        // without leaving rectangular gaps. Drops to a single column on
        // narrow screens.
        <div className="columns-1 md:columns-2 gap-3 [column-fill:_balance]">
          {filtered.map((s) => (
            <div
              key={s._id}
              className="mb-3 break-inside-avoid"
            >
              <AdminSuggestionItem suggestion={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminSuggestionItem({
  suggestion,
}: {
  suggestion: {
    _id: Id<"suggestions">;
    title?: string;
    content: string;
    fileUrl: string | null;
    fileName?: string;
    status: SuggestionStatus;
    adminNote?: string;
    authorName: string;
    authorEmail: string | null;
    authorAvatarUrl: string | null;
    authorIsSuperAdmin: boolean;
    reviewerName?: string | null;
    reviewedAt?: number;
    createdAt: number;
    updatedAt: number;
  };
}) {
  const updateStatus = useMutation(api.suggestions.updateStatus);
  const removeSuggestion = useMutation(api.suggestions.remove);
  const { toast } = useToast();

  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(suggestion.adminNote ?? "");
  const [draftStatus, setDraftStatus] = useState<SuggestionStatus>(
    suggestion.status,
  );
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateStatus({
        suggestionId: suggestion._id,
        status: draftStatus,
        adminNote: draftNote.trim() || undefined,
      });
      toast("success", "Suggestion updated");
      setEditingNote(false);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(status: SuggestionStatus) {
    try {
      await updateStatus({
        suggestionId: suggestion._id,
        status,
        adminNote: suggestion.adminNote,
      });
      toast("success", `Marked as ${STATUS_LABELS[status]}`);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update",
      );
    }
  }

  async function handleDelete() {
    try {
      await removeSuggestion({ suggestionId: suggestion._id });
      toast("success", "Suggestion deleted");
    } catch {
      toast("error", "Failed to delete");
    }
  }

  const initial = (suggestion.authorName || "?").charAt(0).toUpperCase();

  return (
    <Card>
      <div className="flex items-start gap-3">
        {suggestion.authorAvatarUrl ? (
          <img
            src={suggestion.authorAvatarUrl}
            alt={suggestion.authorName}
            className="w-9 h-9 rounded-full object-cover border border-[var(--border)] flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-[var(--accent-admin-strong)] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[13px] font-semibold">
              {initial}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[13px] text-[var(--text-primary)]">
                  {suggestion.authorName}
                </span>
                {suggestion.authorIsSuperAdmin && (
                  <Badge variant="admin">Super Admin</Badge>
                )}
                <StatusPill status={suggestion.status} />
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {suggestion.authorEmail ?? "-"} ·{" "}
                {formatWhen(suggestion.createdAt)}
                {suggestion.updatedAt !== suggestion.createdAt &&
                  ` · edited ${formatWhen(suggestion.updatedAt)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
              title="Delete suggestion"
              aria-label="Delete suggestion"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {suggestion.title && (
            <h4 className="font-medium text-[14px] text-[var(--text-primary)] mt-3">
              {suggestion.title}
            </h4>
          )}
          <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed mt-2">
            {suggestion.content}
          </p>
          <SuggestionFile suggestion={suggestion} />

          {/* Quick status pills */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-[12px] text-[var(--text-muted)] font-medium">
              Set status:
            </span>
            {(
              ["new", "reviewing", "planned", "done", "declined"] as const
            ).map((s) => (
              <button
                key={s}
                type="button"
                disabled={suggestion.status === s}
                onClick={() => handleQuickStatus(s)}
                aria-pressed={suggestion.status === s}
                className={`text-[12px] px-2 py-0.5 rounded-full border transition-colors ${
                  suggestion.status === s
                    ? "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-primary)] font-medium cursor-default"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Admin note */}
          {suggestion.adminNote && !editingNote && (
            <div className="mt-3 rounded-md bg-[var(--bg-primary)] px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">
                  Your response
                  {suggestion.reviewerName
                    ? ` · by ${suggestion.reviewerName}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraftNote(suggestion.adminNote ?? "");
                    setDraftStatus(suggestion.status);
                    setEditingNote(true);
                  }}
                  className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
                >
                  Edit
                </button>
              </div>
              <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
                {suggestion.adminNote}
              </p>
            </div>
          )}

          {!suggestion.adminNote && !editingNote && (
            <button
              type="button"
              onClick={() => {
                setDraftNote("");
                setDraftStatus(suggestion.status);
                setEditingNote(true);
              }}
              className="mt-3 text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
            >
              + Add response
            </button>
          )}

          {editingNote && (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3">
              <Select
                label="Status"
                value={draftStatus}
                onChange={(e) =>
                  setDraftStatus(e.target.value as SuggestionStatus)
                }
                options={[
                  { value: "new", label: "New" },
                  { value: "reviewing", label: "Reviewing" },
                  { value: "planned", label: "Planned" },
                  { value: "done", label: "Done" },
                  { value: "declined", label: "Declined" },
                ]}
              />
              <Textarea
                label="Response note (optional)"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Share context, ask a question, or explain the decision..."
                maxLength={2000}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingNote(false)}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {confirmingDelete && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-[var(--danger-dim)] pl-3 pr-2 py-2">
              <p className="text-[13px] text-[var(--text-primary)]">
                Delete this suggestion? This cannot be undone.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
