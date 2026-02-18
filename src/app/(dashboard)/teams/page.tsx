"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, Input, Select, Textarea, useToast } from "@/components/ui";
import { X, UserPlus, Trash2 } from "lucide-react";

const TEAM_COLORS = ["#d97757", "#6a9bcc", "#788c5d", "#b0aea5", "#c0392b"];

export default function TeamsPage() {
  const user = useQuery(api.users.getCurrentUser);
  const teams = useQuery(api.teams.listTeams, {});
  const managers = useQuery(api.users.listManagers, {});
  const allUsers = useQuery(api.users.listAllUsers, {});
  
  const leadOptions = (allUsers ?? [])
    .filter((u) => u.role === "admin" || u.role === "manager")
    .map((u) => ({ value: u._id, label: (u.name ?? u.email ?? "Unknown") as string }));
  const createTeam = useMutation(api.teams.createTeam);
  const addUserToTeam = useMutation(api.teams.addUserToTeam);
  const removeUserFromTeam = useMutation(api.teams.removeUserFromTeam);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState<Id<"users"> | "">("");
  const [color, setColor] = useState(TEAM_COLORS[0]);

  // --- Phase 2: slide-in panel state ---
  const [selectedTeamId, setSelectedTeamId] = useState<Id<"teams"> | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState<Id<"users"> | "">("");
  const [removingMemberId, setRemovingMemberId] = useState<Id<"users"> | null>(null);
  const { toast } = useToast();

  const selectedTeam = teams?.find((t) => t._id === selectedTeamId) ?? null;
  const teamMembers = useQuery(
    api.teams.getTeamMembers,
    selectedTeamId ? { teamId: selectedTeamId } : "skip"
  );

  // Derive users NOT in the current team for the "Add member" dropdown
  const memberIds = new Set((teamMembers ?? []).filter((m): m is NonNullable<typeof m> => !!m).map((m) => m._id));
  const nonMembers = (allUsers ?? []).filter((u) => !memberIds.has(u._id));
  const addMemberOptions = nonMembers.map((u) => ({
    value: u._id,
    label: (u.name ?? u.email ?? "Unknown") as string,
  }));

  // When selectedTeamId changes, animate the panel open
  useEffect(() => {
    if (selectedTeamId) {
      // Small delay to allow the DOM to paint at translate-x-full first
      requestAnimationFrame(() => setPanelOpen(true));
    }
  }, [selectedTeamId]);

  function openPanel(teamId: Id<"teams">) {
    if (selectedTeamId === teamId) {
      // clicking the same card again closes
      closePanel();
      return;
    }
    setPanelOpen(false);
    setAddMemberUserId("");
    // If already open for a different team, swap immediately
    setTimeout(() => setSelectedTeamId(teamId), selectedTeamId ? 150 : 0);
  }

  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => {
      setSelectedTeamId(null);
      setAddMemberUserId("");
    }, 300); // wait for slide-out animation
  }

  async function handleAddMember() {
    if (!addMemberUserId || !selectedTeamId) return;
    try {
      await addUserToTeam({ userId: addMemberUserId as Id<"users">, teamId: selectedTeamId });
      setAddMemberUserId("");
      toast("success", "Member added");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to add member");
    }
  }

  async function handleRemoveMember(userId: Id<"users">) {
    if (!selectedTeamId) return;
    try {
      await removeUserFromTeam({ userId, teamId: selectedTeamId });
      toast("success", "Member removed");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to remove member");
    }
    setRemovingMemberId(null);
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) return;
    try {
      await createTeam({ name, description: description || undefined, leadId: leadId as Id<"users">, color });
      setShowModal(false);
      setName("");
      setDescription("");
      setLeadId("");
      setColor(TEAM_COLORS[0]);
      toast("success", "Team created");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create team");
    }
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight">
            Teams
          </h1>
          <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
            Manage your teams and members
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="primary" onClick={() => setShowModal(true)}>
            Create Team
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams?.map((team) => (
          <Card
            key={team._id}
            hover
            onClick={() => openPanel(team._id)}
            className={`border-l-4 transition-all duration-150 ${
              selectedTeamId === team._id
                ? "ring-2 ring-[var(--accent-admin)] ring-offset-1"
                : ""
            }`}
            style={{ borderLeftColor: team.color }}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {team.name}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Lead: {team.leadName}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {team.memberCount} members
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ─── Create Team Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <h2 className="font-semibold text-[18px] text-[var(--text-primary)] mb-4">
              Create Team
            </h2>
            <form onSubmit={handleCreateTeam} className="flex flex-col gap-4">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Select
                label="Lead"
                options={leadOptions}
                value={leadId}
                onChange={(e) => setLeadId(e.target.value as Id<"users">)}
                placeholder="Select manager"
              />
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Color
                </label>
                <div className="flex gap-2">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-colors ${
                        color === c ? "border-[var(--text-primary)]" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary">
                  Create
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ─── Slide-in Panel Backdrop ─── */}
      {selectedTeamId && (
        <div
          className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closePanel}
        />
      )}

      {/* ─── Slide-in Panel ─── */}
      {selectedTeamId && (
        <div
          className={`
            fixed right-0 top-0 h-full w-96 z-50
            bg-white border-l border-[var(--border)]
            shadow-[-8px_0_30px_rgba(0,0,0,0.08)]
            transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
            flex flex-col
            ${panelOpen ? "translate-x-0" : "translate-x-full"}
          `}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
            <div className="flex items-center gap-3 min-w-0">
              {selectedTeam && (
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedTeam.color }}
                />
              )}
              <h2 className="font-semibold text-[18px] text-[var(--text-primary)] truncate">
                {selectedTeam?.name ?? "Loading..."}
              </h2>
            </div>
            <button
              onClick={closePanel}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X size={18} />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {selectedTeam && (
              <div className="flex flex-col gap-6">
                {/* Description */}
                {selectedTeam.description && (
                  <div>
                    <p className="text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Description
                    </p>
                    <p className="text-[14px] text-[var(--text-primary)] leading-relaxed">
                      {selectedTeam.description}
                    </p>
                  </div>
                )}

                {/* Meta row */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Lead
                    </p>
                    <p className="text-[14px] text-[var(--text-primary)] font-medium">
                      {selectedTeam.leadName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Color
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-5 h-5 rounded-full border border-[var(--border)]"
                        style={{ backgroundColor: selectedTeam.color }}
                      />
                      <span className="text-[13px] text-[var(--text-secondary)] font-mono">
                        {selectedTeam.color}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <hr className="border-[var(--border)]" />

                {/* Members section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                      Members
                    </p>
                    <Badge variant="neutral">
                      {teamMembers?.length ?? 0}
                    </Badge>
                  </div>

                  {!teamMembers ? (
                    <div className="py-4 text-center text-[13px] text-[var(--text-secondary)]">
                      Loading members...
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-[13px] text-[var(--text-secondary)]">
                        No members yet
                      </p>
                      {isAdmin && (
                        <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                          Use the form below to add members
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {teamMembers.filter((m): m is NonNullable<typeof m> => !!m).map((member) => (
                        <div
                          key={member._id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                              {member.name ?? "Unnamed"}
                            </p>
                            <p className="text-[12px] text-[var(--text-secondary)] truncate">
                              {member.email ?? "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge
                              variant={
                                member.role === "admin"
                                  ? "admin"
                                  : member.role === "manager"
                                    ? "manager"
                                    : "employee"
                              }
                            >
                              {member.role}
                            </Badge>
                            {isAdmin && (
                              <button
                                onClick={() => setRemovingMemberId(member._id)}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-[var(--text-secondary)] hover:text-[var(--danger)] transition-all"
                                title="Remove from team"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Member (admin only) */}
                {isAdmin && (
                  <>
                    <hr className="border-[var(--border)]" />
                    <div>
                      <p className="text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                        Add Member
                      </p>
                      {addMemberOptions.length === 0 ? (
                        <p className="text-[13px] text-[var(--text-secondary)]">
                          All users are already in this team
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Select
                              options={addMemberOptions}
                              value={addMemberUserId}
                              onChange={(e) =>
                                setAddMemberUserId(e.target.value as Id<"users">)
                              }
                              placeholder="Select a user..."
                            />
                          </div>
                          <Button
                            variant="primary"
                            onClick={handleAddMember}
                            disabled={!addMemberUserId}
                            className="self-end"
                          >
                            <UserPlus size={14} />
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!removingMemberId}
        title="Remove Member"
        message="Remove this member from the team?"
        confirmLabel="Remove"
        confirmingLabel="Removing..."
        variant="danger"
        onConfirm={async () => {
          if (removingMemberId) await handleRemoveMember(removingMemberId);
        }}
        onCancel={() => setRemovingMemberId(null)}
      />
    </div>
  );
}
