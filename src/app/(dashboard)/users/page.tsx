"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import TeamsPanel from "@/components/teams/TeamsPanel";
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@/components/ui";
import { Trash2, UserPlus, Copy, X, Check, Link2, KeyRound, Eye, EyeOff } from "lucide-react";
import { getDisplayRole } from "@/lib/roles";

/* ─── Create-User Modal ─── */
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const teams = useQuery(api.teams.listTeams);
  const createInvite = useMutation(api.users.createInvite);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [role, setRole] = useState<"admin" | "employee" | "freelancer">("employee");
  const [teamId, setTeamId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* invite-created state */
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createInvite({
        name: name.trim(),
        email: email.trim(),
        designation: designation.trim() || undefined,
        role: role === "freelancer" ? "employee" : role,
        isFreelancer: role === "freelancer" ? true : undefined,
        teamId: teamId ? (teamId as Id<"teams">) : undefined,
      });
      const link = `${window.location.origin}/sign-up?invite=${result.token}`;
      setInviteLink(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const teamOptions = (teams ?? []).map((t: { _id: string; name: string }) => ({
    value: t._id,
    label: t.name,
  }));

  return (
    /* overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* modal card */}
      <div
        className="relative w-full max-w-[480px] mx-4 bg-white border border-[var(--border)] rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-200"
      >
        {/* header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-admin-dim)]">
              <UserPlus size={16} className="text-[var(--accent-admin)]" />
            </div>
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)] tracking-tight">
              Create User Invite
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-hover)] transition-colors duration-150"
          >
            <X size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* body */}
        <div className="px-6 py-5">
          {inviteLink ? (
            /* ─── Success state ─── */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[14px] font-medium text-[var(--accent-employee)]">
                <Check size={16} />
                Invite created successfully
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] p-3.5">
                <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Invite Link
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border border-[var(--border)] rounded-lg px-3 py-2">
                    <Link2 size={14} className="shrink-0 text-[var(--text-disabled)]" />
                    <span className="text-[13px] text-[var(--text-primary)] font-mono truncate">
                      {inviteLink}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleCopy}
                    className="shrink-0 !px-3"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="secondary" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            /* ─── Form state ─── */
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Name"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Email"
                type="email"
                placeholder="jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Designation (optional)"
                placeholder="e.g. Senior Engineer"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
              <Select
                label="Role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "admin" | "employee" | "freelancer")
                }
                options={[
                  { value: "admin", label: "Brand Manager" },
                  { value: "employee", label: "Employee" },
                  { value: "freelancer", label: "Freelancer" },
                ]}
              />
              {teams && teams.length > 0 && (
                <div>
                  <Select
                    label="Assign Team"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    placeholder="No team"
                    options={teamOptions}
                  />
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    They'll be added to this team automatically when they sign
                    up. You can change it later in the Teams tab.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-[13px] font-medium text-[var(--danger)]">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" type="button" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Invite"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Reset-Password Modal (super admin only) ─── */
function ResetPasswordModal({
  user,
  onClose,
}: {
  user: { id: Id<"users">; name: string };
  onClose: () => void;
}) {
  const resetPassword = useAction(api.passwordChange.adminResetPassword);
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  function generate() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$";
    const next = Array.from(
      { length: 12 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
    setPassword(next);
    setShow(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({ userId: user.id, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[480px] mx-4 bg-white border border-[var(--border)] rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-200">
        {/* header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-admin-dim)]">
              <KeyRound size={16} className="text-[var(--accent-admin)]" />
            </div>
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)] tracking-tight">
              Reset Password
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-hover)] transition-colors duration-150"
          >
            <X size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* body */}
        <div className="px-6 py-5">
          {done ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[14px] font-medium text-[var(--accent-employee)]">
                <Check size={16} />
                Password updated for {user.name}
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] p-3.5">
                <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  New Password — share it securely
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center flex-1 min-w-0 bg-white border border-[var(--border)] rounded-lg px-3 py-2">
                    <span className="text-[13px] text-[var(--text-primary)] font-mono truncate">
                      {password}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleCopy}
                    className="shrink-0 !px-3"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="secondary" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-[13px] text-[var(--text-secondary)]">
                Set a new password for{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {user.name}
                </span>
                . They can sign in with it immediately and change it later from
                their profile.
              </p>
              <div>
                <div className="relative">
                  <Input
                    label="New Password"
                    type={show ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2.5 top-[30px] flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                    title={show ? "Hide" : "Show"}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={generate}
                  className="mt-1.5 text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
                >
                  Generate a strong password
                </button>
              </div>

              {error && (
                <p className="text-[13px] font-medium text-[var(--danger)]">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" type="button" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Resetting…" : "Reset Password"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Create Client Login Modal ─── */
function CreateClientModal({ onClose }: { onClose: () => void }) {
  const brands = useQuery(api.brands.listBrands);
  const createClient = useAction(api.clientUsers.adminCreateClientUser);
  const { toast } = useToast();

  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function generate() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setPassword(out);
    setShow(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!brandId) {
      setError("Pick the brand this client belongs to.");
      return;
    }
    if (!email.trim() || password.length < 8) {
      setError("Email and a password of at least 8 characters are required.");
      return;
    }
    setSubmitting(true);
    try {
      await createClient({
        brandId: brandId as Id<"brands">,
        name: name.trim(),
        email: email.trim(),
        password,
      });
      toast("success", `Client login created for ${email.trim()}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client login");
    } finally {
      setSubmitting(false);
    }
  }

  const brandOptions = (brands ?? []).map((b: { _id: string; name: string }) => ({
    value: b._id,
    label: b.name,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[480px] mx-4 bg-white border border-[var(--border)] rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-admin-dim)]">
              <UserPlus size={16} className="text-[var(--accent-admin)]" />
            </div>
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)] tracking-tight">
              Create Client Login
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-hover)] transition-colors duration-150"
          >
            <X size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>
        <div className="px-6 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-[13px] text-[var(--text-secondary)]">
              Client logins are tied to one brand and only open that brand's portal. Share the
              email and password with the client along with the portal link from the brand page.
            </p>
            <Select
              label="Brand"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              options={brandOptions}
              placeholder="Select a brand"
              required
            />
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client's name"
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@company.com"
              required
            />
            <div>
              <div className="relative">
                <Input
                  label="Password"
                  type={show ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-[30px] flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  title={show ? "Hide" : "Show"}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={generate}
                className="mt-1.5 text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
              >
                Generate a strong password
              </button>
            </div>
            {error && <p className="text-[13px] font-medium text-[var(--danger)]">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create Login"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── Clients Panel ─── */
function ClientsPanel() {
  const clients = useQuery(api.clientUsers.listAllClientUsers);
  const deleteClient = useMutation(api.clientUsers.deleteClientUser);
  const resetPassword = useAction(api.clientUsers.adminResetClientPassword);
  const { toast } = useToast();

  const [deleting, setDeleting] = useState<{ id: Id<"users">; name: string } | null>(null);
  const [resetId, setResetId] = useState<Id<"users"> | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  if (clients === undefined) {
    return <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>;
  }

  async function handleReset() {
    if (!resetId || newPassword.length < 8 || resetting) return;
    setResetting(true);
    try {
      await resetPassword({ userId: resetId, newPassword });
      toast("success", "Password updated");
      setResetId(null);
      setNewPassword("");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to reset password");
    }
    setResetting(false);
  }

  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
        {clients.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">
              No client logins yet. Create one to give a client access to their brand portal.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c._id}>
                  <TableCell>{c.name ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ color: c.brandColor, backgroundColor: c.brandColor + "12" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.brandColor }} />
                      {c.brandName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[12px] text-[var(--text-secondary)]">
                      {new Date(c._creationTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </TableCell>
                  <TableCell className="w-[220px]">
                    {resetId === c._id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="w-36 px-2 py-1.5 rounded-lg border border-[var(--border)] text-[12px] bg-white focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => void handleReset()}
                          disabled={newPassword.length < 8 || resetting}
                          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--accent-employee)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                          title="Save new password"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => { setResetId(null); setNewPassword(""); }}
                          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-disabled)] hover:bg-[var(--bg-hover)]"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => { setResetId(c._id); setNewPassword(""); }}
                          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-disabled)] hover:text-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-all duration-150"
                          title="Reset password"
                        >
                          <KeyRound size={15} />
                        </button>
                        <button
                          onClick={() => setDeleting({ id: c._id, name: c.name ?? c.email ?? "Client" })}
                          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-disabled)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all duration-150"
                          title="Delete client login"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <ConfirmModal
        open={!!deleting}
        title="Delete Client Login"
        message={`"${deleting?.name}" will be signed out immediately and lose portal access. Their past requests and comments are kept.`}
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deleting) {
            try {
              await deleteClient({ userId: deleting.id });
              toast("success", "Client login deleted");
            } catch (err) {
              toast("error", err instanceof Error ? err.message : "Failed to delete");
            }
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/* ─── Main Page ─── */
export default function UsersPage() {
  const users = useQuery(api.users.listAllUsers);
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateRole = useMutation(api.users.updateUserRole);
  const deleteUser = useMutation(api.users.deleteUser);

  const isSuperAdmin = currentUser?.isSuperAdmin === true;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<{ id: Id<"users">; name: string } | null>(null);
  const [resettingUser, setResettingUser] = useState<{ id: Id<"users">; name: string } | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: "users" | "teams" | "clients" =
    tabParam === "teams" ? "teams" : tabParam === "clients" ? "clients" : "users";

  if (users === null) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Access denied. Admin only.
        </p>
      </div>
    );
  }

  if (users === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Loading...
        </p>
      </div>
    );
  }

  async function handleRoleChange(
    userId: Id<"users">,
    newRole: "admin" | "employee" | "freelancer"
  ) {
    try {
      await updateRole({
        userId,
        newRole: newRole === "freelancer" ? "employee" : newRole,
        isFreelancer: newRole === "freelancer",
      });
      toast("success", "Role updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleDelete() {
    if (!deletingUser) return;
    try {
      await deleteUser({ userId: deletingUser.id });
      toast("success", "User deleted");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete user");
    }
    setDeletingUser(null);
  }

  return (
    <div className="p-8">
      {/* Header row */}
      <PageHeader
        title="Users & Teams"
        subtitle="Manage users, roles and team membership"
        actions={
          tab === "users" ? (
            <Button onClick={() => setShowCreateModal(true)}>
              <UserPlus size={15} />
              Create User
            </Button>
          ) : tab === "clients" ? (
            <Button onClick={() => setShowCreateClientModal(true)}>
              <UserPlus size={15} />
              Create Client Login
            </Button>
          ) : undefined
        }
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] w-fit mb-6">
        {([
          { key: "users", label: "Users" },
          { key: "teams", label: "Teams" },
          { key: "clients", label: "Clients" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => router.replace(key === "users" ? "/users" : `/users?tab=${key}`)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              tab === key
                ? "bg-white shadow-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "teams" && <TeamsPanel />}
      {tab === "clients" && <ClientsPanel />}

      {/* Table */}
      {tab === "users" && (
      <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Teams</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>{user.name ?? user.email ?? "—"}</TableCell>
                <TableCell>{user.email ?? "—"}</TableCell>
                <TableCell>
                  <span className={
                    (user as { designation?: string }).designation
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-disabled)]"
                  }>
                    {(user as { designation?: string }).designation ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {(user as any).isSuperAdmin ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                      Super Admin
                    </span>
                  ) : (
                    <select
                      value={
                        (user as any).isFreelancer
                          ? "freelancer"
                          : user.role ?? "employee"
                      }
                      onChange={(e) =>
                        handleRoleChange(
                          user._id,
                          e.target.value as "admin" | "employee" | "freelancer"
                        )
                      }
                      className="bg-transparent rounded-md border border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-input)] text-[var(--text-primary)] px-2 py-1 text-[12px] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] transition-colors duration-150"
                    >
                      <option value="admin">Brand Manager</option>
                      <option value="employee">Employee</option>
                      <option value="freelancer">Freelancer</option>
                    </select>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {(user as { teams?: { name: string }[] }).teams?.map(
                      (t) => (
                        <Badge key={t.name} variant="neutral">
                          {t.name}
                        </Badge>
                      )
                    ) ?? "—"}
                  </div>
                </TableCell>
                <TableCell className="w-[88px]">
                  <div className="flex items-center justify-end gap-0.5">
                    {isSuperAdmin && user.email && (
                      <button
                        onClick={() =>
                          setResettingUser({
                            id: user._id,
                            name: user.name ?? user.email ?? "User",
                          })
                        }
                        className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-disabled)] hover:text-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-all duration-150"
                        title="Reset password"
                      >
                        <KeyRound size={15} />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setDeletingUser({ id: user._id, name: user.name ?? user.email ?? "User" })
                      }
                      className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-disabled)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all duration-150"
                      title="Delete user"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* Create Client Login Modal */}
      {showCreateClientModal && (
        <CreateClientModal onClose={() => setShowCreateClientModal(false)} />
      )}

      {/* Reset Password Modal (super admin only) */}
      {resettingUser && (
        <ResetPasswordModal
          user={resettingUser}
          onClose={() => setResettingUser(null)}
        />
      )}

      <ConfirmModal
        open={!!deletingUser}
        title="Delete User"
        message={`Are you sure you want to delete "${deletingUser?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
}
