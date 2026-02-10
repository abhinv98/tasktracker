"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { Trash2, UserPlus, Copy, X, Check, Link2 } from "lucide-react";

/* ─── Create-User Modal ─── */
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const teams = useQuery(api.teams.listTeams);
  const createInvite = useMutation(api.users.createInvite);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "employee">("employee");
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
        role,
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
                  setRole(e.target.value as "admin" | "manager" | "employee")
                }
                options={[
                  { value: "admin", label: "Admin" },
                  { value: "manager", label: "Manager" },
                  { value: "employee", label: "Employee" },
                ]}
              />
              {teams && teams.length > 0 && (
                <Select
                  label="Team (optional)"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  placeholder="No team"
                  options={teamOptions}
                />
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

/* ─── Main Page ─── */
export default function UsersPage() {
  const users = useQuery(api.users.listAllUsers);
  const updateRole = useMutation(api.users.updateUserRole);
  const deleteUser = useMutation(api.users.deleteUser);

  const [showCreateModal, setShowCreateModal] = useState(false);

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
    newRole: "admin" | "manager" | "employee"
  ) {
    try {
      await updateRole({ userId, newRole });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleDelete(userId: Id<"users">, userName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${userName}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteUser({ userId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <div className="p-8">
      {/* Header row */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight mb-1">
            Users &amp; Roles
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Manage user roles and permissions
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <UserPlus size={15} />
          Create User
        </Button>
      </div>

      {/* Table */}
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
                  <select
                    value={user.role ?? "employee"}
                    onChange={(e) =>
                      handleRoleChange(
                        user._id,
                        e.target.value as "admin" | "manager" | "employee"
                      )
                    }
                    className="bg-[var(--bg-input)] rounded-lg border border-[var(--border)] text-[var(--text-primary)] px-3 py-1.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="employee">Employee</option>
                  </select>
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
                <TableCell className="w-[48px]">
                  <button
                    onClick={() =>
                      handleDelete(user._id, user.name ?? user.email ?? "User")
                    }
                    className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-disabled)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all duration-150"
                    title="Delete user"
                  >
                    <Trash2 size={15} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
