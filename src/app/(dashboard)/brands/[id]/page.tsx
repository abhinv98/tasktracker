"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, ConfirmModal, Input, Panel, PanelEmpty, StatStrip, StatTile, StatusBadge, useToast } from "@/components/ui";
import { ArrowLeft, UserPlus, Trash2, Briefcase, Upload, Eye, EyeOff, Plus, ChevronDown, ChevronRight, Link2, Copy, ExternalLink, ImagePlus, X, MessageCircle, Send, Users, FileEdit, Pencil, PauseCircle, PlayCircle } from "lucide-react";
import ClientPortalTab from "@/components/brand/ClientPortalTab";
import InternalJsrTab from "@/components/brand/InternalJsrTab";
import MomTab from "@/components/brand/MomTab";
import { useSmartBack } from "@/lib/useSmartBack";
import { taskStatusMeta } from "@/lib/status";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";
import { fieldClass, iconButtonClass, iconButtonDangerClass } from "@/components/ui/classes";

const ICON_BTN = iconButtonClass;
const ICON_BTN_DANGER = iconButtonDangerClass;
// Same frame and title bar as <Panel>, for blocks whose header carries a
// button or drop handlers (Panel's header only takes a link).
const BLOCK = "rounded-lg border border-[var(--border)] bg-white overflow-hidden";
const BLOCK_HEAD =
  "flex items-center justify-between gap-3 h-11 px-4 border-b border-[var(--border-subtle)]";
const FIELD = fieldClass;

function BlockTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 font-semibold text-[14px] text-[var(--text-primary)]">
      {title}
      {count !== undefined && count > 0 && (
        <span className="font-normal tabular-nums text-[var(--text-muted)]">{count}</span>
      )}
    </h3>
  );
}

type BrandTab = "overview" | "client-jsr" | "internal-jsr" | "mom";

/** Only allow same-origin in-app paths as a back target. */
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* ignore */
  }
  return null;
}

