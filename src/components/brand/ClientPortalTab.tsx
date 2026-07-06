"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, ConfirmModal, useToast } from "@/components/ui";
import ClientJsrTab from "@/components/brand/ClientJsrTab";
import {
  Activity,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Presentation,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface ClientPortalTabProps {
  brandId: Id<"brands">;
  brand: any;
  canManageLinks: boolean;
}

const PORTAL_TAB_OPTIONS: { key: string; label: string }[] = [
  { key: "calendar", label: "Content Calendar" },
  { key: "deck", label: "Client Deck" },
  { key: "new-task", label: "New Task" },
  { key: "messages", label: "Messages" },
  { key: "monthly-log", label: "Monthly Log" },
  { key: "pending-client", label: "Your Pending Work" },
  { key: "pending-agency", label: "Ecultify Pending Work" },
  { key: "feedback", label: "Feedback Log" },
];

const ACTIVITY_LABELS: Record<string, string> = {
  login: "logged in",
  view_tab: "viewed a tab",
  approve_deliverable: "approved a deliverable",
  request_changes: "requested changes on a deliverable",
  deny_deliverable: "denied a deliverable",
  add_remark: "commented",
  submit_request: "submitted a task request",
  approve_deck: "approved a document",
  request_deck_changes: "requested changes on a document",
  submit_feedback: "sent feedback",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function activityLine(a: { action: string; details?: string }): string {
  const base = ACTIVITY_LABELS[a.action] ?? a.action;
  if (!a.details) return base;
  if (a.action === "view_tab") {
    const tab = PORTAL_TAB_OPTIONS.find((t) => t.key === a.details)?.label ?? (a.details === "jsr" ? "JSR Track" : a.details);
    return `viewed ${tab}`;
  }
  try {
    const d = JSON.parse(a.details);
    if (d.title) return `${base} - "${d.title}"`;
    if (d.taskTitle) return `${base} - "${d.taskTitle}"`;
    if (d.note) return `${base}: "${String(d.note).slice(0, 80)}"`;
  } catch {}
  return base;
}

export default function ClientPortalTab({ brandId, brand, canManageLinks }: ClientPortalTabProps) {
  const { toast } = useToast();

  const portal = useQuery(api.clientPortal.getActivePortal, canManageLinks ? { brandId } : "skip");
  const clientUsers = useQuery(api.clientUsers.listClientUsers, canManageLinks ? { brandId } : "skip");
  const activity = useQuery(api.clientPortal.listClientActivity, { brandId, limit: 30 });
  const deckItems = useQuery(api.clientPortal.listDeckItems, { brandId });

  const generatePortalLink = useMutation(api.clientPortal.generatePortalLink);
  const deactivatePortal = useMutation(api.clientPortal.deactivatePortal);
  const updatePortalConfig = useMutation(api.clientPortal.updatePortalConfig);
  const addDeckItem = useMutation(api.clientPortal.addDeckItem);
  const updateDeckItem = useMutation(api.clientPortal.updateDeckItem);
  const deleteDeckItem = useMutation(api.clientPortal.deleteDeckItem);
  const resetClientPassword = useAction(api.clientUsers.adminResetClientPassword);
  const deleteClientUser = useMutation(api.clientUsers.deleteClientUser);
  const addManagerDeckRemark = useMutation(api.clientPortal.addManagerDeckRemark);

  // Portal link state
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Client user state
  const [resetUserId, setResetUserId] = useState<Id<"users"> | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<Id<"users"> | null>(null);

  // Deck state
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [newDeck, setNewDeck] = useState({ title: "", url: "", description: "", category: "deck", requiresApproval: false });
  const [savingDeck, setSavingDeck] = useState(false);
  const [deleteDeckId, setDeleteDeckId] = useState<Id<"clientDeckItems"> | null>(null);
  const [editDeckId, setEditDeckId] = useState<Id<"clientDeckItems"> | null>(null);
  const [editDeck, setEditDeck] = useState({ title: "", url: "", description: "", category: "deck" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deckReplyFor, setDeckReplyFor] = useState<Id<"clientDeckItems"> | null>(null);
  const [deckReply, setDeckReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Legacy section
  const [showLegacy, setShowLegacy] = useState(false);

  const calendarMonth = portal?.calendarMonth ?? "";
  const hiddenTabs = portal?.hiddenTabs ?? [];

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generatePortalLink({ brandId });
      toast("success", "Portal link is active");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to activate portal link");
    }
    setGenerating(false);
  }

  function copyPortalLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`);
    toast("success", "Portal link copied to clipboard");
  }

  async function handleResetPassword() {
    if (!resetUserId || resetPassword.length < 8 || resettingPassword) return;
    setResettingPassword(true);
    try {
      await resetClientPassword({ userId: resetUserId, newPassword: resetPassword });
      toast("success", "Password updated");
      setResetUserId(null);
      setResetPassword("");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to reset password");
    }
    setResettingPassword(false);
  }

  async function toggleTab(key: string) {
    const next = hiddenTabs.includes(key)
      ? hiddenTabs.filter((t) => t !== key)
      : [...hiddenTabs, key];
    try {
      await updatePortalConfig({ brandId, hiddenTabs: next });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update tabs");
    }
  }

  async function handleAddDeck() {
    if (!newDeck.title.trim() || !newDeck.url.trim() || savingDeck) return;
    setSavingDeck(true);
    try {
      const url = /^https?:\/\//i.test(newDeck.url.trim()) ? newDeck.url.trim() : `https://${newDeck.url.trim()}`;
      await addDeckItem({
        brandId,
        title: newDeck.title.trim(),
        url,
        description: newDeck.description.trim() || undefined,
        category: newDeck.category || undefined,
        requiresApproval: newDeck.requiresApproval,
      });
      toast("success", "Document added to Client Deck");
      setNewDeck({ title: "", url: "", description: "", category: "deck", requiresApproval: false });
      setShowAddDeck(false);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to add document");
    }
    setSavingDeck(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* ── LEFT COLUMN ── */}
      <div className="space-y-4 min-w-0">
        {/* Portal Link */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
            <Link2 className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1">Portal Link</span>
          </div>
          <div className="p-4">
            {!canManageLinks ? (
              <p className="text-[12px] text-[var(--text-muted)]">Only admins can manage the portal link.</p>
            ) : portal === undefined ? (
              <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
            ) : portal === null ? (
              <div className="text-center py-2">
                <p className="text-[12px] text-[var(--text-secondary)] mb-3">
                  One login link per brand, named after the brand (for example /portal/
                  {brand?.name ? brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "brand"}).
                  Clients sign in with the accounts created in Users &amp; Teams.
                </p>
                <Button onClick={() => void handleGenerate()} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Activate Portal Link
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <code className="flex-1 text-[11px] text-[var(--text-secondary)] truncate">
                    /portal/{portal.token}
                  </code>
                  <button
                    onClick={() => copyPortalLink(portal.token)}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                    title="Copy link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/portal/${portal.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                    title="Open portal"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setConfirmDeactivate(true)}>
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                    Deactivate
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Active since {new Date(portal.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
                  Deactivating blocks the portal until you activate it again; the URL stays the same.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Client Users */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
            <Users className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1">
              Client Logins {clientUsers ? `(${clientUsers.length})` : ""}
            </span>
            {canManageLinks && (
              <a
                href="/users?tab=clients"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Manage in Users & Teams
              </a>
            )}
          </div>
          <div className="p-4 space-y-3">
            {clientUsers === undefined && canManageLinks ? (
              <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
            ) : !clientUsers || clientUsers.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-2">
                No client logins yet. Create one from Users & Teams → Clients so the client can sign in.
              </p>
            ) : (
              clientUsers.map((u) => (
                <div key={u._id} className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ backgroundColor: brand?.color ?? "#171717" }}>
                    {(u.name ?? u.email ?? "C")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{u.name ?? "-"}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{u.email}</p>
                  </div>
                  {resetUserId === u._id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (resetPassword.length < 8) {
                              toast("error", "Password needs at least 8 characters");
                            } else {
                              void handleResetPassword();
                            }
                          }
                        }}
                        placeholder="New password (min 8 chars)"
                        title="At least 8 characters"
                        className="w-40 px-2 py-1.5 rounded-lg border border-[var(--border)] text-[12px] bg-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => void handleResetPassword()}
                        disabled={resetPassword.length < 8 || resettingPassword}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-emerald-600 disabled:opacity-40"
                        title="Save new password"
                      >
                        {resettingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => { setResetUserId(null); setResetPassword(""); }}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setResetUserId(u._id); setResetPassword(""); }}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                        title="Reset password"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteUserId(u._id)}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-red-500"
                        title="Delete login"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tab Visibility */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
            <Eye className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1">Portal Tabs</span>
          </div>
          <div className="p-4">
            {!portal ? (
              <p className="text-[12px] text-[var(--text-muted)]">Generate a portal link first to configure tabs.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-[12px] text-[var(--text-secondary)]">JSR Track</span>
                  <span className="text-[10px] text-[var(--text-muted)]">Always visible</span>
                </div>
                {PORTAL_TAB_OPTIONS.map((tab) => {
                  const hidden = hiddenTabs.includes(tab.key);
                  return (
                    <div key={tab.key} className="flex items-center justify-between py-1.5">
                      <span className="text-[12px] text-[var(--text-secondary)]">{tab.label}</span>
                      <button
                        onClick={() => void toggleTab(tab.key)}
                        className={`p-1.5 rounded transition-colors ${hidden ? "text-[var(--text-muted)]" : "text-[var(--accent-admin)]"} hover:bg-[var(--bg-hover)]`}
                        title={hidden ? "Show tab" : "Hide tab"}
                      >
                        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
                <div className="pt-2 mt-1 border-t border-[var(--border-subtle)]">
                  <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    Pin Content Calendar to a month (optional)
                  </label>
                  <input
                    type="month"
                    value={calendarMonth}
                    onChange={(e) => void updatePortalConfig({ brandId, calendarMonth: e.target.value }).catch(() => {})}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="space-y-4 min-w-0">
        {/* Client Deck manager */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
            <Presentation className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1">
              Client Deck {deckItems ? `(${deckItems.length})` : ""}
            </span>
            {canManageLinks && (
              <button
                onClick={() => setShowAddDeck(!showAddDeck)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
              >
                {showAddDeck ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showAddDeck ? "Cancel" : "Add"}
              </button>
            )}
          </div>
          <div className="p-4 space-y-3">
            {showAddDeck && (
              <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
                <input
                  value={newDeck.title}
                  onChange={(e) => setNewDeck((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Title (e.g. Q3 Strategy Deck)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
                <input
                  value={newDeck.url}
                  onChange={(e) => setNewDeck((p) => ({ ...p, url: e.target.value }))}
                  placeholder="Link (Slides, Sheets, Figma, gantt…)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
                <input
                  value={newDeck.description}
                  onChange={(e) => setNewDeck((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
                <div className="flex items-center gap-3">
                  <select
                    value={newDeck.category}
                    onChange={(e) => setNewDeck((p) => ({ ...p, category: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none"
                  >
                    <option value="deck">Deck</option>
                    <option value="gantt">Gantt</option>
                    <option value="doc">Document</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={newDeck.requiresApproval}
                      onChange={(e) => setNewDeck((p) => ({ ...p, requiresApproval: e.target.checked }))}
                    />
                    Needs client approval
                  </label>
                </div>
                <Button
                  onClick={() => void handleAddDeck()}
                  disabled={savingDeck || !newDeck.title.trim() || !newDeck.url.trim()}
                  className="w-full"
                >
                  {savingDeck ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Add to Deck
                </Button>
              </div>
            )}

            {deckItems === undefined ? (
              <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
            ) : deckItems.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-2">
                Share decks, gantt charts and documents with the client, optionally requiring their approval.
              </p>
            ) : (
              deckItems.map((item: any) => (
                <div key={item._id} className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  {editDeckId === item._id ? (
                    <div className="space-y-2">
                      <input
                        value={editDeck.title}
                        onChange={(e) => setEditDeck((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Title"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      />
                      {!item.fileKey && (
                        <input
                          value={editDeck.url}
                          onChange={(e) => setEditDeck((p) => ({ ...p, url: e.target.value }))}
                          placeholder="Link"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                      )}
                      <input
                        value={editDeck.description}
                        onChange={(e) => setEditDeck((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={editDeck.category}
                          onChange={(e) => setEditDeck((p) => ({ ...p, category: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-[13px] bg-white focus:outline-none"
                        >
                          <option value="deck">Deck</option>
                          <option value="gantt">Gantt</option>
                          <option value="doc">Document</option>
                        </select>
                        <Button
                          onClick={async () => {
                            if (!editDeck.title.trim() || savingEdit) return;
                            setSavingEdit(true);
                            try {
                              const url = editDeck.url.trim()
                                ? /^https?:\/\//i.test(editDeck.url.trim())
                                  ? editDeck.url.trim()
                                  : `https://${editDeck.url.trim()}`
                                : undefined;
                              await updateDeckItem({
                                deckItemId: item._id,
                                title: editDeck.title.trim(),
                                ...(url ? { url } : {}),
                                description: editDeck.description.trim() || undefined,
                                category: editDeck.category || undefined,
                              });
                              toast("success", "Deck item updated");
                              setEditDeckId(null);
                            } catch (err) {
                              toast("error", err instanceof Error ? err.message : "Failed to update");
                            }
                            setSavingEdit(false);
                          }}
                          disabled={savingEdit || !editDeck.title.trim()}
                        >
                          {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button variant="secondary" onClick={() => setEditDeckId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <a
                          href={item.resolvedUrl ?? item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 text-[12px] font-medium text-[var(--text-primary)] truncate hover:underline"
                        >
                          {item.title}
                        </a>
                        {item.addedByClientName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] shrink-0">
                            From {item.addedByClientName}
                          </span>
                        )}
                        {item.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] capitalize shrink-0">
                            {item.category}
                          </span>
                        )}
                        {item.requiresApproval && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                              item.approvalStatus === "client_approved"
                                ? "text-emerald-600 bg-emerald-50"
                                : item.approvalStatus === "client_changes_requested"
                                  ? "text-amber-600 bg-amber-50"
                                  : "text-[var(--text-muted)] bg-[var(--bg-hover)]"
                            }`}
                          >
                            {item.approvalStatus === "client_approved"
                              ? `Approved${item.reviewedByName ? ` · ${item.reviewedByName}` : ""}`
                              : item.approvalStatus === "client_changes_requested"
                                ? "Changes requested"
                                : "Awaiting approval"}
                          </span>
                        )}
                        {canManageLinks && (
                          <div className="flex items-center shrink-0">
                            <button
                              onClick={() => void updateDeckItem({ deckItemId: item._id, isVisible: !item.isVisible }).catch(() => {})}
                              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                              title={item.isVisible ? "Hide from client" : "Show to client"}
                            >
                              {item.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => void updateDeckItem({ deckItemId: item._id, requiresApproval: !item.requiresApproval }).catch(() => {})}
                              className={`p-1.5 rounded hover:bg-[var(--bg-hover)] ${item.requiresApproval ? "text-[var(--accent-admin)]" : "text-[var(--text-muted)]"}`}
                              title={item.requiresApproval ? "Remove approval requirement" : "Require client approval"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditDeckId(item._id);
                                setEditDeck({
                                  title: item.title,
                                  url: item.url ?? "",
                                  description: item.description ?? "",
                                  category: item.category ?? "deck",
                                });
                              }}
                              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteDeckId(item._id)}
                              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {item.approvalNote && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1.5">
                          Client note: {item.approvalNote}
                        </p>
                      )}
                      {/* Comment thread */}
                      {(item.remarks ?? []).length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-[var(--border-subtle)] pt-2">
                          {item.remarks.map((r: any) => (
                            <p key={r._id} className="text-[11px] text-[var(--text-secondary)]">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {r.senderName ?? (r.senderType === "client" ? "Client" : "Team")}:
                              </span>{" "}
                              {r.content}
                              <span className="text-[var(--text-disabled)]"> · {timeAgo(r.createdAt)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      {deckReplyFor === item._id ? (
                        <div className="flex items-center gap-1.5 mt-2">
                          <input
                            value={deckReply}
                            onChange={(e) => setDeckReply(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter" && deckReply.trim() && !sendingReply) {
                                setSendingReply(true);
                                try {
                                  await addManagerDeckRemark({ deckItemId: item._id, content: deckReply.trim() });
                                  setDeckReply("");
                                  setDeckReplyFor(null);
                                } catch {}
                                setSendingReply(false);
                              }
                            }}
                            placeholder="Reply to the client"
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] bg-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => { setDeckReplyFor(null); setDeckReply(""); }}
                            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeckReplyFor(item._id)}
                          className="mt-1.5 text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
                        >
                          Comment
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Client Activity */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
            <Activity className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1">Client Activity</span>
          </div>
          <div className="p-4">
            {activity === undefined ? (
              <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-2">
                No portal activity yet. Logins, approvals and comments will show up here.
              </p>
            ) : (
              <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
                {activity.map((a: any) => (
                  <div key={a._id} className="flex items-start gap-2.5 py-2 border-b border-[var(--border-subtle)] last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: brand?.color ?? "#171717" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-[var(--text-primary)]">
                        <span className="font-semibold">{a.clientName}</span> {activityLine(a)}
                      </p>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">{timeAgo(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── LEGACY SECTION (full width) ── */}
      <div className="lg:col-span-2">
        <button
          onClick={() => setShowLegacy(!showLegacy)}
          className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-3"
        >
          {showLegacy ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Legacy JSR & intake links (replaced by the portal)
        </button>
        {showLegacy && <ClientJsrTab brandId={brandId} brand={brand} canManageLinks={canManageLinks} />}
      </div>

      {/* Confirm modals */}
      <ConfirmModal
        open={confirmDeactivate}
        title="Deactivate portal?"
        message="Clients will no longer be able to open the portal until a new link is generated. Client accounts, comments and requests are kept."
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (portal) {
            try {
              await deactivatePortal({ portalId: portal._id });
              toast("success", "Portal deactivated");
            } catch (err) {
              toast("error", err instanceof Error ? err.message : "Failed to deactivate");
            }
          }
          setConfirmDeactivate(false);
        }}
        onCancel={() => setConfirmDeactivate(false)}
      />
      <ConfirmModal
        open={deleteUserId !== null}
        title="Delete client login?"
        message="The client will be signed out immediately and can no longer access the portal. Their past comments and requests are kept."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteUserId) {
            try {
              await deleteClientUser({ userId: deleteUserId });
              toast("success", "Client login deleted");
            } catch (err) {
              toast("error", err instanceof Error ? err.message : "Failed to delete");
            }
          }
          setDeleteUserId(null);
        }}
        onCancel={() => setDeleteUserId(null)}
      />
      <ConfirmModal
        open={deleteDeckId !== null}
        title="Delete deck item?"
        message="The document link is removed from the client portal."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteDeckId) {
            try {
              await deleteDeckItem({ deckItemId: deleteDeckId });
              toast("success", "Deck item deleted");
            } catch (err) {
              toast("error", err instanceof Error ? err.message : "Failed to delete");
            }
          }
          setDeleteDeckId(null);
        }}
        onCancel={() => setDeleteDeckId(null)}
      />
    </div>
  );
}
