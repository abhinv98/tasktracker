"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useToast } from "@/components/ui";
import { Trash2, Calendar, ChevronDown, ChevronRight, Plus, FolderOpen, Filter, List, FolderClosed, CheckCircle2, Briefcase, X } from "lucide-react";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";

const STATUS_COLORS = BRIEF_STATUS_COLORS;

const STORAGE_BRIEF_DRAFT = "tasktracker_briefDraft";
const STORAGE_BRIEFS_UI = "tasktracker_briefsUi";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(deadline: number): boolean {
  return deadline < Date.now();
}

function daysUntil(deadline: number): number {
  return Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function BriefsPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const brands = useQuery(api.brands.listBrands);
  const managers = useQuery(api.users.listManagers);

  const [filterManagerId, setFilterManagerId] = useState<string>("");
  const briefs = useQuery(
    api.briefs.listBriefs,
    filterManagerId ? { managerId: filterManagerId as Id<"users"> } : {}
  );

  const createBrief = useMutation(api.briefs.createBrief);
  const deleteBrief = useMutation(api.briefs.deleteBrief);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState<string>("");
  const [managerId, setManagerId] = useState<string>("");
  const brandManagerIds = useQuery(
    api.brands.getManagersForBrand,
    brandId ? { brandId: brandId as Id<"brands"> } : "skip"
  );
  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  const [briefType, setBriefType] = useState<string>("");
  const [briefMode, setBriefMode] = useState<"master" | "single" | "content_calendar">("master");

  const [clientFacing, setClientFacing] = useState(false);
  const [creativesRequired, setCreativesRequired] = useState(1);

  // Single task brief fields
  const [stAssignee, setStAssignee] = useState("");
  const [stTeamId, setStTeamId] = useState("");
  const [stDeadlineTime, setStDeadlineTime] = useState("");
  const allUsers = useQuery(api.users.listAllUsers);
  const allTeams = useQuery(api.teams.listTeams, {});
  const stTeamMembers = useQuery(
    api.teams.getTeamMembers,
    stTeamId ? { teamId: stTeamId as Id<"teams"> } : "skip"
  );

  const [deletingBriefId, setDeletingBriefId] = useState<Id<"briefs"> | null>(null);
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [viewMode, setViewMode] = useState<"folders" | "all">("folders");
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(() => new Set());
  const [briefsTab, setBriefsTab] = useState<"active" | "completed">("active");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_BRIEFS_UI);
      if (!raw) return;
      const o = JSON.parse(raw) as {
        briefsTab?: string;
        filterManagerId?: string;
        viewMode?: string;
        expandedBrandIds?: string[];
      };
      if (o.briefsTab === "active" || o.briefsTab === "completed") setBriefsTab(o.briefsTab);
      if (typeof o.filterManagerId === "string") setFilterManagerId(o.filterManagerId);
      if (o.viewMode === "folders" || o.viewMode === "all") setViewMode(o.viewMode);
      if (Array.isArray(o.expandedBrandIds)) setExpandedBrands(new Set(o.expandedBrandIds));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_BRIEFS_UI,
        JSON.stringify({
          briefsTab,
          filterManagerId,
          viewMode,
          expandedBrandIds: [...expandedBrands],
        })
      );
    } catch {
      /* ignore */
    }
  }, [briefsTab, filterManagerId, viewMode, expandedBrands]);

  const persistBriefDraft = useCallback(() => {
    try {
      sessionStorage.setItem(
        STORAGE_BRIEF_DRAFT,
        JSON.stringify({
          title,
          description,
          brandId,
          managerId,
          deadline,
          briefType,
          briefMode,
          clientFacing,
          stAssignee,
          stTeamId,
          stDeadlineTime,
          creativesRequired,
        })
      );
    } catch {
      /* ignore */
    }
  }, [
    title,
    description,
    brandId,
    managerId,
    deadline,
    briefType,
    briefMode,
    clientFacing,
    stAssignee,
    stTeamId,
    stDeadlineTime,
    creativesRequired,
  ]);

  useEffect(() => {
    if (!showModal) return;
    persistBriefDraft();
  }, [showModal, persistBriefDraft]);

  useEffect(() => {
    if (!showModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        persistBriefDraft();
        setShowModal(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal, persistBriefDraft]);

  function toggleBrand(id: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function buildFolders(briefsList: typeof briefs) {
    if (!briefsList || briefsList.length === 0) return [];
    const sorted = [...briefsList].sort((a, b) => a.globalPriority - b.globalPriority);
    const grouped = new Map<string, typeof sorted>();

    for (const brief of sorted) {
      const key = (brief as any).brandId ?? "__no_brand__";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(brief);
    }

    const folders: { brandId: string; brandName: string; brandColor: string; briefs: typeof sorted }[] = [];

    for (const [key, folderBriefs] of grouped) {
      if (key === "__no_brand__") continue;
      const brand = (brands ?? []).find((b: any) => b._id === key);
      folders.push({
        brandId: key,
        brandName: brand?.name ?? "Unknown Brand",
        brandColor: (brand as any)?.color ?? "#6b7280",
        briefs: folderBriefs,
      });
    }

    folders.sort((a, b) => a.brandName.localeCompare(b.brandName));

    const noBrand = grouped.get("__no_brand__");
    if (noBrand && noBrand.length > 0) {
      folders.push({
        brandId: "__no_brand__",
        brandName: "No Brand",
        brandColor: "#9ca3af",
        briefs: noBrand,
      });
    }

    return folders;
  }

  const activeBriefs = useMemo(() => (briefs ?? []).filter((b) => b.status !== "completed"), [briefs]);
  const completedBriefs = useMemo(() => (briefs ?? []).filter((b) => b.status === "completed"), [briefs]);
  const activeFolders = useMemo(() => buildFolders(activeBriefs), [activeBriefs, brands]);
  const completedFolders = useMemo(() => buildFolders(completedBriefs), [completedBriefs, brands]);
  const brandFolders = briefsTab === "active" ? activeFolders : completedFolders;
  const displayedBriefs = briefsTab === "active" ? activeBriefs : completedBriefs;


  function parseDuration(str: string): number {
    const m = str.match(/^(\d+)(m|h|d)$/i);
    if (!m) return 0;
    const val = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit === "m") return val;
    if (unit === "h") return val * 60;
    if (unit === "d") return val * 60 * 8;
    return 0;
  }

  function openCreateModalForBrand(forBrandId?: string) {
    try {
      const raw = sessionStorage.getItem(STORAGE_BRIEF_DRAFT);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        setTitle(typeof d.title === "string" ? d.title : "");
        setDescription(typeof d.description === "string" ? d.description : "");
        setBrandId(
          forBrandId ??
            (typeof d.brandId === "string" ? d.brandId : "")
        );
        setManagerId(typeof d.managerId === "string" ? d.managerId : "");
        setDeadline(typeof d.deadline === "number" ? d.deadline : undefined);
        setBriefType(typeof d.briefType === "string" ? d.briefType : "");
        if (d.briefMode === "master" || d.briefMode === "single" || d.briefMode === "content_calendar") {
          setBriefMode(d.briefMode);
        } else {
          setBriefMode("master");
        }
        setClientFacing(d.clientFacing === true);
        setStAssignee(typeof d.stAssignee === "string" ? d.stAssignee : "");
        setStTeamId(typeof d.stTeamId === "string" ? d.stTeamId : "");
        setStDeadlineTime(typeof d.stDeadlineTime === "string" ? d.stDeadlineTime : "");
        const cr = d.creativesRequired;
        setCreativesRequired(
          typeof cr === "number" && cr >= 1 && cr <= 99 ? Math.floor(cr) : 1
        );
      } else {
        setBrandId(forBrandId ?? "");
        setManagerId("");
        setTitle("");
        setDescription("");
        setDeadline(undefined);
        setBriefType("");
        setBriefMode("master");
        setStAssignee("");
        setStTeamId("");
        setStDeadlineTime("");
        setClientFacing(false);
        setCreativesRequired(1);
      }
    } catch {
      setBrandId(forBrandId ?? "");
      setManagerId("");
      setTitle("");
      setDescription("");
      setDeadline(undefined);
      setBriefType("");
      setBriefMode("master");
      setStAssignee("");
      setStTeamId("");
      setStDeadlineTime("");
      setClientFacing(false);
      setCreativesRequired(1);
    }
    setShowModal(true);
  }

  function closeCreateModal() {
    persistBriefDraft();
    setShowModal(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const isSingle = briefMode === "single";
      const isContentCal = briefMode === "content_calendar";

      type BriefType = "developmental" | "designing" | "video_editing" | "content_calendar" | "copywriting" | "single_task";

      let finalDeadline = deadline;
      if (isSingle && deadline !== undefined && stDeadlineTime) {
        const [hh, mm] = stDeadlineTime.split(":").map(Number);
        const d = new Date(deadline);
        d.setHours(hh, mm, 0, 0);
        finalDeadline = d.getTime();
      }

      let resolvedBriefType: BriefType | undefined;
      if (isSingle) resolvedBriefType = "single_task";
      else if (isContentCal) resolvedBriefType = "content_calendar";
      else resolvedBriefType = (briefType || undefined) as BriefType | undefined;

      const cr =
        creativesRequired >= 1 && creativesRequired <= 99
          ? Math.floor(creativesRequired)
          : 1;

      await createBrief({
        title,
        description,
        ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
        ...(managerId ? { assignedManagerId: managerId as Id<"users"> } : {}),
        ...(finalDeadline !== undefined ? { deadline: finalDeadline } : {}),
        briefType: resolvedBriefType,
        creativesRequired: cr,
        ...(isSingle && stAssignee ? {
          taskTitle: title,
          taskDescription: description,
          taskAssigneeId: stAssignee as Id<"users">,
          taskClientFacing: clientFacing || undefined,
        } : {}),
        ...(isSingle && stTeamId ? { teamIds: [stTeamId as Id<"teams">] } : {}),
      });
      try {
        sessionStorage.removeItem(STORAGE_BRIEF_DRAFT);
      } catch {
        /* ignore */
      }
      setShowModal(false);
      setTitle("");
      setDescription("");
      setBrandId("");
      setManagerId("");
      setDeadline(undefined);
      setBriefType("");
      setBriefMode("master");
      setClientFacing(false);
      setStAssignee("");
      setStTeamId("");
      setStDeadlineTime("");
      setCreativesRequired(1);
      toast("success", isSingle ? "Single task brief created" : "Brief created");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create brief");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Briefs
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
            Manage your briefs and priorities
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => openCreateModalForBrand()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Brief
            </Button>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] w-fit mb-4">
        <button
          onClick={() => setBriefsTab("active")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            briefsTab === "active"
              ? "bg-white shadow-sm text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          Active
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{activeBriefs.length}</span>
        </button>
        <button
          onClick={() => setBriefsTab("completed")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            briefsTab === "completed"
              ? "bg-white shadow-sm text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{completedBriefs.length}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <select
            value={filterManagerId}
            onChange={(e) => setFilterManagerId(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[180px]"
          >
            <option value="">All Managers</option>
            {(managers ?? []).map((m: any) => (
              <option key={m._id} value={m._id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          {filterManagerId && (
            <button
              onClick={() => setFilterManagerId("")}
              className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] ml-auto">
          <button
            onClick={() => setViewMode("folders")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              viewMode === "folders" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <FolderClosed className="h-3 w-3" />
            Folders
          </button>
          <button
            onClick={() => setViewMode("all")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              viewMode === "all" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <List className="h-3 w-3" />
            Show All
          </button>
        </div>
        <span className="text-[11px] text-[var(--text-muted)]">
          {displayedBriefs.length} brief{displayedBriefs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Brand Folders View */}
      {viewMode === "folders" && (
        <div className="flex flex-col gap-4">
          {brandFolders.map((folder) => {
            const isExpanded = expandedBrands.has(folder.brandId);
            const doneBriefs = folder.briefs.filter((b) => b.status === "completed").length;

            return (
              <Card key={folder.brandId} className="p-0 overflow-hidden">
                {/* Folder Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderLeft: `4px solid ${folder.brandColor}` }}
                  onClick={() => toggleBrand(folder.brandId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <FolderOpen
                    className="h-4.5 w-4.5 shrink-0"
                    style={{ color: folder.brandColor }}
                  />
                  <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">
                    {folder.brandName}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                    {doneBriefs}/{folder.briefs.length} completed
                  </span>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateModalForBrand(folder.brandId === "__no_brand__" ? undefined : folder.brandId);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--accent-admin)] bg-[var(--accent-admin-dim)] hover:bg-[var(--accent-admin)] hover:text-white transition-all shrink-0"
                    >
                      <Plus className="h-3 w-3" />
                      New Brief
                    </button>
                  )}
                </div>

                {/* Folder Body - Briefs Table */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableHead>S.No</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="hidden md:table-cell">Manager</TableHead>
                        <TableHead className="hidden lg:table-cell">Teams</TableHead>
                        <TableHead className="hidden xl:table-cell">Type</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Progress</TableHead>
                        {isAdmin && <TableHead className="w-10"></TableHead>}
                      </TableHeader>
                      <TableBody>
                        {folder.briefs.map((brief, index) => {
                          const dl = brief.deadline;
                          const overdue = dl && brief.status !== "completed" && brief.status !== "archived" && isOverdue(dl);
                          const daysLeft = dl ? daysUntil(dl) : null;

                          return (
                            <TableRow
                              key={brief._id}
                              onClick={() => router.push(`/brief/${brief._id}`)}
                            >
                              <TableCell>
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-semibold">
                                {brief.title}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {(brief as { managerName?: string }).managerName ? (
                                  <Badge variant="manager">
                                    {(brief as { managerName?: string }).managerName}
                                  </Badge>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex gap-1 flex-wrap">
                                  {((brief as { teamNames?: string[] }).teamNames ?? []).map(
                                    (name) => (
                                      <Badge key={name} variant="neutral">
                                        {name}
                                      </Badge>
                                    )
                                  )}
                                  {!((brief as { teamNames?: string[] }).teamNames?.length) && "—"}
                                </div>
                              </TableCell>
                              <TableCell className="hidden xl:table-cell">
                                {(brief as any).briefType ? (
                                  <Badge variant="neutral">
                                    {(brief as any).briefType === "content_calendar" ? "Content Calendar" :
                                     (brief as any).briefType === "video_editing" ? "Video Editing" :
                                     (brief as any).briefType === "developmental" ? "Developmental" :
                                     (brief as any).briefType === "designing" ? "Designing" : (brief as any).briefType}
                                  </Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                {dl ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`} />
                                    <span className={`text-[12px] font-medium whitespace-nowrap ${overdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                                      {formatDate(dl)}
                                    </span>
                                    {daysLeft !== null && brief.status !== "completed" && brief.status !== "archived" && (
                                      <span className={`text-[10px] ${overdue ? "text-[var(--danger)]" : daysLeft <= 3 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
                                        {overdue ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d`}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[var(--text-disabled)] text-[12px]">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span
                                  className="font-medium text-[12px]"
                                  style={{
                                    color: STATUS_COLORS[brief.status] ?? "#6b7280",
                                  }}
                                >
                                  {BRIEF_STATUS_LABELS[brief.status] ?? brief.status}
                                </span>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="w-24 h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${(brief as { progress?: number }).progress ?? 0}%`,
                                      backgroundColor: "#10b981",
                                    }}
                                  />
                                </div>
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingBriefId(brief._id);
                                    }}
                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all"
                                    title="Delete brief"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })}

          {brandFolders.length === 0 && briefs !== undefined && (
            <Card>
              <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
                {filterManagerId ? "No briefs found for this manager." : "No briefs yet. Create one to get started."}
              </p>
            </Card>
          )}

        </div>
      )}

      {/* Show All View */}
      {viewMode === "all" && (
        <div className="flex flex-col gap-5">
          {brandFolders.map((folder) => {
            let globalIndex = 0;
            return (
              <div key={folder.brandId}>
                <div
                  className="flex items-center gap-2 mb-2 px-1"
                  style={{ borderLeft: `3px solid ${folder.brandColor}`, paddingLeft: "10px" }}
                >
                  <FolderOpen className="h-4 w-4 shrink-0" style={{ color: folder.brandColor }} />
                  <span className="font-semibold text-[14px] text-[var(--text-primary)]">
                    {folder.brandName}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    ({folder.briefs.length} brief{folder.briefs.length !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableHead>S.No</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden md:table-cell">Manager</TableHead>
                      <TableHead className="hidden lg:table-cell">Teams</TableHead>
                      <TableHead className="hidden xl:table-cell">Type</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Progress</TableHead>
                      {isAdmin && <TableHead className="w-10"></TableHead>}
                    </TableHeader>
                    <TableBody>
                      {folder.briefs.map((brief) => {
                        globalIndex++;
                        const dl = brief.deadline;
                        const overdue = dl && brief.status !== "completed" && brief.status !== "archived" && isOverdue(dl);
                        const daysLeft = dl ? daysUntil(dl) : null;

                        return (
                          <TableRow
                            key={brief._id}
                            onClick={() => router.push(`/brief/${brief._id}`)}
                          >
                            <TableCell>{globalIndex}</TableCell>
                            <TableCell className="font-semibold">{brief.title}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              {(brief as { managerName?: string }).managerName ? (
                                <Badge variant="manager">
                                  {(brief as { managerName?: string }).managerName}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex gap-1 flex-wrap">
                                {((brief as { teamNames?: string[] }).teamNames ?? []).map(
                                  (name) => (
                                    <Badge key={name} variant="neutral">{name}</Badge>
                                  )
                                )}
                                {!((brief as { teamNames?: string[] }).teamNames?.length) && "—"}
                              </div>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              {(brief as any).briefType ? (
                                <Badge variant="neutral">
                                  {(brief as any).briefType === "content_calendar" ? "Content Calendar" :
                                   (brief as any).briefType === "video_editing" ? "Video Editing" :
                                   (brief as any).briefType === "developmental" ? "Developmental" :
                                   (brief as any).briefType === "designing" ? "Designing" : (brief as any).briefType}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              {dl ? (
                                <div className="flex items-center gap-1.5">
                                  <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`} />
                                  <span className={`text-[12px] font-medium whitespace-nowrap ${overdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                                    {formatDate(dl)}
                                  </span>
                                  {daysLeft !== null && brief.status !== "completed" && brief.status !== "archived" && (
                                    <span className={`text-[10px] ${overdue ? "text-[var(--danger)]" : daysLeft <= 3 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
                                      {overdue ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[var(--text-disabled)] text-[12px]">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className="font-medium text-[12px]"
                                style={{ color: STATUS_COLORS[brief.status] ?? "#6b7280" }}
                              >
                                {BRIEF_STATUS_LABELS[brief.status] ?? brief.status}
                              </span>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="w-24 h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${(brief as { progress?: number }).progress ?? 0}%`, backgroundColor: "#10b981" }}
                                />
                              </div>
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingBriefId(brief._id);
                                  }}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all"
                                  title="Delete brief"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}

          {brandFolders.length === 0 && briefs !== undefined && (
            <Card>
              <p className="text-[13px] text-[var(--text-muted)] text-center py-8">
                {filterManagerId ? "No briefs found for this manager." : "No briefs yet. Create one to get started."}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Create Brief Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <div className="flex items-start justify-between gap-2 mb-4">
              <h2 className="font-semibold text-[18px] text-[var(--text-primary)]">
                Create Brief
              </h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Brief Mode Toggle */}
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">Brief Mode</label>
                <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-hover)]">
                  <button
                    type="button"
                    onClick={() => setBriefMode("master")}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      briefMode === "master" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    Master Brief
                  </button>
                  <button
                    type="button"
                    onClick={() => setBriefMode("single")}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      briefMode === "single" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    Single Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setBriefMode("content_calendar")}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      briefMode === "content_calendar" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    Content Calendar
                  </button>
                </div>
              </div>

              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief title"
                required
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
              />

              {briefMode === "master" && (
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">Brief Type (optional)</label>
                  <select
                    value={briefType}
                    onChange={(e) => setBriefType(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">No specific type</option>
                    <option value="developmental">Developmental</option>
                    <option value="designing">Designing</option>
                    <option value="video_editing">Video Editing</option>
                    <option value="copywriting">Copywriting</option>
                  </select>
                </div>
              )}

              {briefMode === "single" && (
                <>
                  <div>
                    <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">Task Type</label>
                    <select
                      value={briefType}
                      onChange={(e) => setBriefType(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    >
                      <option value="">Select type...</option>
                      <option value="developmental">Developmental</option>
                      <option value="designing">Designing</option>
                      <option value="video_editing">Video Editing</option>
                      <option value="copywriting">Copywriting</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">Team</label>
                    <select
                      value={stTeamId}
                      onChange={(e) => { setStTeamId(e.target.value); setStAssignee(""); }}
                      required
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                    >
                      <option value="">Select team...</option>
                      {(allTeams ?? []).map((t: any) => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">Assignee</label>
                    <select
                      value={stAssignee}
                      onChange={(e) => setStAssignee(e.target.value)}
                      required
                      disabled={!stTeamId}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-50"
                    >
                      <option value="">{stTeamId ? "Select team member..." : "Select a team first"}</option>
                      {(stTeamMembers ?? []).map((m: any) => (
                        <option key={m._id} value={m._id}>
                          {m.name ?? m.email}{m.role === "admin" ? " (Admin)" : m.designation ? ` — ${m.designation}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  {briefMode === "single" ? "Deadline" : "Deadline (optional)"}
                </label>
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <DatePicker value={deadline} onChange={setDeadline} placeholder="Set deadline" />
                  </div>
                  {briefMode === "single" && (
                    <input
                      type="time"
                      value={stDeadlineTime}
                      onChange={(e) => setStDeadlineTime(e.target.value)}
                      className="w-28 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                      placeholder="HH:MM"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">Brand</label>
                <select
                  value={brandId}
                  onChange={(e) => { setBrandId(e.target.value); setManagerId(""); }}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">No brand</option>
                  {(brands ?? []).map((b: any) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                    {briefMode === "single" ? "Assignor / Manager" : "Assign Manager (optional)"}
                  </label>
                  <select
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">No manager</option>
                    {(managers ?? [])
                      .filter((m: any) => !brandId || !brandManagerIds || brandManagerIds.includes(m._id))
                      .map((m: any) => (
                        <option key={m._id} value={m._id}>{m.name ?? m.email}</option>
                      ))}
                  </select>
                  {brandId && brandManagerIds && brandManagerIds.length === 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">No managers assigned to this brand yet.</p>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                <input
                  type="checkbox"
                  checked={clientFacing}
                  onChange={(e) => setClientFacing(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent-admin)]"
                />
                <div>
                  <span className="font-medium text-[13px] text-[var(--text-primary)]">Client Review Required</span>
                  <p className="text-[11px] text-[var(--text-muted)]">Tasks will require client approval before marking complete</p>
                </div>
              </label>
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Creatives required
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={creativesRequired}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isNaN(v)) setCreativesRequired(1);
                    else setCreativesRequired(Math.min(99, Math.max(1, v)));
                  }}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Designer sees separate deliverable slots (e.g. 4 creatives = 4).
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary">Create</Button>
                <Button type="button" variant="secondary" onClick={closeCreateModal}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Brief Confirmation */}
      <ConfirmModal
        open={!!deletingBriefId}
        title="Delete Brief"
        message="Are you sure you want to permanently delete this brief? This will also delete all its tasks, deliverables, and logs. This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (!deletingBriefId) return;
          try {
            await deleteBrief({ briefId: deletingBriefId });
            toast("success", "Brief deleted");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Failed to delete brief");
          }
          setDeletingBriefId(null);
        }}
        onCancel={() => setDeletingBriefId(null)}
      />

    </div>
  );
}