export default function BrandDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brandId = params.id as Id<"brands">;

  // Back navigation returns the user to wherever they came from.
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const backHref = returnTo ?? "/brands-overview";
  const goBack = useSmartBack(backHref);

  const tabParam = searchParams.get("tab");
  const activeTab: BrandTab =
    tabParam === "client-jsr" || tabParam === "internal-jsr" || tabParam === "mom"
      ? tabParam
      : "overview";

  function navigateToTab(tab: BrandTab) {
    if (tab === "overview") {
      router.replace(pathname);
    } else {
      router.replace(`${pathname}?tab=${encodeURIComponent(tab)}`);
    }
  }

  const brand = useQuery(api.brands.getBrand, { brandId });
  const user = useQuery(api.users.getCurrentUser);
  const managers = useQuery(api.users.listManagers);
  const assignManager = useMutation(api.brands.assignManagerToBrand);
  const removeManager = useMutation(api.brands.removeManagerFromBrand);
  const deleteBrand = useMutation(api.brands.deleteBrand);
  const updateBrand = useMutation(api.brands.updateBrand);
  const setBrandOnHold = useMutation(api.brands.setBrandOnHold);

  const [addManagerId, setAddManagerId] = useState<string>("");
  const [showDeleteBrand, setShowDeleteBrand] = useState(false);
  const [showHoldBrand, setShowHoldBrand] = useState(false);
  const [removingManagerId, setRemovingManagerId] = useState<Id<"users"> | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const { toast } = useToast();

  async function saveBrandName() {
    const next = nameDraft.trim();
    if (!next || next === brand?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await updateBrand({ brandId, name: next });
      toast("success", "Brand name updated");
      setEditingName(false);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to rename brand");
    }
    setSavingName(false);
  }

  const isAdmin = user?.role === "admin";

  // This page is the brand management surface. Employees get the read-only
  // view of the brands they work on instead (getBrand also refuses them).
  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/my-brands");
  }, [user, router]);

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
  // Enter and the Send button share this. The ref, not the state, is the
  // guard: a second Enter can arrive before the state has re-rendered, and
  // the client would get the message twice.
  const sendingJsrRef = useRef(false);
  function sendJsrMessage() {
    const content = jsrMsgContent.trim();
    if (!content || sendingJsrRef.current) return;
    sendingJsrRef.current = true;
    setSendingJsrMsg(true);
    sendManagerMessage({ brandId, content })
      .then(() => setJsrMsgContent(""))
      .catch(() => toast("error", "Failed to send"))
      .finally(() => {
        sendingJsrRef.current = false;
        setSendingJsrMsg(false);
      });
  }

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
        if (!result.ok) throw new Error("The upload was refused");
        const { storageId } = await result.json();
        await uploadDoc({
          brandId,
          fileId: storageId,
          fileName: file.name,
          fileType: file.type,
          visibility: "all" as const,
        });
      } catch (err) {
        toast("error", `${file.name} could not be uploaded${err instanceof Error && err.message ? `: ${err.message}` : ""}`);
      }
      setUploadingDoc(false);
    }
  }, [generateDocUploadUrl, uploadDoc, brandId]);

  if (brand === undefined) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (brand === null) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[var(--text-secondary)]">Brand not found.</p>
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

  async function handleToggleHold() {
    const onHold = !brand?.onHold;
    try {
      await setBrandOnHold({ brandId, onHold });
      toast("success", onHold ? "Brand on hold, briefs archived" : "Brand resumed, briefs restored");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update brand");
    }
    setShowHoldBrand(false);
  }

  async function handleDelete() {
    try {
      await deleteBrand({ brandId });
      toast("success", "Brand deleted");
      router.push("/brands-overview");
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
      if (!result.ok) throw new Error("The upload was refused");
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
      if (!result.ok) throw new Error("The upload was refused");
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

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 mb-6">
        <button
          onClick={goBack}
          className={ICON_BTN}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
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
                className="w-14 h-14 rounded-lg object-cover border border-[var(--border)]"
              />
              {isAdmin && (
                <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="p-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
                    title="Change logo"
                    aria-label="Change logo"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-white" />
                  </button>
                  <button
                    onClick={handleRemoveLogo}
                    className="p-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
                    title="Remove logo"
                    aria-label="Remove logo"
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
              className="w-14 h-14 rounded-lg flex flex-col items-center justify-center border border-dashed transition-colors"
              style={{
                borderColor: brand.color + "40",
                backgroundColor: brand.color + "08",
              }}
              title={isAdmin ? "Upload brand logo" : brand.name}
              aria-label={isAdmin ? "Upload brand logo" : brand.name}
            >
              {uploadingLogo ? (
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: brand.color + "30", borderTopColor: brand.color }} />
              ) : isAdmin ? (
                <ImagePlus className="h-5 w-5" style={{ color: brand.color + "80" }} />
              ) : (
                <span className="text-[20px] font-semibold" style={{ color: brand.color }} aria-hidden>
                  {brand.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-[180px]">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              disabled={savingName}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveBrandName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
              aria-label="Brand name"
              className="font-semibold text-[20px] sm:text-[26px] text-[var(--text-primary)] tracking-[-0.02em] leading-tight bg-transparent border-b border-[var(--accent-admin)] focus:outline-none w-full max-w-md"
            />
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="font-semibold text-[20px] sm:text-[26px] text-[var(--text-primary)] tracking-[-0.02em] leading-tight truncate">
                {brand.name}
              </h1>
              {brand.onHold && <Badge variant="neutral">On hold</Badge>}
              {/* Only Brand Managers (admins) can rename a brand. */}
              {isAdmin && (
                <button
                  onClick={() => {
                    setNameDraft(brand.name);
                    setEditingName(true);
                  }}
                  title="Rename brand"
                  aria-label="Rename brand"
                  className={`${ICON_BTN} shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {brand.description && (
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{brand.description}</p>
          )}
          {(brand as any).creatorName && (
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              Created by {(brand as any).creatorName}
            </p>
          )}
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={() => setShowHoldBrand(true)} className="whitespace-nowrap">
            {brand.onHold ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
            {brand.onHold ? "Resume" : "Put on hold"}
          </Button>
        )}
        {isAdmin && (
          <Button variant="ghost" onClick={() => setShowDeleteBrand(true)} className="whitespace-nowrap">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
      </div>

      {/* ═══ TAB BAR ═══ */}
      {/* Scrolls sideways on phones instead of cutting tabs off. */}
      <div className="flex items-center gap-1 mb-4 border-b border-[var(--border)] -mx-4 px-4 sm:-mx-8 sm:px-8 overflow-x-auto">
        {([
          { id: "overview" as BrandTab, label: "Overview", icon: Briefcase },
          { id: "client-jsr" as BrandTab, label: "Client Portal", icon: ExternalLink },
          { id: "internal-jsr" as BrandTab, label: "Internal JSR", icon: Users },
          { id: "mom" as BrandTab, label: "MOM", icon: FileEdit },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigateToTab(tab.id)}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-3 sm:px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border)]"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: CLIENT PORTAL (merged Client JSR + Intake) ═══ */}
      {activeTab === "client-jsr" && (
        <ClientPortalTab brandId={brandId} brand={brand} canManageLinks={canManageLinks} />
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
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">

        {/* ── LEFT COLUMN ── */}
        <div className="min-w-0 flex flex-col gap-4">
          {/* Stats */}
          <StatStrip>
            <StatTile label="Managers" value={brand.managers.length} />
            <StatTile label="Briefs" value={brand.briefs.length} />
            <StatTile label="Employees" value={brand.employeeCount} />
            <StatTile label="Tasks" value={brand.totalTasks} />
          </StatStrip>

          {/* Managers */}
          <Panel title="Managers">
            {brand.managers.length === 0 && (
              <PanelEmpty>No managers assigned yet.</PanelEmpty>
            )}
            <div className="divide-y divide-[var(--border-subtle)]">
              {validManagers.map((manager) => (
                <div
                  key={manager._id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--bg-primary)] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                      {manager.name ?? manager.email ?? "Unknown"}
                    </p>
                    {manager.email && manager.name && (
                      <p className="text-[12px] text-[var(--text-muted)] truncate">{manager.email}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setRemovingManagerId(manager._id as Id<"users">)}
                      className={`${ICON_BTN_DANGER} shrink-0`}
                      aria-label="Remove manager"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && availableManagers.length > 0 && (
              <div className="flex gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
                <select
                  value={addManagerId}
                  onChange={(e) => setAddManagerId(e.target.value)}
                  className={`${FIELD} flex-1 min-w-0`}
                >
                  <option value="">Select a manager...</option>
                  {availableManagers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={handleAssignManager} aria-label="Assign manager">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Panel>

          {/* Task Status */}
          {brand.totalTasks > 0 && (
            <Panel title="Task Status">
              <StatStrip bare>
                <StatTile label="Pending" value={brand.taskStatusCounts.pending} />
                <StatTile label="In Progress" value={brand.taskStatusCounts["in-progress"]} />
                <StatTile label="Review" value={brand.taskStatusCounts.review} />
                <StatTile label="Done" value={brand.taskStatusCounts.done} />
              </StatStrip>
            </Panel>
          )}

          {/* Employees */}
          {brand.employees.length > 0 && (
            <Panel title="Team Members Working on This Brand">
              <div className="divide-y divide-[var(--border-subtle)]">
                {brand.employees.filter((e): e is NonNullable<typeof e> => !!e).map((emp) => {
                  // "Brand Manager" only for managers actually assigned to THIS
                  // brand — admins from other brands are just contributors here.
                  const isManagerHere = assignedManagerIds.includes(emp._id);
                  return (
                  <div key={emp._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                        {emp.name ?? emp.email ?? "Unknown"}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] truncate">{emp.email}</p>
                    </div>
                    <Badge
                      variant={isManagerHere ? "admin" : emp.role === "admin" ? "manager" : "employee"}
                      className="shrink-0"
                    >
                      {isManagerHere ? "Brand Manager" : emp.role === "admin" ? "Contributor" : "Employee"}
                    </Badge>
                  </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="min-w-0 flex flex-col gap-4">
          {/* Files / Documents with drag & drop */}
          <div
            className={`rounded-lg border bg-white overflow-hidden transition-colors ${dragOver ? "border-[var(--accent-admin)]" : "border-[var(--border)]"}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (isAdmin) setDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (isAdmin) setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
            onDrop={isAdmin ? handleFileDrop : undefined}
          >
            <div className={BLOCK_HEAD}>
              <BlockTitle title="Files" count={brandDocs?.length ?? 0} />
              {isAdmin && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingDoc}
                  className={`${ICON_BTN} disabled:opacity-50`}
                  aria-label="Upload file"
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
                <div className="flex items-center justify-center gap-2 py-8 mb-3 rounded-md border border-dashed border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]">
                  <Upload className="h-4 w-4 text-[var(--accent-admin-text)]" />
                  <p className="text-[13px] font-medium text-[var(--accent-admin-text)]">Drop files here</p>
                </div>
              )}
              {!dragOver && (brandDocs ?? []).length === 0 && !uploadingDoc && (
                <div
                  className="flex items-center justify-center gap-2 py-6 rounded-md border border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--border-strong)] transition-colors"
                  onClick={() => { if (isAdmin) fileInputRef.current?.click(); }}
                >
                  <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                  <p className="text-[13px] text-[var(--text-muted)]">{isAdmin ? "Drop files or click to upload" : "No files uploaded yet"}</p>
                </div>
              )}
              {uploadingDoc && (
                <div className="flex items-center justify-center py-3 mb-3">
                  <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--text-secondary)] rounded-full animate-spin mr-2" />
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
                        className="group relative rounded-md border border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--bg-primary)] transition-colors p-3 block"
                      >
                        <p className="font-medium text-[12px] text-[var(--text-primary)] leading-snug line-clamp-2 mb-1.5 min-h-[32px]">
                          {doc.fileName}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mb-2">
                          {doc.uploaderName} · {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge>{ext}</Badge>
                          {doc.visibility === "admin_only" && (
                            <Badge variant="admin">Admin</Badge>
                          )}
                        </div>
                        {(isAdmin || doc.uploadedBy === user?._id) && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingDocId(doc._id); }}
                            className="absolute top-1 right-1 inline-flex items-center justify-center h-7 w-7 rounded-md bg-white border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label="Delete file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
          <div className={BLOCK}>
            <div className={BLOCK_HEAD}>
              <BlockTitle title="Important Links" count={brandLinks?.length ?? 0} />
              {canManageLinks && !showAddLink && (
                <button
                  onClick={() => setShowAddLink(true)}
                  className={ICON_BTN}
                  aria-label="Add link"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {(brandLinks ?? []).length === 0 && !showAddLink && (
              <PanelEmpty>No links added yet</PanelEmpty>
            )}
            <div className="divide-y divide-[var(--border-subtle)]">
              {(brandLinks ?? []).map((link) => (
                <div
                  key={link._id}
                  className="group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--bg-primary)] transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--text-muted)] mt-1 shrink-0" />
                    <div className="min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[13px] text-[var(--accent-admin-text)] hover:underline underline-offset-2 block"
                      >
                        {link.label}
                      </a>
                      {link.description && (
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{link.description}</p>
                      )}
                    </div>
                  </div>
                  {canManageLinks && (
                    <button
                      onClick={() => setDeletingLinkId(link._id)}
                      className={`${ICON_BTN_DANGER} shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                      aria-label="Delete link"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {showAddLink && (
              <form onSubmit={handleAddBrandLink} className="m-4 p-3 rounded-md border border-[var(--border)] bg-[var(--bg-primary)]">
                <div className="flex flex-col gap-2 mb-2">
                  <Input
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="Link name"
                    required
                  />
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="URL"
                    required
                  />
                  <Input
                    value={linkDesc}
                    onChange={(e) => setLinkDesc(e.target.value)}
                    placeholder="Description (optional)"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">Save</Button>
                  <Button type="button" variant="ghost" onClick={() => { setShowAddLink(false); setLinkUrl(""); setLinkLabel(""); setLinkDesc(""); }}>Cancel</Button>
                </div>
              </form>
            )}
          </div>

          {/* Credentials (Admin Only) */}
          {isAdmin && (
            <div className={BLOCK}>
              <button
                onClick={() => setCredsExpanded(!credsExpanded)}
                aria-expanded={credsExpanded}
                className={`flex items-center gap-2 h-11 px-4 w-full text-left hover:bg-[var(--bg-primary)] transition-colors ${credsExpanded ? "border-b border-[var(--border-subtle)]" : ""}`}
              >
                <span className="flex-1 min-w-0">
                  <BlockTitle title="Credentials" count={credentials?.length ?? 0} />
                </span>
                <Badge variant="admin">Admin Only</Badge>
                {credsExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
              </button>
              {credsExpanded && (
                <>
                  {(credentials ?? []).length === 0 && !showAddCred && (
                    <p className="px-4 pt-3.5 text-[13px] text-[var(--text-muted)]">No credentials stored yet.</p>
                  )}
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {(credentials ?? []).map((cred) => (
                      <div key={cred._id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                            {cred.platform}
                          </span>
                          <button
                            onClick={() => setDeletingCredId(cred._id)}
                            className={`${ICON_BTN_DANGER} shrink-0 -my-1`}
                            aria-label="Delete credential"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {cred.username && (
                          <div className="flex items-center gap-2 text-[12px] mb-1">
                            <span className="text-[var(--text-muted)] w-12 shrink-0">User:</span>
                            <span className="text-[var(--text-primary)] font-mono">{cred.username}</span>
                          </div>
                        )}
                        {cred.password && (
                          <div className="flex items-center gap-2 text-[12px] mb-1">
                            <span className="text-[var(--text-muted)] w-12 shrink-0">Pass:</span>
                            <span className="text-[var(--text-primary)] font-mono">
                              {visiblePasswords.has(cred._id) ? cred.password : "••••••••"}
                            </span>
                            <button
                              onClick={() => togglePasswordVisibility(cred._id)}
                              className={`${ICON_BTN} -my-2`}
                              aria-label={visiblePasswords.has(cred._id) ? "Hide password" : "Show password"}
                            >
                              {visiblePasswords.has(cred._id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        )}
                        {cred.url && (
                          <div className="flex items-center gap-2 text-[12px] mb-1">
                            <span className="text-[var(--text-muted)] w-12 shrink-0">URL:</span>
                            <a href={cred.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-admin-text)] hover:underline truncate">
                              {cred.url}
                            </a>
                          </div>
                        )}
                        {cred.notes && (
                          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{cred.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={`p-4 ${(credentials ?? []).length > 0 ? "border-t border-[var(--border-subtle)]" : ""}`}>
                  {showAddCred ? (
                    <form onSubmit={handleAddCredential} className="p-3 rounded-md border border-[var(--border)] bg-[var(--bg-primary)]">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Input
                          value={credPlatform}
                          onChange={(e) => setCredPlatform(e.target.value)}
                          placeholder="Platform"
                          required
                        />
                        <Input
                          value={credUrl}
                          onChange={(e) => setCredUrl(e.target.value)}
                          placeholder="URL"
                        />
                        <Input
                          value={credUsername}
                          onChange={(e) => setCredUsername(e.target.value)}
                          placeholder="Username"
                        />
                        <Input
                          value={credPassword}
                          onChange={(e) => setCredPassword(e.target.value)}
                          placeholder="Password"
                          type="password"
                        />
                      </div>
                      <Input
                        value={credNotes}
                        onChange={(e) => setCredNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        className="mb-2"
                      />
                      <div className="flex gap-2">
                        <Button type="submit" variant="primary">Save</Button>
                        <Button type="button" variant="ghost" onClick={() => setShowAddCred(false)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <Button variant="secondary" className="w-full" onClick={() => setShowAddCred(true)}>
                      <Plus className="h-4 w-4" />
                      Add Credential
                    </Button>
                  )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Briefs (in right sidebar, below credentials) */}
          <Panel title="Briefs" count={brand.briefs.length}>
            {brand.briefs.length === 0 && (
              <PanelEmpty>No briefs yet</PanelEmpty>
            )}
            <div className="divide-y divide-[var(--border-subtle)]">
              {brand.briefs.map((brief) => (
                <div
                  key={brief._id}
                  onClick={() => {
                    // Back from this brief returns to this brand page,
                    // preserving the brand page's own back target.
                    const brandSelf = `/brands/${brandId}${
                      returnTo
                        ? `?returnTo=${encodeURIComponent(returnTo)}`
                        : ""
                    }`;
                    router.push(
                      `/brief/${brief._id}?returnTo=${encodeURIComponent(
                        brandSelf
                      )}`
                    );
                  }}
                  className="px-4 py-2.5 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <h4 className="font-medium text-[14px] text-[var(--text-primary)] truncate flex-1">
                      {brief.title}
                    </h4>
                    <StatusBadge
                      className="shrink-0"
                      color={BRIEF_STATUS_COLORS[brief.status] ?? BRIEF_STATUS_COLORS.draft}
                      label={BRIEF_STATUS_LABELS[brief.status] ?? brief.status}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent-employee)]"
                        style={{ width: `${brief.progress}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                      {brief.doneCount}/{brief.taskCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          {/* JSR Links (in right sidebar, under Briefs) */}
          {canManageLinks && (
            <div className={BLOCK}>
              <div className={BLOCK_HEAD}>
                <BlockTitle title="JSR Links" count={(jsrLinks ?? []).filter((l) => l.isActive && l.linkType !== "intake").length} />
                <button
                  onClick={handleGenerateJsr}
                  className={ICON_BTN}
                  aria-label="Generate JSR link"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {(jsrLinks ?? []).filter((l) => l.isActive && l.linkType !== "intake").length === 0 && (
                <PanelEmpty>No active JSR links. Click + to generate one.</PanelEmpty>
              )}
              <div className="divide-y divide-[var(--border-subtle)]">
                {(jsrLinks ?? []).filter((l) => l.isActive && l.linkType !== "intake").map((link) => (
                  <div key={link._id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                      <span className="text-[12px] text-[var(--text-primary)] font-mono truncate flex-1">
                        {typeof window !== "undefined" ? `${window.location.origin}/jsr/${link.token}` : `/jsr/${link.token}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => copyJsrLink(link.token)}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button variant="secondary" onClick={() => setChatSidebarOpen(true)}>
                        <MessageCircle className="h-3.5 w-3.5" /> Show Chat
                      </Button>
                      <Button
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => { setDeactivatingJsrId(link._id); setDeleteJsrTasks(false); }}
                      >
                        Deactivate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manage Client Tasks (in right sidebar, under JSR links) */}
          {canManageLinks && (
            <Panel title="Manage Client Tasks">
              <div className="max-h-[400px] overflow-y-auto">
                {(brandClientTasks ?? []).length === 0 && (
                  <PanelEmpty>No tasks for this brand.</PanelEmpty>
                )}
                <div className="divide-y divide-[var(--border-subtle)]">
                  {(brandClientTasks ?? []).map((task) => (
                    <div key={task._id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[14px] font-medium text-[var(--text-primary)] truncate flex-1">{task.title}</p>
                        <StatusBadge
                          className="shrink-0"
                          color={taskStatusMeta(task.status).dot}
                          label={taskStatusMeta(task.status).label}
                        />
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)] mb-2">{task.briefTitle}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {task.clientFacing && (
                          <Badge>Client-facing</Badge>
                        )}
                        {task.needsClientInput && (
                          <Badge variant="warning">Needs client input</Badge>
                        )}
                        {task.clientStatus === "pending_client" && (
                          <Badge>Sent to client</Badge>
                        )}
                        {task.clientStatus === "client_approved" && (
                          <Badge variant="employee">Approved</Badge>
                        )}
                        {task.clientStatus === "client_changes_requested" && (
                          <Badge variant="warning">Changes requested</Badge>
                        )}
                        {task.clientStatus === "client_denied" && (
                          <Badge variant="danger">Denied</Badge>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 mt-2 empty:hidden">
                        {!task.needsClientInput && task.clientFacing && (
                          <Button
                            variant="secondary"
                            onClick={() => { setClientInputTaskId(task._id); setClientInputMsg(""); }}
                          >
                            Request Client Input
                          </Button>
                        )}
                        {task.needsClientInput && (
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await clearClientInputFlag({ taskId: task._id as Id<"tasks"> });
                                toast("success", "Client input flag cleared");
                              } catch { toast("error", "Failed to clear flag"); }
                            }}
                          >
                            Clear Input Request
                          </Button>
                        )}
                        {task.clientFacing && task.deliverableStatus === "approved" && !task.clientStatus && task.deliverableId && (
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await sendToClientMut({ deliverableId: task.deliverableId as Id<"deliverables"> });
                                toast("success", "Sent to client for review");
                              } catch (err) { toast("error", err instanceof Error ? err.message : "Failed"); }
                            }}
                          >
                            Send to Client
                          </Button>
                        )}
                      </div>
                      {/* Client input message textbox */}
                      {clientInputTaskId === task._id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={clientInputMsg}
                            onChange={(e) => setClientInputMsg(e.target.value)}
                            placeholder="What do you need from the client?"
                            className={`${FIELD} flex-1 min-w-0`}
                          />
                          <Button
                            variant="primary"
                            className="shrink-0"
                            onClick={async () => {
                              if (!clientInputMsg.trim()) return;
                              try {
                                await markNeedsClientInput({ taskId: task._id as Id<"tasks">, message: clientInputMsg.trim() });
                                toast("success", "Client input requested");
                                setClientInputTaskId(null);
                                setClientInputMsg("");
                              } catch { toast("error", "Failed"); }
                            }}
                          >
                            Send
                          </Button>
                          <Button
                            variant="ghost"
                            className="shrink-0"
                            onClick={() => { setClientInputTaskId(null); setClientInputMsg(""); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
      )}

      {/* ═══ CHAT SIDEBAR ═══ */}
      {chatSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setChatSidebarOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[500px] max-w-[90vw] bg-white border-l border-[var(--border)] shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">Client Chat</h3>
              <button onClick={() => setChatSidebarOpen(false)} className={ICON_BTN} aria-label="Close chat">
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
                      className="shrink-0 flex items-center gap-1.5 h-control px-3 rounded-control text-[12px] font-medium border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <span className="text-[var(--text-primary)]">{dateLabel(d)}</span>
                      <span className="tabular-nums text-[var(--text-muted)]">{dateCounts[d]}</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ overscrollBehavior: "contain" }}>
              {(jsrMessages ?? []).length === 0 && (
                <p className="text-[13px] text-[var(--text-muted)] text-center py-8">No messages yet. Start a conversation with the client.</p>
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
                        <div id={`chat-date-${dateKey}`} className="sticky top-0 z-10 flex items-center gap-3 my-3 py-1 bg-white">
                          <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                          <span className="text-[12px] font-medium text-[var(--text-muted)] shrink-0">{dateLabel}</span>
                          <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                        </div>
                      )}
                      <div className={`flex ${msg.senderType === "manager" ? "justify-end" : "justify-start"} mb-1.5`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 ${msg.senderType === "manager" ? "bg-[var(--text-primary)] text-white rounded-br-sm" : "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-bl-sm"}`}>
                          <p className={`text-[11px] font-medium mb-0.5 ${msg.senderType === "manager" ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                            {msg.senderName || (msg.senderType === "client" ? "Client" : "You")}
                          </p>
                          <p className="text-[13px] leading-relaxed">{msg.content}</p>
                          <p className={`text-[11px] mt-1 ${msg.senderType === "manager" ? "text-white/70" : "text-[var(--text-muted)]"}`}>
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
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendJsrMessage();
                  }
                }}
                placeholder="Type a message..."
                className={`${FIELD} flex-1 min-w-0`}
              />
              <Button
                variant="primary"
                aria-label="Send message"
                onClick={sendJsrMessage}
                disabled={sendingJsrMsg || !jsrMsgContent.trim()}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
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
        open={showHoldBrand}
        title={brand.onHold ? "Resume Brand" : "Put Brand on Hold"}
        message={
          brand.onHold
            ? "Restore every brief this hold archived to its previous status? Tasks come back on everyone's dashboards."
            : "Archive every brief of this brand? Its briefs and tasks disappear from everyone's views, and no new briefs can be created until you resume."
        }
        confirmLabel={brand.onHold ? "Resume" : "Put on hold"}
        confirmingLabel="Saving..."
        variant={brand.onHold ? undefined : "danger"}
        onConfirm={handleToggleHold}
        onCancel={() => setShowHoldBrand(false)}
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
