"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Loader2,
  Copy,
  Check,
  UserPlus,
  Trash2,
  UserMinus,
  Users,
  X,
  ChevronDown,
} from "lucide-react";

const SITE_URL = "https://tasktracker-gilt-tau.vercel.app";

// ─── Copyable Link ──────────────────────────
export function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-0 mt-2 rounded-lg border border-blue-200 bg-blue-50 overflow-hidden">
      <input
        readOnly
        value={url}
        className="flex-1 px-3 py-2 text-[12px] font-mono text-blue-800 bg-transparent border-none outline-none select-all min-w-0"
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <button
        onClick={handleCopy}
        className="shrink-0 px-3 py-2 border-l border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1.5 text-[11px] font-medium"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

// ─── Create User Form ───────────────────────
export function CreateUserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "employee">("employee");
  const [designation, setDesignation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ signupUrl: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createInvite = useMutation(api.users.createInvite);

  function handleClear() {
    setName("");
    setEmail("");
    setRole("employee");
    setDesignation("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await createInvite({
        name: name.trim(),
        email: email.trim(),
        role,
        ...(designation.trim() ? { designation: designation.trim() } : {}),
      });
      const signupUrl = `${SITE_URL}/sign-up?invite=${res.token}`;
      setResult({ signupUrl, name: name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 my-1.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Check className="h-4 w-4 text-emerald-600" />
          <span className="text-[12px] font-semibold text-emerald-800">
            Invite Created for {result.name}
          </span>
        </div>
        <p className="text-[11px] text-emerald-700 mb-1">
          Share this signup link with the user:
        </p>
        <CopyableLink url={result.signupUrl} />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border)] bg-white p-3 my-1.5 space-y-2.5"
    >
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="h-4 w-4 text-[var(--accent-admin)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Create New User
        </span>
      </div>

      {/* Name */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Email *
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@company.com"
          required
          className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
        />
      </div>

      {/* Role */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Role *
        </label>
        <div className="relative">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "manager" | "employee")}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
      </div>

      {/* Designation */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Designation
        </label>
        <input
          type="text"
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="e.g. Senior Designer (optional)"
          className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
        />
      </div>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !name.trim() || !email.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          {isSubmitting ? "Creating..." : "Create & Get Link"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ─── Delete Brief Form ──────────────────────
export function DeleteBriefForm() {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [selectedBriefId, setSelectedBriefId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ briefTitle: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const brands = useQuery(api.brands.listBrands) ?? [];
  const brandDetail = useQuery(
    api.brands.getBrand,
    selectedBrandId ? { brandId: selectedBrandId as Id<"brands"> } : "skip"
  );
  const deleteBrief = useMutation(api.briefs.deleteBrief);

  const brandBriefs = brandDetail?.briefs ?? [];

  function handleClear() {
    setSelectedBrandId("");
    setSelectedBriefId("");
    setError(null);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBriefId) return;

    const briefToDelete = brandBriefs.find((b) => b._id === selectedBriefId);
    if (!briefToDelete) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await deleteBrief({ briefId: selectedBriefId as Id<"briefs"> });
      setResult({ briefTitle: briefToDelete.title });
      setSelectedBriefId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete brief");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 my-1.5">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <span className="text-[12px] font-semibold text-emerald-800">
            Brief &quot;{result.briefTitle}&quot; deleted successfully
          </span>
        </div>
        <button
          onClick={handleClear}
          className="mt-2 text-[11px] text-emerald-700 underline hover:text-emerald-900"
        >
          Delete another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border)] bg-white p-3 my-1.5 space-y-2.5"
    >
      <div className="flex items-center gap-2 mb-1">
        <Trash2 className="h-4 w-4 text-red-500" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Delete Brief
        </span>
      </div>

      {/* Brand selector */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Select Brand *
        </label>
        <div className="relative">
          <select
            value={selectedBrandId}
            onChange={(e) => {
              setSelectedBrandId(e.target.value);
              setSelectedBriefId("");
              setError(null);
            }}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
          >
            <option value="">Choose a brand...</option>
            {brands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
      </div>

      {/* Brief selector */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Select Brief *
        </label>
        <div className="relative">
          <select
            value={selectedBriefId}
            onChange={(e) => {
              setSelectedBriefId(e.target.value);
              setError(null);
            }}
            disabled={!selectedBrandId || brandBriefs.length === 0}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">
              {!selectedBrandId
                ? "Select a brand first..."
                : brandBriefs.length === 0
                  ? "No briefs for this brand"
                  : "Choose a brief..."}
            </option>
            {brandBriefs.map((b) => (
              <option key={b._id} value={b._id}>
                {b.title} ({b.status})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
        {selectedBriefId && (() => {
          const brief = brandBriefs.find((b) => b._id === selectedBriefId);
          if (!brief) return null;
          return (
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {brief.taskCount} task{brief.taskCount !== 1 ? "s" : ""} will also be deleted
            </p>
          );
        })()}
      </div>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !selectedBriefId}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-[12px] font-medium hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {isSubmitting ? "Deleting..." : "Delete Brief"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ─── Delete User Form ───────────────────────
export function DeleteUserForm() {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ userName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allUsers = useQuery(api.users.listAllUsers) ?? [];
  const deleteUser = useMutation(api.users.deleteUser);

  function handleClear() {
    setSelectedUserId("");
    setError(null);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;

    const userToDelete = allUsers.find((u) => u._id === selectedUserId);
    if (!userToDelete) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await deleteUser({ userId: selectedUserId as Id<"users"> });
      setResult({ userName: userToDelete.name ?? userToDelete.email ?? "User" });
      setSelectedUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 my-1.5">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <span className="text-[12px] font-semibold text-emerald-800">
            User &quot;{result.userName}&quot; has been deleted
          </span>
        </div>
        <button
          onClick={handleClear}
          className="mt-2 text-[11px] text-emerald-700 underline hover:text-emerald-900"
        >
          Delete another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border)] bg-white p-3 my-1.5 space-y-2.5"
    >
      <div className="flex items-center gap-2 mb-1">
        <UserMinus className="h-4 w-4 text-red-500" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Delete User
        </span>
      </div>

      {/* User selector */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Select User *
        </label>
        <div className="relative">
          <select
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              setError(null);
            }}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
          >
            <option value="">Choose a user...</option>
            {allUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name ?? u.email} ({u.role})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
        {selectedUserId && (() => {
          const user = allUsers.find((u) => u._id === selectedUserId);
          if (!user) return null;
          return (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <span>{user.email}</span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] capitalize font-medium">
                {user.role}
              </span>
            </div>
          );
        })()}
      </div>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !selectedUserId}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-[12px] font-medium hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserMinus className="h-3.5 w-3.5" />
          )}
          {isSubmitting ? "Deleting..." : "Delete User"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ─── Delete Team Form ───────────────────────
export function DeleteTeamForm() {
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ teamName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teams = useQuery(api.teams.listTeams) ?? [];
  const deleteTeam = useMutation(api.teams.deleteTeam);

  function handleClear() {
    setSelectedTeamId("");
    setError(null);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeamId) return;

    const team = teams.find((t) => t._id === selectedTeamId);
    if (!team) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await deleteTeam({ teamId: selectedTeamId as Id<"teams"> });
      setResult({ teamName: team.name });
      setSelectedTeamId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 my-1.5">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <span className="text-[12px] font-semibold text-emerald-800">
            Team &quot;{result.teamName}&quot; has been deleted
          </span>
        </div>
        <button
          onClick={handleClear}
          className="mt-2 text-[11px] text-emerald-700 underline hover:text-emerald-900"
        >
          Delete another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border)] bg-white p-3 my-1.5 space-y-2.5"
    >
      <div className="flex items-center gap-2 mb-1">
        <Trash2 className="h-4 w-4 text-red-500" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Delete Team
        </span>
      </div>

      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Select Team *
        </label>
        <div className="relative">
          <select
            value={selectedTeamId}
            onChange={(e) => {
              setSelectedTeamId(e.target.value);
              setError(null);
            }}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
          >
            <option value="">Choose a team...</option>
            {teams.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.memberCount} member{t.memberCount !== 1 ? "s" : ""})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
        {selectedTeamId && (() => {
          const team = teams.find((t) => t._id === selectedTeamId);
          if (!team) return null;
          return (
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Lead: {team.leadName} &middot; {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
            </p>
          );
        })()}
      </div>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !selectedTeamId}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-[12px] font-medium hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {isSubmitting ? "Deleting..." : "Delete Team"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ─── Assign User to Team Form ───────────────
export function AssignTeamForm() {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ userName: string; teamName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allUsers = useQuery(api.users.listAllUsers) ?? [];
  const teams = useQuery(api.teams.listTeams) ?? [];
  const addUserToTeam = useMutation(api.teams.addUserToTeam);

  function handleClear() {
    setSelectedUserId("");
    setSelectedTeamId("");
    setError(null);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId || !selectedTeamId) return;

    const user = allUsers.find((u) => u._id === selectedUserId);
    const team = teams.find((t) => t._id === selectedTeamId);
    if (!user || !team) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await addUserToTeam({
        userId: selectedUserId as Id<"users">,
        teamId: selectedTeamId as Id<"teams">,
      });
      setResult({ userName: user.name ?? user.email ?? "User", teamName: team.name });
      setSelectedUserId("");
      setSelectedTeamId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign user");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 my-1.5">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <span className="text-[12px] font-semibold text-emerald-800">
            {result.userName} assigned to team &quot;{result.teamName}&quot;
          </span>
        </div>
        <button
          onClick={handleClear}
          className="mt-2 text-[11px] text-emerald-700 underline hover:text-emerald-900"
        >
          Assign another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border)] bg-white p-3 my-1.5 space-y-2.5"
    >
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-[var(--accent-admin)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Assign User to Team
        </span>
      </div>

      {/* User selector */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Select User *
        </label>
        <div className="relative">
          <select
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              setError(null);
            }}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
          >
            <option value="">Choose a user...</option>
            {allUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name ?? u.email} ({u.role})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
      </div>

      {/* Team selector */}
      <div>
        <label className="block text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">
          Select Team *
        </label>
        <div className="relative">
          <select
            value={selectedTeamId}
            onChange={(e) => {
              setSelectedTeamId(e.target.value);
              setError(null);
            }}
            className="w-full appearance-none px-2.5 py-1.5 pr-8 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] bg-white"
          >
            <option value="">Choose a team...</option>
            {teams.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !selectedUserId || !selectedTeamId}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Users className="h-3.5 w-3.5" />
          )}
          {isSubmitting ? "Assigning..." : "Assign to Team"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}
