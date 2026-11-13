"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, ConfirmModal, useToast } from "@/components/ui";
import ClientJsrTab from "@/components/brand/ClientJsrTab";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";

const ICON_BTN = iconButtonClass;
const ICON_BTN_DANGER = iconButtonDangerClass;
const FIELD = fieldClass;
const COUNT = "font-normal tabular-nums text-[var(--text-muted)]";

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
  /** undefined = all months visible; array = restricted allowlist. */
  const visibleMonths: string[] | undefined = portal?.visibleCalendarMonths;
  const calendarMonths = useQuery(
    api.clientPortal.listBrandCalendarMonths,
    canManageLinks ? { brandId } : "skip"
  );

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
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 h-11 px-4 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">Portal Link</span>
          </div>
          <div className="p-4">
            {!canManageLinks ? (
              <p className="text-[13px] text-[var(--text-muted)]">Only admins can manage the portal link.</p>
            ) : portal === undefined ? (
              <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
            ) : portal === null ? (
              <div>
                <p className="text-[13px] text-[var(--text-secondary)] mb-3">
                  One login link per brand, named after the brand (for example /portal/
                  {brand?.name ? brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "brand"}).
                  Clients sign in with the accounts created in Users &amp; Teams.
                </p>
                <Button onClick={() => void handleGenerate()} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Activate Portal Link
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-md bg-[var(--bg-primary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-employee)] shrink-0" />
                  <code className="flex-1 text-[12px] text-[var(--text-secondary)] truncate">
                    /portal/{portal.token}
                  </code>
                  <button
                    onClick={() => copyPortalLink(portal.token)}
                    className={ICON_BTN}
                    title="Copy link"
                    aria-label="Copy link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/portal/${portal.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ICON_BTN}
                    title="Open portal"
                    aria-label="Open portal"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setConfirmDeactivate(true)}>
                    <Ban className="h-3.5 w-3.5" />
                    Deactivate
                  </Button>
                </div>
                <p className="text-[12px] text-[var(--text-muted)]">
                  Active since {new Date(portal.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
                  Deactivating blocks the portal until you activate it again; the URL stays the same.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Client Users */}
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 h-11 px-4 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">
              Client Logins{clientUsers && clientUsers.length > 0 && <span className={COUNT}> {clientUsers.length}</span>}
            </span>
            {canManageLinks && (
              <a
                href="/users?tab=clients"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Manage in Users & Teams
              </a>
            )}
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {clientUsers === undefined && canManageLinks ? (
              <p className="px-4 py-3.5 text-[13px] text-[var(--text-muted)]">Loading…</p>
            ) : !clientUsers || clientUsers.length === 0 ? (
              <p className="px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
                No client logins yet. Create one from Users & Teams → Clients so the client can sign in.
              </p>
            ) : (
              clientUsers.map((u) => (
                <div key={u._id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium text-white shrink-0" style={{ backgroundColor: brand?.color ?? "#171717" }}>
                    {(u.name ?? u.email ?? "C")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{u.name ?? "-"}</p>
                    <p className="text-[12px] text-[var(--text-muted)] truncate">{u.email}</p>
                  </div>
                  {resetUserId === u._id ? (
                    <div className="flex items-center gap-1">
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
                        aria-label="New password"
                        className={`${FIELD} w-44`}
                        autoFocus
                      />
                      <button
                        onClick={() => void handleResetPassword()}
                        disabled={resetPassword.length < 8 || resettingPassword}
                        className={`${ICON_BTN} disabled:opacity-40`}
                        title="Save new password"
                        aria-label="Save new password"
                      >
                        {resettingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => { setResetUserId(null); setResetPassword(""); }}
                        className={ICON_BTN}
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <button
                        onClick={() => { setResetUserId(u._id); setResetPassword(""); }}
                        className={ICON_BTN}
                        title="Reset password"
                        aria-label="Reset password"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteUserId(u._id)}
                        className={ICON_BTN_DANGER}
                        title="Delete login"
                        aria-label="Delete login"
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
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 h-11 px-4 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">Portal Tabs</span>
          </div>
          <div className="p-4">
            {!portal ? (
              <p className="text-[13px] text-[var(--text-muted)]">Generate a portal link first to configure tabs.</p>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between h-8">
                  <span className="text-[13px] text-[var(--text-primary)]">JSR Track</span>
                  <span className="text-[12px] text-[var(--text-muted)]">Always visible</span>
                </div>
                {PORTAL_TAB_OPTIONS.map((tab) => {
                  const hidden = hiddenTabs.includes(tab.key);
                  return (
                    <div key={tab.key} className="flex items-center justify-between h-8">
                      <span className={`text-[13px] ${hidden ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>{tab.label}</span>
                      <button
                        onClick={() => void toggleTab(tab.key)}
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors ${hidden ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"} hover:bg-[var(--bg-hover)]`}
                        title={hidden ? "Show tab" : "Hide tab"}
                        aria-label={hidden ? `Show ${tab.label}` : `Hide ${tab.label}`}
                        aria-pressed={!hidden}
                      >
                        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
                <div className="pt-3 mt-2 border-t border-[var(--border-subtle)]">
                  <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
                    Pin Content Calendar to a month (optional)
                  </label>
                  <input
                    type="month"
                    value={calendarMonth}
                    onChange={(e) => void updatePortalConfig({ brandId, calendarMonth: e.target.value }).catch(() => {})}
                    aria-label="Pin Content Calendar to a month"
                    className={`${FIELD} w-full`}
                  />
                </div>

                {/* Calendar month visibility */}
                <div className="pt-3 mt-3 border-t border-[var(--border-subtle)]">
                  <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
                    Calendar months visible to the client
                  </label>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-[var(--text-primary)]">Show all months</span>
                    <button
                      onClick={() =>
                        void updatePortalConfig({
                          brandId,
                          visibleCalendarMonths:
                            visibleMonths === undefined ? (calendarMonths ?? []) : null,
                        }).catch(() => {})
                      }
                      aria-pressed={visibleMonths === undefined}
                      className="h-8 px-3 rounded-md text-[13px] font-medium border border-[var(--border)] bg-white text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      {visibleMonths === undefined ? "All visible" : "Restricted"}
                    </button>
                  </div>
                  {visibleMonths !== undefined && (
                    <>
                      <p className="text-[12px] text-[var(--text-muted)] mt-1 mb-2">
                        Only ticked months appear on the client&apos;s calendar.
                      </p>
                      {(calendarMonths ?? []).length === 0 ? (
                        <p className="text-[12px] text-[var(--text-muted)]">
                          No calendar months exist for this brand yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(calendarMonths ?? []).map((m) => {
                            const on = visibleMonths.includes(m);
                            const label = new Date(m + "-01T00:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            });
                            return (
                              <button
                                key={m}
                                onClick={() =>
                                  void updatePortalConfig({
                                    brandId,
                                    visibleCalendarMonths: on
                                      ? visibleMonths.filter((x) => x !== m)
                                      : [...visibleMonths, m],
                                  }).catch(() => {})
                                }
                                aria-pressed={on}
                                className={`h-8 px-3 rounded-md text-[13px] font-medium border transition-colors ${
                                  on
                                    ? "border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]"
                                    : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-[var(--border-strong)]"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="space-y-4 min-w-0">
        {/* Client Deck manager */}
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 h-11 px-4 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">
              Client Deck{deckItems && deckItems.length > 0 && <span className={COUNT}> {deckItems.length}</span>}
            </span>
            {canManageLinks && (
              <Button variant="secondary" onClick={() => setShowAddDeck(!showAddDeck)}>
                {showAddDeck ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showAddDeck ? "Cancel" : "Add"}
              </Button>
            )}
          </div>
          <div className="p-4 space-y-3">
            {showAddDeck && (
              <div className="p-3 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] space-y-2">
                <input
                  value={newDeck.title}
                  onChange={(e) => setNewDeck((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Title (e.g. Q3 Strategy Deck)"
                  className={`${FIELD} w-full`}
                />
                <input
                  value={newDeck.url}
                  onChange={(e) => setNewDeck((p) => ({ ...p, url: e.target.value }))}
                  placeholder="Link (Slides, Sheets, Figma, gantt…)"
                  className={`${FIELD} w-full`}
                />
                <input
                  value={newDeck.description}
                  onChange={(e) => setNewDeck((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Description (optional)"
                  className={`${FIELD} w-full`}
                />
                <div className="flex items-center gap-3">
                  <select
                    value={newDeck.category}
                    onChange={(e) => setNewDeck((p) => ({ ...p, category: e.target.value }))}
                    className={`${FIELD} flex-1 min-w-0`}
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
                  {savingDeck ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add to Deck
                </Button>
              </div>
            )}

            {deckItems === undefined ? (
              <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
            ) : deckItems.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                Share decks, gantt charts and documents with the client, optionally requiring their approval.
              </p>
            ) : (
              deckItems.map((item: any) => (
                <div key={item._id} className="p-3 rounded-md border border-[var(--border-subtle)]">
                  {editDeckId === item._id ? (
                    <div className="space-y-2">
                      <input
                        value={editDeck.title}
                        onChange={(e) => setEditDeck((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Title"
                        className={`${FIELD} w-full`}
                      />
                      {!item.fileKey && (
                        <input
                          value={editDeck.url}
                          onChange={(e) => setEditDeck((p) => ({ ...p, url: e.target.value }))}
                          placeholder="Link"
                          className={`${FIELD} w-full`}
                        />
                      )}
                      <input
                        value={editDeck.description}
                        onChange={(e) => setEditDeck((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Description (optional)"
                        className={`${FIELD} w-full`}
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={editDeck.category}
                          onChange={(e) => setEditDeck((p) => ({ ...p, category: e.target.value }))}
                          className={`${FIELD} flex-1 min-w-0`}
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
                        <Button variant="ghost" onClick={() => setEditDeckId(null)}>
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
                          className="flex-1 min-w-0 text-[14px] font-medium text-[var(--text-primary)] truncate hover:underline underline-offset-2"
                        >
                          {item.title}
                        </a>
                        {item.addedByClientName && (
                          <Badge className="shrink-0">From {item.addedByClientName}</Badge>
                        )}
                        {item.category && (
                          <Badge className="capitalize shrink-0">{item.category}</Badge>
                        )}
                        {item.requiresApproval &&
                          (item.approvalStatus === "client_approved" ? (
                            <Badge variant="employee" className="shrink-0">
                              {`Approved${item.reviewedByName ? ` · ${item.reviewedByName}` : ""}`}
                            </Badge>
                          ) : item.approvalStatus === "client_changes_requested" ? (
                            <Badge variant="warning" className="shrink-0">Changes requested</Badge>
                          ) : (
                            <Badge className="shrink-0">Awaiting approval</Badge>
                          ))}
                        {canManageLinks && (
                          <div className="flex items-center shrink-0">
                            <button
                              onClick={() => void updateDeckItem({ deckItemId: item._id, isVisible: !item.isVisible }).catch(() => {})}
                              className={ICON_BTN}
                              title={item.isVisible ? "Hide from client" : "Show to client"}
                              aria-label={item.isVisible ? "Hide from client" : "Show to client"}
                            >
                              {item.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => void updateDeckItem({ deckItemId: item._id, requiresApproval: !item.requiresApproval }).catch(() => {})}
                              className={`inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-[var(--bg-hover)] ${item.requiresApproval ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                              title={item.requiresApproval ? "Remove approval requirement" : "Require client approval"}
                              aria-label={item.requiresApproval ? "Remove approval requirement" : "Require client approval"}
                              aria-pressed={!!item.requiresApproval}
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
                              className={ICON_BTN}
                              title="Edit"
                              aria-label="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteDeckId(item._id)}
                              className={ICON_BTN_DANGER}
                              title="Delete"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {item.approvalNote && (
                        <p className="rounded-md bg-[var(--bg-primary)] px-3 py-2 text-[12px] text-[var(--text-secondary)] mt-2">
                          Client note: {item.approvalNote}
                        </p>
                      )}
                      {/* Comment thread */}
                      {(item.remarks ?? []).length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-[var(--border-subtle)] pt-2">
                          {item.remarks.map((r: any) => (
                            <p key={r._id} className="text-[12px] text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-primary)]">
                                {r.senderName ?? (r.senderType === "client" ? "Client" : "Team")}:
                              </span>{" "}
                              {r.content}
                              <span className="text-[var(--text-muted)]"> · {timeAgo(r.createdAt)}</span>
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
                            aria-label="Reply to the client"
                            className={`${FIELD} flex-1 min-w-0`}
                            autoFocus
                          />
                          <button
                            onClick={() => { setDeckReplyFor(null); setDeckReply(""); }}
                            className={ICON_BTN}
                            aria-label="Cancel reply"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button variant="secondary" className="mt-2" onClick={() => setDeckReplyFor(item._id)}>
                          Comment
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Client Activity */}
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 h-11 px-4 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">Client Activity</span>
          </div>
          <div className="p-4">
            {activity === undefined ? (
              <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                No portal activity yet. Logins, approvals and comments will show up here.
              </p>
            ) : (
              <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
                {activity.map((a: any) => (
                  <div key={a._id} className="flex items-start gap-2.5 py-2 border-b border-[var(--border-subtle)] last:border-0">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: brand?.color ?? "#171717" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[var(--text-primary)]">
                        <span className="font-medium">{a.clientName}</span> {activityLine(a)}
                      </p>
                    </div>
                    <span className="text-[12px] tabular-nums text-[var(--text-muted)] shrink-0">{timeAgo(a.createdAt)}</span>
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
          aria-expanded={showLegacy}
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
