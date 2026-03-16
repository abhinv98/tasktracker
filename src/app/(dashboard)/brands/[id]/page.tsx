"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, Input, useToast } from "@/components/ui";
import { ArrowLeft, Tag, UserPlus, Trash2, Briefcase, Upload, FileText, Eye, EyeOff, Plus, ChevronDown, ChevronRight, KeyRound, Link2, Copy, ExternalLink, ImagePlus, X, MessageCircle, Send, AlertCircle, CheckCircle2, XCircle, Users, FileEdit } from "lucide-react";
import ClientJsrTab from "@/components/brand/ClientJsrTab";
import InternalJsrTab from "@/components/brand/InternalJsrTab";
import MomTab from "@/components/brand/MomTab";

type BrandTab = "overview" | "client-jsr" | "internal-jsr" | "mom";

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

  // Brand Logo
  const generateLogoUrl = useMutation(api.brands.generateLogoUploadUrl);
  const updateBrandLogo = useMutation(api.brands.updateBrandLogo);
  const removeBrandLogo = useMutation(api.brands.removeBrandLogo);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Important Links
  const brandLinks = useQuery(api.brandLinks.listLinks, { brandId });
  const addBrandLink = useMutation(api.brandLinks.addLink);
  const deleteBrandLink = useMutation(api.brandLinks.deleteLink);
  const [linksExpanded, setLinksExpanded] = useState(true);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [deletingLinkId, setDeletingLinkId] = useState<Id<"brandLinks"> | null>(null);

  // JSR Links
  const jsrLinks = useQuery(api.jsr.listJsrLinks, { brandId });
  const generateJsrLink = useMutation(api.jsr.generateJsrLink);
  const deactivateJsrLink = useMutation(api.jsr.deactivateJsrLink);
  const jsrMessages = useQuery(api.jsr.listJsrMessages, { brandId });
  const sendManagerMessage = useMutation(api.jsr.sendManagerMessage);
  const [jsrExpanded, setJsrExpanded] = useState(true);
  const [deactivatingJsrId, setDeactivatingJsrId] = useState<Id<"jsrLinks"> | null>(null);
  const [deleteJsrTasks, setDeleteJsrTasks] = useState(false);
  const [jsrMsgContent, setJsrMsgContent] = useState("");
  const [sendingJsrMsg, setSendingJsrMsg] = useState(false);

  // Chat sidebar
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  useEffect(() => {
    if (chatSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [chatSidebarOpen]);

  // Client task management
  const brandClientTasks = useQuery(api.jsr.listBrandTasksForClient, { brandId });
  const markNeedsClientInput = useMutation(api.jsr.markNeedsClientInput);
  const clearClientInputFlag = useMutation(api.jsr.clearClientInputFlag);
  const sendToClientMut = useMutation(api.jsr.sendToClient);
  const [clientInputTaskId, setClientInputTaskId] = useState<string | null>(null);
  const [clientInputMsg, setClientInputMsg] = useState("");

  // Tabs
  const [activeTab, setActiveTab] = useState<BrandTab>("overview");

  // Drag & drop file upload
  const [dragOver, setDragOver] = useState(false);
  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    for (const file of files) {
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
          visibility: "all" as const,
        });
      } catch {}
      setUploadingDoc(false);
    }
  }, [generateDocUploadUrl, uploadDoc, brandId]);

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
  const isBrandManager = user ? assignedManagerIds.includes(user._id) : false;
  const canManageLinks = isAdmin || isBrandManager;

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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("error", "Please upload an image file");
      return;
    }
    setUploadingLogo(true);
    try {
      const uploadUrl = await generateLogoUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await updateBrandLogo({ brandId, logoId: storageId });
      toast("success", "Brand logo updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Logo upload failed");
    }
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  async function handleRemoveLogo() {
    try {
      await removeBrandLogo({ brandId });
      toast("success", "Logo removed");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to remove logo");
    }
  }

  async function handleAddBrandLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim() || !linkLabel.trim()) return;
    try {
      await addBrandLink({
        brandId,
        url: linkUrl.trim(),
        label: linkLabel.trim(),
        description: linkDesc.trim() || undefined,
      });
      setLinkUrl("");
      setLinkLabel("");
      setLinkDesc("");
      setShowAddLink(false);
      toast("success", "Link added");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to add link");
    }
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
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push("/brands")}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="relative group">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          {(brand as any).logoUrl ? (
            <div className="relative">
              <img
                src={(brand as any).logoUrl}
                alt={brand.name}
                className="w-14 h-14 rounded-xl object-cover border border-[var(--border-primary)]"
              />
              {isAdmin && (
                <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="p-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
                    title="Change logo"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-white" />
                  </button>
                  <button
                    onClick={handleRemoveLogo}
                    className="p-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
                    title="Remove logo"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                if (isAdmin) logoInputRef.current?.click();
              }}
              disabled={uploadingLogo}
              className="w-14 h-14 rounded-xl flex flex-col items-center justify-center border-2 border-dashed transition-colors"
              style={{
                borderColor: brand.color + "40",
                backgroundColor: brand.color + "08",
              }}
              title={isAdmin ? "Upload brand logo" : brand.name}
            >
              {uploadingLogo ? (
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: brand.color + "30", borderTopColor: brand.color }} />
              ) : isAdmin ? (
                <ImagePlus className="h-5 w-5" style={{ color: brand.color + "80" }} />
              ) : (
                <Tag className="h-5 w-5" style={{ color: brand.color }} />
              )}
            </button>
          )}
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

      {/* ═══ TAB BAR ═══ */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)] -mx-8 px-8">
        {([
          { id: "overview" as BrandTab, label: "Overview", icon: Briefcase },
          { id: "client-jsr" as BrandTab, label: "Client JSR", icon: ExternalLink },
          { id: "internal-jsr" as BrandTab, label: "Internal JSR", icon: Users },
          { id: "mom" as BrandTab, label: "MOM", icon: FileEdit },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-[var(--accent-admin)] text-[var(--accent-admin)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)]"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: CLIENT JSR ═══ */}
      {activeTab === "client-jsr" && (
        <ClientJsrTab brandId={brandId} brand={brand} canManageLinks={canManageLinks} />
      )}

      {/* ═══ TAB: INTERNAL JSR ═══ */}
      {activeTab === "internal-jsr" && (
        <InternalJsrTab brandId={brandId} />
      )}

      {/* ═══ TAB: MOM ═══ */}
      {activeTab === "mom" && (
        <MomTab brandId={brandId} isAdmin={isAdmin} isBrandManager={isBrandManager} />
      )}

      {/* ═══ TAB: OVERVIEW (TWO-COLUMN LAYOUT) ═══ */}
      {activeTab === "overview" && (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="min-w-0">
          {/* Stats 2×2 */}
          <div className="grid grid-cols-2 gap-4 mb-8">
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

          {/* Managers */}
          <div className="mb-8">
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

          {/* Task Status 2×2 */}
          {brand.totalTasks > 0 && (
            <div className="mb-8">
              <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
                Task Status
              </h2>
              <div className="grid grid-cols-2 gap-4">
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
            <div className="mb-8">
              <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
                Team Members Working on This Brand
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {brand.employees.filter((e): e is NonNullable<typeof e> => !!e).map((emp) => (
                  <Card key={emp._id}>
                    <p className="font-medium text-[14px] text-[var(--text-primary)]">
                      {emp.name ?? emp.email ?? "Unknown"}
                    </p>
                    <p className="text-[12px] text-[var(--text-secondary)]">{emp.email}</p>
                    <Badge variant={emp.role === "admin" ? "admin" : "employee"} className="mt-1">
                      {emp.role === "admin" ? "Brand Manager" : "Employee"}
                    </Badge>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex flex-col gap-6">
          {/* Files / Documents with drag & drop */}
          <div
            className={`rounded-xl border-2 bg-white overflow-hidden transition-colors ${dragOver ? "border-[var(--accent-admin)] bg-[var(--accent-admin)]/5" : "border-[var(--border)]"}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (isAdmin) setDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (isAdmin) setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
            onDrop={isAdmin ? handleFileDrop : undefined}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">Files</h3>
                <span className="text-[11px] text-[var(--text-muted)]">({brandDocs?.length ?? 0})</span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingDoc}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="p-4">
              {dragOver && (
                <div className="flex flex-col items-center justify-center py-10 mb-3 rounded-lg border-2 border-dashed border-[var(--accent-admin)] bg-[var(--accent-admin)]/5">
                  <Upload className="h-8 w-8 text-[var(--accent-admin)] mb-2" />
                  <p className="text-[13px] font-medium text-[var(--accent-admin)]">Drop files here</p>
                </div>
              )}
              {!dragOver && (brandDocs ?? []).length === 0 && !uploadingDoc && (
                <div
                  className="text-center py-8 rounded-lg border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--accent-admin)] transition-colors"
                  onClick={() => { if (isAdmin) fileInputRef.current?.click(); }}
                >
                  <Upload className="h-7 w-7 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[12px] text-[var(--text-muted)]">{isAdmin ? "Drop files or click to upload" : "No files uploaded yet"}</p>
                </div>
              )}
              {uploadingDoc && (
                <div className="flex items-center justify-center py-3 mb-3">
                  <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent-admin)] rounded-full animate-spin mr-2" />
                  <span className="text-[12px] text-[var(--text-muted)]">Uploading...</span>
                </div>
              )}
              {!dragOver && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {(brandDocs ?? []).map((doc) => {
                    const ext = doc.fileName.split(".").pop()?.toUpperCase() ?? "FILE";
                    return (
                      <a
                        key={doc._id}
                        href={doc.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative rounded-lg border border-[var(--border)] hover:border-[var(--accent-admin)] bg-[var(--bg-primary)] hover:shadow-sm transition-all p-3 block"
                      >
                        <p className="font-medium text-[11px] text-[var(--text-primary)] leading-snug line-clamp-2 mb-1.5 min-h-[30px]">
                          {doc.fileName}
                        </p>
                        <p className="text-[9px] text-[var(--text-muted)] mb-2">
                          {doc.uploaderName} · {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--bg-hover)] text-[var(--text-secondary)] uppercase tracking-wider">
                            {ext}
                          </span>
                          {doc.visibility === "admin_only" && (
                            <Badge variant="admin">Admin</Badge>
                          )}
                        </div>
                        {(isAdmin || doc.uploadedBy === user?._id) && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingDocId(doc._id); }}
                            className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Important Links */}
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[var(--text-secondary)]" />
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">Important Links</h3>
                <span className="text-[11px] text-[var(--text-muted)]">({brandLinks?.length ?? 0})</span>
              </div>
              {canManageLinks && !showAddLink && (
                <button
                  onClick={() => setShowAddLink(true)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="p-4">
              {(brandLinks ?? []).length === 0 && !showAddLink && (
                <div className="text-center py-6">
                  <Link2 className="h-7 w-7 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[12px] text-[var(--text-muted)]">No links added yet</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {(brandLinks ?? []).map((link) => (
                  <div
                    key={link._id}
                    className="flex items-start justify-between py-2 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <ExternalLink className="h-3.5 w-3.5 text-[var(--accent-admin)] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[12px] text-[var(--accent-admin)] hover:underline block"
                        >
                          {link.label}
                        </a>
                        {link.description && (
                          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{link.description}</p>
                        )}
                      </div>
                    </div>
                    {canManageLinks && (
                      <button
                        onClick={() => setDeletingLinkId(link._id)}
                        className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {showAddLink && (
                <form onSubmit={handleAddBrandLink} className="mt-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
                  <div className="flex flex-col gap-2 mb-2">
                    <input
                      value={linkLabel}
                      onChange={(e) => setLinkLabel(e.target.value)}
                      placeholder="Link name"
                      required
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                    <input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="URL"
                      required
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                    <input
                      value={linkDesc}
                      onChange={(e) => setLinkDesc(e.target.value)}
                      placeholder="Description (optional)"
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary">Save</Button>
                    <Button type="button" variant="secondary" onClick={() => { setShowAddLink(false); setLinkUrl(""); setLinkLabel(""); setLinkDesc(""); }}>Cancel</Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Credentials (Admin Only) */}
          {isAdmin && (
            <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <button
                onClick={() => setCredsExpanded(!credsExpanded)}
                className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)] w-full text-left"
              >
                <KeyRound className="h-4 w-4 text-[var(--text-secondary)]" />
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">Credentials</h3>
                <Badge variant="admin">Admin Only</Badge>
                <span className="text-[11px] text-[var(--text-muted)] ml-1">({credentials?.length ?? 0})</span>
                {credsExpanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
              </button>
              {credsExpanded && (
                <div className="p-4">
                  {(credentials ?? []).length === 0 && !showAddCred && (
                    <p className="text-[12px] text-[var(--text-muted)] text-center py-4">No credentials stored yet.</p>
                  )}
                  <div className="flex flex-col gap-2.5">
                    {(credentials ?? []).map((cred) => (
                      <div
                        key={cred._id}
                        className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-[12px] text-[var(--text-primary)]">
                            {cred.platform}
                          </span>
                          <button
                            onClick={() => setDeletingCredId(cred._id)}
                            className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {cred.username && (
                          <div className="flex items-center gap-2 text-[11px] mb-1">
                            <span className="text-[var(--text-muted)] w-12">User:</span>
                            <span className="text-[var(--text-primary)] font-mono">{cred.username}</span>
                          </div>
                        )}
                        {cred.password && (
                          <div className="flex items-center gap-2 text-[11px] mb-1">
                            <span className="text-[var(--text-muted)] w-12">Pass:</span>
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
                          <div className="flex items-center gap-2 text-[11px] mb-1">
                            <span className="text-[var(--text-muted)] w-12">URL:</span>
                            <a href={cred.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-admin)] hover:underline truncate">
                              {cred.url}
                            </a>
                          </div>
                        )}
                        {cred.notes && (
                          <p className="text-[10px] text-[var(--text-secondary)] mt-1">{cred.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {showAddCred ? (
                    <form onSubmit={handleAddCredential} className="mt-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          value={credPlatform}
                          onChange={(e) => setCredPlatform(e.target.value)}
                          placeholder="Platform"
                          required
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                        <input
                          value={credUrl}
                          onChange={(e) => setCredUrl(e.target.value)}
                          placeholder="URL"
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                        <input
                          value={credUsername}
                          onChange={(e) => setCredUsername(e.target.value)}
                          placeholder="Username"
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                        <input
                          value={credPassword}
                          onChange={(e) => setCredPassword(e.target.value)}
                          placeholder="Password"
                          type="password"
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                        />
                      </div>
                      <input
                        value={credNotes}
                        onChange={(e) => setCredNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        className="w-full mb-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      />
                      <div className="flex gap-2">
                        <Button type="submit" variant="primary">Save</Button>
                        <Button type="button" variant="secondary" onClick={() => setShowAddCred(false)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <Button variant="secondary" className="mt-2.5 w-full" onClick={() => setShowAddCred(true)}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add Credential
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Briefs (in right sidebar, below credentials) */}
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[var(--text-secondary)]" />
                <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">Briefs</h3>
                <span className="text-[11px] text-[var(--text-muted)]">({brand.briefs.length})</span>
              </div>
            </div>
            <div className="p-4">
              {brand.briefs.length === 0 && (
                <div className="text-center py-6">
                  <Briefcase className="h-7 w-7 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[12px] text-[var(--text-muted)]">No briefs yet</p>
                </div>
              )}
              <div className="flex flex-col gap-2.5">
                {brand.briefs.map((brief) => (
                  <div
                    key={brief._id}
                    onClick={() => router.push(`/brief/${brief._id}`)}
                    className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] hover:border-[var(--accent-admin)] cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="font-medium text-[12px] text-[var(--text-primary)] truncate flex-1 mr-2">
                        {brief.title}
                      </h4>
                      <span
                        className="font-medium text-[10px] capitalize shrink-0"
                        style={{ color: STATUS_COLORS[brief.status] ?? "var(--text-secondary)" }}
                      >
                        {brief.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent-employee)]"
                          style={{ width: `${brief.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                        {brief.doneCount}/{brief.taskCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* JSR Links (in right sidebar, under Briefs) */}
          {canManageLinks && (
            <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-[var(--text-secondary)]" />
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">JSR Links</h3>
                  <span className="text-[11px] text-[var(--text-muted)]">({(jsrLinks ?? []).filter((l) => l.isActive).length})</span>
                </div>
                <button
                  onClick={handleGenerateJsr}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4">
                {(jsrLinks ?? []).filter((l) => l.isActive).length === 0 && (
                  <div className="text-center py-6">
                    <ExternalLink className="h-7 w-7 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                    <p className="text-[12px] text-[var(--text-muted)]">No active JSR links. Click + to generate one.</p>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {(jsrLinks ?? []).filter((l) => l.isActive).map((link) => (
                    <div key={link._id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Link2 className="h-3.5 w-3.5 text-[var(--accent-employee)] shrink-0" />
                        <span className="text-[11px] text-[var(--text-primary)] font-mono truncate flex-1">
                          {typeof window !== "undefined" ? `${window.location.origin}/jsr/${link.token}` : `/jsr/${link.token}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyJsrLink(link.token)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                        <button
                          onClick={() => setChatSidebarOpen(true)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/10 transition-colors"
                        >
                          <MessageCircle className="h-3 w-3" /> Show Chat
                        </button>
                        <button
                          onClick={() => { setDeactivatingJsrId(link._id); setDeleteJsrTasks(false); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors ml-auto"
                        >
                          Deactivate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Manage Client Tasks (in right sidebar, under JSR links) */}
          {canManageLinks && (
            <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[var(--text-secondary)]" />
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">Manage Client Tasks</h3>
                </div>
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto">
                {(brandClientTasks ?? []).length === 0 && (
                  <p className="text-[12px] text-[var(--text-muted)] text-center py-4">No tasks for this brand.</p>
                )}
                <div className="flex flex-col gap-2">
                  {(brandClientTasks ?? []).map((task) => (
                    <div key={task._id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate flex-1 mr-2">{task.title}</p>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0 capitalize">{task.status}</span>
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] mb-2">{task.briefTitle}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {task.clientFacing && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-700">Client-facing</span>
                        )}
                        {task.needsClientInput && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-50 text-orange-700">Needs client input</span>
                        )}
                        {task.clientStatus === "pending_client" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 text-purple-700">Sent to client</span>
                        )}
                        {task.clientStatus === "client_approved" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-50 text-green-700"><CheckCircle2 className="h-2.5 w-2.5" />Approved</span>
                        )}
                        {task.clientStatus === "client_changes_requested" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700">Changes requested</span>
                        )}
                        {task.clientStatus === "client_denied" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-700"><XCircle className="h-2.5 w-2.5" />Denied</span>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                        {!task.needsClientInput && task.clientFacing && (
                          <button
                            onClick={() => { setClientInputTaskId(task._id); setClientInputMsg(""); }}
                            className="text-[10px] font-medium text-orange-600 hover:bg-orange-50 px-2 py-1 rounded transition-colors"
                          >
                            Request Client Input
                          </button>
                        )}
                        {task.needsClientInput && (
                          <button
                            onClick={async () => {
                              try {
                                await clearClientInputFlag({ taskId: task._id as Id<"tasks"> });
                                toast("success", "Client input flag cleared");
                              } catch { toast("error", "Failed to clear flag"); }
                            }}
                            className="text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-2 py-1 rounded transition-colors"
                          >
                            Clear Input Request
                          </button>
                        )}
                        {task.clientFacing && task.deliverableStatus === "approved" && !task.clientStatus && task.deliverableId && (
                          <button
                            onClick={async () => {
                              try {
                                await sendToClientMut({ deliverableId: task.deliverableId as Id<"deliverables"> });
                                toast("success", "Sent to client for review");
                              } catch (err) { toast("error", err instanceof Error ? err.message : "Failed"); }
                            }}
                            className="text-[10px] font-medium text-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/10 px-2 py-1 rounded transition-colors"
                          >
                            Send to Client
                          </button>
                        )}
                      </div>
                      {/* Client input message textbox */}
                      {clientInputTaskId === task._id && (
                        <div className="mt-2 flex gap-1.5">
                          <input
                            value={clientInputMsg}
                            onChange={(e) => setClientInputMsg(e.target.value)}
                            placeholder="What do you need from the client?"
                            className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-orange-400"
                          />
                          <button
                            onClick={async () => {
                              if (!clientInputMsg.trim()) return;
                              try {
                                await markNeedsClientInput({ taskId: task._id as Id<"tasks">, message: clientInputMsg.trim() });
                                toast("success", "Client input requested");
                                setClientInputTaskId(null);
                                setClientInputMsg("");
                              } catch { toast("error", "Failed"); }
                            }}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-[10px] font-medium"
                          >
                            Send
                          </button>
                          <button
                            onClick={() => { setClientInputTaskId(null); setClientInputMsg(""); }}
                            className="shrink-0 px-2 py-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ═══ CHAT SIDEBAR ═══ */}
      {chatSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setChatSidebarOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[500px] max-w-[90vw] bg-white border-l border-[var(--border)] shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[var(--accent-admin)]" />
                <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">Client Chat</h3>
              </div>
              <button onClick={() => setChatSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Date session pills */}
            {(() => {
              const msgs = jsrMessages ?? [];
              const dateCounts: Record<string, number> = {};
              for (const m of msgs) {
                const d = new Date(m.createdAt).toISOString().split("T")[0];
                dateCounts[d] = (dateCounts[d] ?? 0) + 1;
              }
              const dates = Object.keys(dateCounts).sort().reverse();
              if (dates.length === 0) return null;
              const todayStr = new Date().toISOString().split("T")[0];
              const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
              function dateLabel(d: string) {
                if (d === todayStr) return "Today";
                if (d === yesterdayStr) return "Yesterday";
                return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }
              return (
                <div className="border-b border-[var(--border)] px-4 py-2.5 flex gap-1.5 overflow-x-auto" style={{ overscrollBehavior: "contain" }}>
                  {dates.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        const el = document.getElementById(`chat-date-${d}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/5 transition-colors"
                    >
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">{dateLabel(d)}</span>
                      <span className="text-[9px] font-medium text-[var(--text-muted)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full">{dateCounts[d]}</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ overscrollBehavior: "contain" }}>
              {(jsrMessages ?? []).length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)] text-center py-8">No messages yet. Start a conversation with the client.</p>
              )}
              {(() => {
                const msgs = jsrMessages ?? [];
                let lastDateKey = "";
                const todayStr = new Date().toISOString().split("T")[0];
                const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
                return msgs.map((msg: any) => {
                  const dateKey = new Date(msg.createdAt).toISOString().split("T")[0];
                  let dateLabel = new Date(msg.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                  if (dateKey === todayStr) dateLabel = "Today";
                  else if (dateKey === yesterdayStr) dateLabel = "Yesterday";
                  const showDateHeader = dateKey !== lastDateKey;
                  lastDateKey = dateKey;
                  return (
                    <div key={msg._id}>
                      {showDateHeader && (
                        <div id={`chat-date-${dateKey}`} className="sticky top-0 z-10 flex items-center gap-3 my-3 py-1 bg-white/95 backdrop-blur-sm">
                          <div className="flex-1 h-px bg-[var(--border)]" />
                          <span className="text-[10px] font-bold text-[var(--accent-admin)] bg-[var(--accent-admin)]/8 px-3 py-1 rounded-full shrink-0">{dateLabel}</span>
                          <div className="flex-1 h-px bg-[var(--border)]" />
                        </div>
                      )}
                      <div className={`flex ${msg.senderType === "manager" ? "justify-end" : "justify-start"} mb-1.5`}>
                        <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${msg.senderType === "manager" ? "bg-[var(--accent-admin)] text-white rounded-br-sm" : "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-bl-sm"}`}>
                          <p className={`text-[10px] font-semibold mb-0.5 ${msg.senderType === "manager" ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                            {msg.senderName || (msg.senderType === "client" ? "Client" : "You")}
                          </p>
                          <p className="text-[12px] leading-relaxed">{msg.content}</p>
                          <p className={`text-[9px] mt-1 ${msg.senderType === "manager" ? "text-white/50" : "text-[var(--text-muted)]"}`}>
                            {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)] p-3 flex items-center gap-2">
              <input
                value={jsrMsgContent}
                onChange={(e) => setJsrMsgContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && jsrMsgContent.trim()) {
                    e.preventDefault();
                    setSendingJsrMsg(true);
                    sendManagerMessage({ brandId, content: jsrMsgContent.trim() })
                      .then(() => { setJsrMsgContent(""); })
                      .catch(() => toast("error", "Failed to send"))
                      .finally(() => setSendingJsrMsg(false));
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
              <button
                onClick={() => {
                  if (!jsrMsgContent.trim()) return;
                  setSendingJsrMsg(true);
                  sendManagerMessage({ brandId, content: jsrMsgContent.trim() })
                    .then(() => { setJsrMsgContent(""); })
                    .catch(() => toast("error", "Failed to send"))
                    .finally(() => setSendingJsrMsg(false));
                }}
                disabled={sendingJsrMsg || !jsrMsgContent.trim()}
                className="shrink-0 p-2.5 rounded-lg bg-[var(--accent-admin)] text-white disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Deactivate JSR Link Confirmation */}
      <ConfirmModal
        open={!!deactivatingJsrId}
        title="Deactivate JSR Link"
        message="This will deactivate the link so clients can no longer access it."
        confirmLabel="Deactivate"
        confirmingLabel="Deactivating..."
        variant="danger"
        onConfirm={async () => {
          if (deactivatingJsrId) {
            await deactivateJsrLink({ jsrLinkId: deactivatingJsrId, deleteTasks: deleteJsrTasks });
            toast("success", deleteJsrTasks ? "Link deactivated and tasks deleted" : "Link deactivated");
          }
          setDeactivatingJsrId(null);
          setDeleteJsrTasks(false);
        }}
        onCancel={() => { setDeactivatingJsrId(null); setDeleteJsrTasks(false); }}
      >
        <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteJsrTasks}
            onChange={(e) => setDeleteJsrTasks(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] accent-[var(--danger)]"
          />
          <span className="text-[13px] text-[var(--text-primary)]">
            Also delete all client request tasks created from this link
          </span>
        </label>
      </ConfirmModal>

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

      <ConfirmModal
        open={!!deletingLinkId}
        title="Delete Link"
        message="Are you sure you want to delete this link?"
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (deletingLinkId) {
            await deleteBrandLink({ linkId: deletingLinkId });
            toast("success", "Link deleted");
          }
          setDeletingLinkId(null);
        }}
        onCancel={() => setDeletingLinkId(null)}
      />
    </div>
  );
}
