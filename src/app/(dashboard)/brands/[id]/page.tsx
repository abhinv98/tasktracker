"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, Input, useToast } from "@/components/ui";
import { ArrowLeft, Tag, UserPlus, Trash2, Briefcase, Upload, FileText, Eye, EyeOff, Plus, ChevronDown, ChevronRight, KeyRound, Link2, Copy, ExternalLink } from "lucide-react";

export default function BrandDetailPage() {
  const params = useParams();
  const router = useRouter();
  const brandId = params.id as Id<"brands">;

  const brand = useQuery(api.brands.getBrand, { brandId });
  const user = useQuery(api.users.getCurrentUser);
  const managers = useQuery(api.users.listManagers);
  const assignManager = useMutation(api.brands.assignManagerToBrand);
  const removeManager = useMutation(api.brands.removeManagerFromBrand);
  const deleteBrand = useMutation(api.brands.deleteBrand);

  const [addManagerId, setAddManagerId] = useState<string>("");
  const [showDeleteBrand, setShowDeleteBrand] = useState(false);
  const [removingManagerId, setRemovingManagerId] = useState<Id<"users"> | null>(null);
  const { toast } = useToast();

  const isAdmin = user?.role === "admin";

  // Documents
  const brandDocs = useQuery(api.brandDocuments.listDocuments, { brandId });
  const uploadDoc = useMutation(api.brandDocuments.uploadDocument);
  const deleteDoc = useMutation(api.brandDocuments.deleteDocument);
  const generateDocUploadUrl = useMutation(api.brandDocuments.generateUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(true);
  const [deletingDocId, setDeletingDocId] = useState<Id<"brandDocuments"> | null>(null);

  // Credentials
  const credentials = useQuery(api.brandCredentials.listCredentials, { brandId });
  const addCredential = useMutation(api.brandCredentials.addCredential);
  const deleteCredential = useMutation(api.brandCredentials.deleteCredential);
  const [credsExpanded, setCredsExpanded] = useState(true);
  const [showAddCred, setShowAddCred] = useState(false);
  const [credPlatform, setCredPlatform] = useState("");
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credUrl, setCredUrl] = useState("");
  const [credNotes, setCredNotes] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [deletingCredId, setDeletingCredId] = useState<Id<"brandCredentials"> | null>(null);

  // JSR Links
  const jsrLinks = useQuery(api.jsr.listJsrLinks, { brandId });
  const jsrClientTasks = useQuery(api.jsr.listClientTasks, { brandId });
  const generateJsrLink = useMutation(api.jsr.generateJsrLink);
  const deactivateJsrLink = useMutation(api.jsr.deactivateJsrLink);
  const updateClientTaskDeadline = useMutation(api.jsr.updateClientTaskDeadline);
  const updateClientTaskStatus = useMutation(api.jsr.updateClientTaskStatus);
  const [jsrExpanded, setJsrExpanded] = useState(true);

  if (brand === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (brand === null) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Brand not found.</p>
      </div>
    );
  }

  const validManagers = brand.managers.filter((m): m is NonNullable<typeof m> => !!m);
  const assignedManagerIds = validManagers.map((m) => m._id);
  const availableManagers = (managers ?? []).filter((m) => !assignedManagerIds.includes(m._id));

  async function handleAssignManager() {
    if (!addManagerId) return;
    try {
      await assignManager({ brandId, managerId: addManagerId as Id<"users"> });
      setAddManagerId("");
      toast("success", "Manager assigned");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to assign manager");
    }
  }

  async function handleRemoveManager(managerId: Id<"users">) {
    try {
      await removeManager({ brandId, managerId });
      toast("success", "Manager removed");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to remove manager");
    }
    setRemovingManagerId(null);
  }

  async function handleDelete() {
    try {
      await deleteBrand({ brandId });
      toast("success", "Brand deleted");
      router.push("/brands");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete brand");
    }
    setShowDeleteBrand(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const uploadUrl = await generateDocUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await uploadDoc({
        brandId,
        fileId: storageId,
        fileName: file.name,
        fileType: file.type,
        visibility: "all",
      });
      toast("success", "Document uploaded");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Upload failed");
    }
    setUploadingDoc(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAddCredential(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addCredential({
        brandId,
        platform: credPlatform,
        username: credUsername || undefined,
        password: credPassword || undefined,
        url: credUrl || undefined,
        notes: credNotes || undefined,
      });
      setCredPlatform("");
      setCredUsername("");
      setCredPassword("");
      setCredUrl("");
      setCredNotes("");
      setShowAddCred(false);
      toast("success", "Credential added");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to add credential");
    }
  }

  function togglePasswordVisibility(id: string) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerateJsr() {
    try {
      await generateJsrLink({ brandId });
      toast("success", "JSR link generated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to generate link");
    }
  }

  function copyJsrLink(token: string) {
    const url = `${window.location.origin}/jsr/${token}`;
    navigator.clipboard.writeText(url);
    toast("success", "Link copied to clipboard");
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: "var(--text-secondary)",
    active: "var(--accent-employee)",
    "in-progress": "var(--accent-manager)",
    review: "var(--accent-admin)",
    completed: "var(--accent-employee)",
    archived: "var(--text-disabled)",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/brands")}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: brand.color + "20" }}
        >
          <Tag className="h-5 w-5" style={{ color: brand.color }} />
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight">
            {brand.name}
          </h1>
          {brand.description && (
            <p className="text-[14px] text-[var(--text-secondary)]">{brand.description}</p>
          )}
          {(brand as any).creatorName && (
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              Created by {(brand as any).creatorName}
            </p>
          )}
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={() => setShowDeleteBrand(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Managers</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.managers.length}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Briefs</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.briefs.length}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Employees</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.employeeCount}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Tasks</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.totalTasks}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Managers Section */}
        <div>
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Managers
          </h2>
          <Card>
            {brand.managers.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">No managers assigned yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {validManagers.map((manager) => (
                <div
                  key={manager._id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div>
                    <p className="font-medium text-[14px] text-[var(--text-primary)]">
                      {manager.name ?? manager.email ?? "Unknown"}
                    </p>
                    {manager.email && manager.name && (
                      <p className="text-[12px] text-[var(--text-secondary)]">{manager.email}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setRemovingManagerId(manager._id as Id<"users">)}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && availableManagers.length > 0 && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                <select
                  value={addManagerId}
                  onChange={(e) => setAddManagerId(e.target.value)}
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Select a manager...</option>
                  {availableManagers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
                </select>
                <Button variant="primary" onClick={handleAssignManager}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Briefs Section */}
        <div>
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Briefs
          </h2>
          <div className="flex flex-col gap-3">
            {brand.briefs.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">No briefs in this brand yet.</p>
            )}
            {brand.briefs.map((brief) => (
              <Card
                key={brief._id}
                onClick={() => router.push(`/brief/${brief._id}`)}
                hover
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)] truncate flex-1">
                    {brief.title}
                  </h3>
                  <span
                    className="font-medium text-[12px] capitalize ml-2"
                    style={{ color: STATUS_COLORS[brief.status] ?? "var(--text-secondary)" }}
                  >
                    {brief.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-employee)]"
                      style={{ width: `${brief.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {brief.doneCount}/{brief.taskCount}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Task Status Summary */}
      {brand.totalTasks > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Task Status
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Pending</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts.pending}
              </p>
            </Card>
            <Card accent="manager">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">In Progress</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts["in-progress"]}
              </p>
            </Card>
            <Card accent="admin">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Review</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts.review}
              </p>
            </Card>
            <Card accent="employee">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Done</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts.done}
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Employees */}
      {brand.employees.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Team Members Working on This Brand
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {brand.employees.filter((e): e is NonNullable<typeof e> => !!e).map((emp) => (
              <Card key={emp._id}>
                <p className="font-medium text-[14px] text-[var(--text-primary)]">
                  {emp.name ?? emp.email ?? "Unknown"}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">{emp.email}</p>
                <Badge variant={emp.role === "manager" ? "manager" : "employee"} className="mt-1">
                  {emp.role}
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Documents Section */}
      <div className="mt-8">
        <button
          onClick={() => setDocsExpanded(!docsExpanded)}
          className="flex items-center gap-2 mb-4 group"
        >
          {docsExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
          <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">
            Documents
          </h2>
          <span className="text-[12px] text-[var(--text-muted)]">
            ({brandDocs?.length ?? 0})
          </span>
        </button>
        {docsExpanded && (
          <Card>
            {(isAdmin || user?.role === "manager") && (
              <div className="mb-4 pb-4 border-b border-[var(--border)]">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingDoc}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  {uploadingDoc ? "Uploading..." : "Upload Document"}
                </Button>
              </div>
            )}
            {(brandDocs ?? []).length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">No documents uploaded yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {(brandDocs ?? []).map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-[var(--text-secondary)] shrink-0" />
                    <div className="min-w-0">
                      <a
                        href={doc.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[13px] text-[var(--accent-admin)] hover:underline truncate block"
                      >
                        {doc.fileName}
                      </a>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {doc.uploaderName} &middot; {new Date(doc.createdAt).toLocaleDateString()}
                        {doc.visibility === "admin_only" && (
                          <Badge variant="admin" className="ml-2">Admin Only</Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  {(isAdmin || doc.uploadedBy === user?._id) && (
                    <button
                      onClick={() => setDeletingDocId(doc._id)}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Credentials Section (Admin Only) */}
      {isAdmin && (
        <div className="mt-8">
          <button
            onClick={() => setCredsExpanded(!credsExpanded)}
            className="flex items-center gap-2 mb-4 group"
          >
            {credsExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
            <KeyRound className="h-4 w-4 text-[var(--text-secondary)]" />
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">
              Credentials
            </h2>
            <Badge variant="admin">Admin Only</Badge>
            <span className="text-[12px] text-[var(--text-muted)]">
              ({credentials?.length ?? 0})
            </span>
          </button>
          {credsExpanded && (
            <Card>
              {(credentials ?? []).length === 0 && !showAddCred && (
                <p className="text-[13px] text-[var(--text-muted)] mb-3">No credentials stored yet.</p>
              )}
              <div className="flex flex-col gap-3">
                {(credentials ?? []).map((cred) => (
                  <div
                    key={cred._id}
                    className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[13px] text-[var(--text-primary)]">
                        {cred.platform}
                      </span>
                      <button
                        onClick={() => setDeletingCredId(cred._id)}
                        className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {cred.username && (
                      <div className="flex items-center gap-2 text-[12px] mb-1">
                        <span className="text-[var(--text-muted)] w-16">User:</span>
                        <span className="text-[var(--text-primary)] font-mono">{cred.username}</span>
                      </div>
                    )}
                    {cred.password && (
                      <div className="flex items-center gap-2 text-[12px] mb-1">
                        <span className="text-[var(--text-muted)] w-16">Pass:</span>
                        <span className="text-[var(--text-primary)] font-mono">
                          {visiblePasswords.has(cred._id) ? cred.password : "••••••••"}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(cred._id)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {visiblePasswords.has(cred._id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                    {cred.url && (
                      <div className="flex items-center gap-2 text-[12px] mb-1">
                        <span className="text-[var(--text-muted)] w-16">URL:</span>
                        <a href={cred.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-admin)] hover:underline truncate">
                          {cred.url}
                        </a>
                      </div>
                    )}
                    {cred.notes && (
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">{cred.notes}</p>
                    )}
                  </div>
                ))}
              </div>
              {showAddCred ? (
                <form onSubmit={handleAddCredential} className="mt-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      value={credPlatform}
                      onChange={(e) => setCredPlatform(e.target.value)}
                      placeholder="Platform (e.g. Instagram)"
                      required
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                    <input
                      value={credUrl}
                      onChange={(e) => setCredUrl(e.target.value)}
                      placeholder="URL (optional)"
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                    <input
                      value={credUsername}
                      onChange={(e) => setCredUsername(e.target.value)}
                      placeholder="Username"
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                    <input
                      value={credPassword}
                      onChange={(e) => setCredPassword(e.target.value)}
                      placeholder="Password"
                      type="password"
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                  </div>
                  <input
                    value={credNotes}
                    onChange={(e) => setCredNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full mb-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary">Save</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowAddCred(false)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <Button variant="secondary" className="mt-3" onClick={() => setShowAddCred(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Credential
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* JSR (Job Status Report) Section */}
      {(isAdmin || user?.role === "manager") && (
        <div className="mt-8">
          <button
            onClick={() => setJsrExpanded(!jsrExpanded)}
            className="flex items-center gap-2 mb-4 group"
          >
            {jsrExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
            <ExternalLink className="h-4 w-4 text-[var(--text-secondary)]" />
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">
              Job Status Report (JSR)
            </h2>
          </button>
          {jsrExpanded && (
            <Card>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Share a JSR link with clients to let them view task status and submit requests.
                </p>
                <Button variant="primary" onClick={handleGenerateJsr}>
                  <Link2 className="h-4 w-4 mr-1.5" />
                  Generate Link
                </Button>
              </div>

              {/* Active JSR Links */}
              {(jsrLinks ?? []).filter((l) => l.isActive).length > 0 && (
                <div className="mb-4">
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">Active Links</p>
                  <div className="flex flex-col gap-2">
                    {(jsrLinks ?? []).filter((l) => l.isActive).map((link) => (
                      <div key={link._id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Link2 className="h-3.5 w-3.5 text-[var(--accent-employee)] shrink-0" />
                          <span className="text-[12px] text-[var(--text-primary)] font-mono truncate">
                            {typeof window !== "undefined" ? `${window.location.origin}/jsr/${link.token}` : `/jsr/${link.token}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => copyJsrLink(link.token)}
                            className="text-[var(--text-muted)] hover:text-[var(--accent-admin)] transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              await deactivateJsrLink({ jsrLinkId: link._id });
                              toast("success", "Link deactivated");
                            }}
                            className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors text-[11px] font-medium"
                          >
                            Deactivate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Client-Added Tasks */}
              {(jsrClientTasks ?? []).length > 0 && (
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">Client Requests</p>
                  <div className="flex flex-col gap-2">
                    {(jsrClientTasks ?? []).map((task) => (
                      <div key={task._id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-[13px] text-[var(--text-primary)]">{task.title}</span>
                          <select
                            value={task.status}
                            onChange={(e) => updateClientTaskStatus({ taskId: task._id, status: e.target.value as "pending_review" | "accepted" | "in_progress" | "completed" | "declined" })}
                            className="bg-[var(--bg-input)] border border-[var(--border)] rounded text-[11px] px-2 py-0.5 text-[var(--text-primary)]"
                          >
                            <option value="pending_review">Pending Review</option>
                            <option value="accepted">Accepted</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="declined">Declined</option>
                          </select>
                        </div>
                        {task.description && (
                          <p className="text-[12px] text-[var(--text-secondary)] mb-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                          {task.clientName && <span>From: {task.clientName}</span>}
                          {task.proposedDeadline && (
                            <span>Proposed: {new Date(task.proposedDeadline).toLocaleDateString()}</span>
                          )}
                          <div className="flex items-center gap-1">
                            <span>Deadline:</span>
                            <input
                              type="date"
                              value={task.finalDeadline ? new Date(task.finalDeadline).toISOString().split("T")[0] : ""}
                              onChange={(e) => {
                                const d = e.target.value ? new Date(e.target.value).getTime() : undefined;
                                if (d) updateClientTaskDeadline({ taskId: task._id, finalDeadline: d });
                              }}
                              className="bg-[var(--bg-input)] border border-[var(--border)] rounded text-[11px] px-1 py-0.5 text-[var(--text-primary)]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(jsrLinks ?? []).filter((l) => l.isActive).length === 0 && (jsrClientTasks ?? []).length === 0 && (
                <p className="text-[13px] text-[var(--text-muted)]">No JSR links generated yet. Generate a link to share with the client.</p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Delete Document Confirmation */}
      <ConfirmModal
        open={!!deletingDocId}
        title="Delete Document"
        message="Are you sure you want to delete this document?"
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingDocId) {
            await deleteDoc({ documentId: deletingDocId });
            toast("success", "Document deleted");
          }
          setDeletingDocId(null);
        }}
        onCancel={() => setDeletingDocId(null)}
      />

      {/* Delete Credential Confirmation */}
      <ConfirmModal
        open={!!deletingCredId}
        title="Delete Credential"
        message="Are you sure you want to delete this credential?"
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingCredId) {
            await deleteCredential({ credentialId: deletingCredId });
            toast("success", "Credential deleted");
          }
          setDeletingCredId(null);
        }}
        onCancel={() => setDeletingCredId(null)}
      />

      <ConfirmModal
        open={showDeleteBrand}
        title="Delete Brand"
        message="Are you sure you want to delete this brand? This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteBrand(false)}
      />

      <ConfirmModal
        open={!!removingManagerId}
        title="Remove Manager"
        message="Remove this manager from the brand?"
        confirmLabel="Remove"
        confirmingLabel="Removing..."
        variant="danger"
        onConfirm={async () => {
          if (removingManagerId) await handleRemoveManager(removingManagerId);
        }}
        onCancel={() => setRemovingManagerId(null)}
      />
    </div>
  );
}
