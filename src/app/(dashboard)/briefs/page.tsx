"use client";

import { useMutation, useQuery } from "convex/react";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useToast } from "@/components/ui";

// The date filters store YYYY-MM-DD (they always have; the filtering below
// parses that). DatePicker speaks timestamps. Convert at the boundary rather
// than migrating the filter format.
function ymdToTs(ymd: string): number | undefined {
  return ymd ? new Date(ymd + "T00:00:00").getTime() : undefined;
}
function tsToYmd(ts: number | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtYmd(ymd: string): string {
  const ts = ymdToTs(ymd);
  return ts
    ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
}

import { Trash2, Calendar, ChevronDown, ChevronRight, Plus, FolderOpen, Filter, List, FolderClosed, CheckCircle2, Briefcase, X, Eye, ExternalLink } from "lucide-react";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";

/** Designing / copywriting only. */
function showCreativesRequiredField(
  briefMode: "master" | "individual",
  briefType: string
): boolean {
  return briefType === "designing" || briefType === "copywriting";
}

type IndividualTaskTeam = {
  teamId: string;
  assigneeId: string;
  deadline?: number;
};

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
  const createIndividualTaskBrief = useMutation(api.briefs.createIndividualTaskBrief);
  const deleteBrief = useMutation(api.briefs.deleteBrief);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [briefMode, setBriefMode] = useState<"master" | "individual">("master");

  const [clientFacing, setClientFacing] = useState(false);
  const [creativesRequired, setCreativesRequired] = useState<number | string>(1);

  const allTeams = useQuery(api.teams.listTeams, {});

  // ─── Individual Task unified flow state ───
  // One or more team blocks; first one is the primary assignee. When 2+ blocks
  // are present, tasks are chained sequentially (Copy → Design) via
  // handoffTargetTeamId, and the "Add to content calendar" toggle is shown.
  const [itTeams, setItTeams] = useState<IndividualTaskTeam[]>([
    { teamId: "", assigneeId: "", deadline: undefined },
  ]);
  const [itOverallDeadline, setItOverallDeadline] = useState<number | undefined>(undefined);
  const [itAddToCalendar, setItAddToCalendar] = useState(false);
  const [itCalMonth, setItCalMonth] = useState("");
  const [itCalGoLiveDate, setItCalGoLiveDate] = useState("");

  const [deletingBriefId, setDeletingBriefId] = useState<Id<"briefs"> | null>(null);
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [viewMode, setViewMode] = useState<"folders" | "all">("folders");
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(() => new Set());
  const [expandedBriefs, setExpandedBriefs] = useState<Set<string>>(() => new Set());
  const [briefsTab, setBriefsTab] = useState<"active" | "completed" | "review">("active");
  const [filterBriefType, setFilterBriefType] = useState<string>("");
  const [filterDateStart, setFilterDateStart] = useState<string>("");
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");
  const [filterTeamId, setFilterTeamId] = useState<string>("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_BRIEFS_UI);
      if (!raw) return;
      const o = JSON.parse(raw) as {
        briefsTab?: string;
        filterManagerId?: string;
        viewMode?: string;
        expandedBrandIds?: string[];
        filterBriefType?: string;
        filterDateStart?: string;
        filterDateEnd?: string;
        filterTeamId?: string;
      };
      if (o.briefsTab === "active" || o.briefsTab === "completed" || o.briefsTab === "review") setBriefsTab(o.briefsTab);
      if (typeof o.filterManagerId === "string") setFilterManagerId(o.filterManagerId);
      if (o.viewMode === "folders" || o.viewMode === "all") setViewMode(o.viewMode);
      if (Array.isArray(o.expandedBrandIds)) setExpandedBrands(new Set(o.expandedBrandIds));
      if (typeof o.filterBriefType === "string") setFilterBriefType(o.filterBriefType);
      if (typeof o.filterDateStart === "string") setFilterDateStart(o.filterDateStart);
      if (typeof o.filterDateEnd === "string") setFilterDateEnd(o.filterDateEnd);
      if (typeof o.filterTeamId === "string") setFilterTeamId(o.filterTeamId);
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
          filterBriefType,
          filterDateStart,
          filterDateEnd,
          filterTeamId,
        })
      );
    } catch {
      /* ignore */
    }
  }, [briefsTab, filterManagerId, viewMode, expandedBrands, filterBriefType, filterDateStart, filterDateEnd, filterTeamId]);

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
          creativesRequired,
          itTeams,
          itOverallDeadline,
          itAddToCalendar,
          itCalMonth,
          itCalGoLiveDate,
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
    creativesRequired,
    itTeams,
    itOverallDeadline,
    itAddToCalendar,
    itCalMonth,
    itCalGoLiveDate,
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

  function toggleBriefExpand(id: string) {
    setExpandedBriefs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function buildFolders(briefsList: typeof briefs) {
    if (!briefsList || briefsList.length === 0) return [];
    // Newest brief first inside each brand folder — the latest work is what
    // people come here for, and it shouldn't be at the bottom of the scroll.
    const sorted = [...briefsList].sort(
      (a, b) => b._creationTime - a._creationTime
    );
    const grouped = new Map<string, typeof sorted>();

    for (const brief of sorted) {
      const key = (brief as any).brandId ?? "__no_brand__";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(brief);
    }

    // Completion measured across EVERY brief for the brand, not just the ones
    // this tab shows. The old counter read completed-briefs-inside-a-list-that-
    // excludes-completed-briefs, so it was pinned to 0 in Active and to 100% in
    // Completed — self-consistent, but it could never tell you anything.
    const allByBrand = new Map<string, { total: number; done: number }>();
    for (const brief of briefs ?? []) {
      const key = (brief as any).brandId ?? "__no_brand__";
      const acc = allByBrand.get(key) ?? { total: 0, done: 0 };
      acc.total++;
      if (brief.status === "completed") acc.done++;
      allByBrand.set(key, acc);
    }

    const folders: { brandId: string; brandName: string; brandColor: string; briefs: typeof sorted; totalAllTabs: number; doneAllTabs: number }[] = [];

    for (const [key, folderBriefs] of grouped) {
      if (key === "__no_brand__") continue;
      const brand = (brands ?? []).find((b: any) => b._id === key);
      folders.push({
        brandId: key,
        brandName: brand?.name ?? "Unknown Brand",
        brandColor: (brand as any)?.color ?? "#6b7280",
        briefs: folderBriefs,
        totalAllTabs: allByBrand.get(key)?.total ?? folderBriefs.length,
        doneAllTabs: allByBrand.get(key)?.done ?? 0,
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
        totalAllTabs: allByBrand.get("__no_brand__")?.total ?? noBrand.length,
        doneAllTabs: allByBrand.get("__no_brand__")?.done ?? 0,
      });
    }

    return folders;
  }

  // Apply type + date range + team filters first, then split by tab
  const filteredBriefs = useMemo(() => {
    let list = briefs ?? [];
    if (filterBriefType) {
      list = list.filter((b) => (b as any).briefType === filterBriefType);
    }
    if (filterTeamId) {
      list = list.filter((b) => (b as any).teamIds?.includes(filterTeamId));
    }
    if (filterDateStart) {
      const startTs = new Date(filterDateStart).getTime();
      list = list.filter((b) => b.deadline && b.deadline >= startTs);
    }
    if (filterDateEnd) {
      const endTs = new Date(filterDateEnd + "T23:59:59").getTime();
      list = list.filter((b) => b.deadline && b.deadline <= endTs);
    }
    return list;
  }, [briefs, filterBriefType, filterTeamId, filterDateStart, filterDateEnd]);

  // Overdue drives the ordering, so the page answers "where do I go now"
  // instead of listing brands alphabetically. Ties fall back to the name so
  // the order stays stable between renders.
  function folderCounts(list: { status: string; deadline?: number }[]) {
    let open = 0, overdue = 0, done = 0;
    const now = Date.now();
    for (const b of list) {
      if (b.status === "completed") { done++; continue; }
      if (b.status === "archived") continue;
      open++;
      if (b.deadline && b.deadline < now) overdue++;
    }
    return { open, overdue, done };
  }

  // ── Filter popover ────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Click-outside to dismiss. The popover is absolutely positioned inside the
  // filter row, which has no overflow clipping, so no portal is needed here.
  useEffect(() => {
    if (!filtersOpen) return;
    function onDown(e: MouseEvent) {
      if (!filterPopoverRef.current?.contains(e.target as Node)) setFiltersOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  function clearAllFilters() {
    setFilterManagerId("");
    setFilterBriefType(""); 
    setFilterTeamId("");
    setFilterDateStart("");
    setFilterDateEnd("");
  }

  const TYPE_LABELS: Record<string, string> = {
    developmental: "Developmental",
    designing: "Designing",
    video_editing: "Video Editing",
    copywriting: "Copywriting",
    content_calendar: "Content Calendar",
    single_task: "Single Task",
  };

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; value: string; clear: () => void }[] = [];
    if (filterManagerId) {
      const m = (managers ?? []).find((x: any) => x._id === filterManagerId);
      chips.push({ key: "manager", label: "Manager", value: m?.name ?? m?.email ?? "—", clear: () => setFilterManagerId("") });
    }
    if (filterBriefType) {
      chips.push({ key: "type", label: "Type", value: TYPE_LABELS[filterBriefType] ?? filterBriefType, clear: () => setFilterBriefType("") });
    }
    if (filterTeamId) {
      const t = (allTeams ?? []).find((x: any) => x._id === filterTeamId);
      chips.push({ key: "team", label: "Team", value: t?.name ?? "—", clear: () => setFilterTeamId("") });
    }
    if (filterDateStart) {
      chips.push({ key: "from", label: "Due from", value: fmtYmd(filterDateStart), clear: () => setFilterDateStart("") });
    }
    if (filterDateEnd) {
      chips.push({ key: "to", label: "Due to", value: fmtYmd(filterDateEnd), clear: () => setFilterDateEnd("") });
    }
    return chips;
  }, [filterManagerId, filterBriefType, filterTeamId, filterDateStart, filterDateEnd, managers, allTeams]);

  const activeFilterCount = activeFilterChips.length;

  const activeBriefs = useMemo(() => filteredBriefs.filter((b) => b.status !== "completed" && b.status !== "review"), [filteredBriefs]);
  const completedBriefs = useMemo(() => filteredBriefs.filter((b) => b.status === "completed"), [filteredBriefs]);
  const reviewBriefs = useMemo(() => filteredBriefs.filter((b) => b.status === "review"), [filteredBriefs]);
  const activeFolders = useMemo(() => buildFolders(activeBriefs), [activeBriefs, brands]);
  const completedFolders = useMemo(() => buildFolders(completedBriefs), [completedBriefs, brands]);
  const reviewFolders = useMemo(() => buildFolders(reviewBriefs), [reviewBriefs, brands]);
  const brandFolders = briefsTab === "active" ? activeFolders : briefsTab === "review" ? reviewFolders : completedFolders;
  const displayedBriefs = briefsTab === "active" ? activeBriefs : briefsTab === "review" ? reviewBriefs : completedBriefs;

  const sortedBrandFolders = useMemo(() => {
    return [...brandFolders].sort((a, b) => {
      const ao = folderCounts(a.briefs as any).overdue;
      const bo = folderCounts(b.briefs as any).overdue;
      if (ao !== bo) return bo - ao;
      // "No Brand" is a catch-all, not a client — keep it last.
      if (a.brandId === "__no_brand__") return 1;
      if (b.brandId === "__no_brand__") return -1;
      return a.brandName.localeCompare(b.brandName);
    });
  }, [brandFolders]);



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

  function resetFormToDefaults(forBrandId?: string) {
    setBrandId(forBrandId ?? "");
    setManagerId("");
    setTitle("");
    setDescription("");
    setDeadline(undefined);
    setBriefType("");
    setBriefMode("master");
    setClientFacing(false);
    setCreativesRequired(1);
    setItTeams([{ teamId: "", assigneeId: "", deadline: undefined }]);
    setItOverallDeadline(undefined);
    setItAddToCalendar(false);
    setItCalMonth("");
    setItCalGoLiveDate("");
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
        if (d.briefMode === "master" || d.briefMode === "individual") {
          setBriefMode(d.briefMode);
        } else {
          setBriefMode("master");
        }
        setClientFacing(d.clientFacing === true);
        const cr = d.creativesRequired;
        setCreativesRequired(
          typeof cr === "number" && cr >= 1 && cr <= 99 ? Math.floor(cr) : 1
        );
        // Individual task flow state
        if (Array.isArray(d.itTeams) && d.itTeams.length > 0) {
          const cleaned: IndividualTaskTeam[] = (d.itTeams as any[])
            .filter((t) => t && typeof t === "object")
            .map((t: any) => ({
              teamId: typeof t.teamId === "string" ? t.teamId : "",
              assigneeId: typeof t.assigneeId === "string" ? t.assigneeId : "",
              deadline: typeof t.deadline === "number" ? t.deadline : undefined,
            }));
          setItTeams(
            cleaned.length > 0
              ? cleaned
              : [{ teamId: "", assigneeId: "", deadline: undefined }]
          );
        } else {
          setItTeams([{ teamId: "", assigneeId: "", deadline: undefined }]);
        }
        setItOverallDeadline(
          typeof d.itOverallDeadline === "number" ? d.itOverallDeadline : undefined
        );
        setItAddToCalendar(d.itAddToCalendar === true);
        setItCalMonth(typeof d.itCalMonth === "string" ? d.itCalMonth : "");
        setItCalGoLiveDate(
          typeof d.itCalGoLiveDate === "string" ? d.itCalGoLiveDate : ""
        );
      } else {
        resetFormToDefaults(forBrandId);
      }
    } catch {
      resetFormToDefaults(forBrandId);
    }
    setShowModal(true);
  }

  function closeCreateModal() {
    persistBriefDraft();
    setShowModal(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const isIndividual = briefMode === "individual";
      type BriefType = "developmental" | "designing" | "video_editing" | "copywriting";

      const includeCreatives = showCreativesRequiredField(briefMode, briefType);
      const crNum =
        typeof creativesRequired === "number"
          ? creativesRequired
          : parseInt(String(creativesRequired), 10) || 1;
      const cr =
        includeCreatives && crNum >= 1 && crNum <= 99
          ? Math.floor(crNum)
          : undefined;

      if (isIndividual) {
        // Validate: at least one team + assignee
        const filledTeams = itTeams.filter((t) => t.teamId && t.assigneeId);
        if (filledTeams.length === 0) {
          toast("error", "Select a team and assignee");
          return;
        }
        const isMultiTeam = filledTeams.length > 1;
        const useCalendar = isMultiTeam && itAddToCalendar;

        if (useCalendar && !brandId) {
          toast("error", "Brand is required to add this task to a content calendar");
          return;
        }

        const overallDeadline = isMultiTeam ? itOverallDeadline : deadline;

        await createIndividualTaskBrief({
          title,
          description: description || undefined,
          ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
          ...(managerId ? { assignedManagerId: managerId as Id<"users"> } : {}),
          ...(overallDeadline !== undefined ? { overallDeadline } : {}),
          ...(clientFacing ? { clientFacing: true } : {}),
          ...(briefType
            ? { briefType: briefType as BriefType }
            : {}),
          ...(cr !== undefined ? { creativesRequired: cr } : {}),
          teams: filledTeams.map((t) => ({
            teamId: t.teamId as Id<"teams">,
            assigneeId: t.assigneeId as Id<"users">,
            ...(t.deadline !== undefined ? { deadline: t.deadline } : {}),
          })),
          ...(useCalendar
            ? {
                contentCalendar: {
                  ...(itCalMonth ? { month: itCalMonth } : {}),
                  ...(itCalGoLiveDate
                    ? { goLiveDate: itCalGoLiveDate }
                    : itCalMonth
                    ? { goLiveDate: `${itCalMonth}-01` }
                    : {}),
                },
              }
            : {}),
        });

        try { sessionStorage.removeItem(STORAGE_BRIEF_DRAFT); } catch { /* ignore */ }
        setShowModal(false);
        resetFormToDefaults();
        toast(
          "success",
          useCalendar
            ? "Calendar entry created"
            : isMultiTeam
            ? "Multi-team task brief created"
            : "Individual task brief created"
        );
        return;
      }

      // ─── Master Brief ───
      // Content calendar briefs do not carry a top-level deadline (the
      // backend strips it too — this just keeps the payload tidy).
      const includeDeadline =
        deadline !== undefined && briefType !== "content_calendar";
      await createBrief({
        title,
        description,
        ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
        ...(managerId ? { assignedManagerId: managerId as Id<"users"> } : {}),
        ...(includeDeadline ? { deadline } : {}),
        briefType: (briefType || undefined) as any,
        ...(cr !== undefined ? { creativesRequired: cr } : {}),
      });
      try { sessionStorage.removeItem(STORAGE_BRIEF_DRAFT); } catch { /* ignore */ }
      setShowModal(false);
      resetFormToDefaults();
      toast("success", "Brief created");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create brief");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Briefs"
        subtitle="Manage your briefs and priorities"
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => openCreateModalForBrand()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Brief
            </Button>
          )
        }
      />

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
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{activeBriefs.length}</span>
        </button>
        <button
          onClick={() => setBriefsTab("review")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            briefsTab === "review"
              ? "bg-white shadow-sm text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          Review
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{reviewBriefs.length}</span>
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
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{completedBriefs.length}</span>
        </button>
      </div>

      {/* Filter Bar — five always-on controls became one button. They're used
          occasionally; the rows below are used constantly, so the rows get the
          vertical space. Anything set shows as a removable chip so an active
          filter is never hidden behind a closed popover. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative" ref={filterPopoverRef}>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
              activeFilterCount > 0
                ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)] text-[var(--accent-admin-text)]"
                : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--accent-admin-strong)] text-white text-[11px] font-semibold tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filtersOpen && (
            <div className="animate-scaleIn absolute left-0 top-full mt-1.5 z-30 w-[280px] rounded-xl border border-[var(--border)] bg-white p-3 shadow-lg flex flex-col gap-3">
              <Select
                label="Manager"
                value={filterManagerId}
                onChange={(e) => setFilterManagerId(e.target.value)}
                options={[
                  { value: "", label: "All Managers" },
                  ...(managers ?? []).map((m: any) => ({
                    value: m._id,
                    label: m.name ?? m.email,
                  })),
                ]}
              />
              <Select
                label="Type"
                value={filterBriefType}
                onChange={(e) => setFilterBriefType(e.target.value)}
                options={[
                  { value: "", label: "All Types" },
                  { value: "developmental", label: "Developmental" },
                  { value: "designing", label: "Designing" },
                  { value: "video_editing", label: "Video Editing" },
                  { value: "copywriting", label: "Copywriting" },
                  { value: "content_calendar", label: "Content Calendar" },
                  { value: "single_task", label: "Single Task" },
                ]}
              />
              <Select
                label="Team"
                value={filterTeamId}
                onChange={(e) => setFilterTeamId(e.target.value)}
                options={[
                  { value: "", label: "All Teams" },
                  ...(allTeams ?? []).map((t: any) => ({ value: t._id, label: t.name })),
                ]}
              />
              {/* The app's own DatePicker, not <input type="date"> — this page
                  was the only place running a second date vocabulary. It speaks
                  timestamps, the filters store YYYY-MM-DD, so convert here and
                  leave the filtering logic below untouched. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-[13px] text-[var(--text-secondary)]">
                    Due from
                  </label>
                  <DatePicker
                    value={ymdToTs(filterDateStart)}
                    onChange={(ts) => setFilterDateStart(tsToYmd(ts))}
                    placeholder="Any"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-[13px] text-[var(--text-secondary)]">
                    Due to
                  </label>
                  <DatePicker
                    value={ymdToTs(filterDateEnd)}
                    onChange={(ts) => setFilterDateEnd(tsToYmd(ts))}
                    placeholder="Any"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active filters, always visible even with the popover shut. */}
        {activeFilterChips.map((chip) => (
          <button
            key={chip.key}
            onClick={chip.clear}
            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] bg-white text-[12px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors"
          >
            <span className="text-[var(--text-muted)]">{chip.label}:</span>
            <span className="font-medium text-[var(--text-primary)]">{chip.value}</span>
            <X className="h-3 w-3 text-[var(--text-muted)] group-hover:text-[var(--danger)]" />
          </button>
        ))}
        {activeFilterCount > 1 && (
          <button
            onClick={clearAllFilters}
            className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
          >
            Clear all
          </button>
        )}

        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] ml-auto">
          <button
            onClick={() => setViewMode("folders")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-all ${
              viewMode === "folders" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <FolderClosed className="h-3 w-3" />
            Folders
          </button>
          <button
            onClick={() => setViewMode("all")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-all ${
              viewMode === "all" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <List className="h-3 w-3" />
            Show All
          </button>
        </div>
        <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
          {displayedBriefs.length} brief{displayedBriefs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Brand Folders View — one bordered container of divided rows rather
          than a stack of Cards with 16px gutters. Each brand was taking ~108px
          of height to show a name and a stat, so five brands filled a 1080p
          screen; this fits three times as many and the page becomes scannable.
          Cards also can't nest cleanly around the table that expands below. */}
      {viewMode === "folders" && (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden divide-y divide-[var(--border-subtle)]">
          {sortedBrandFolders.map((folder) => {
            const isExpanded = expandedBrands.has(folder.brandId);
            const { open: openCount, overdue: overdueCount, done: doneCount } =
              folderCounts(folder.briefs);

            return (
              <div key={folder.brandId}>
                {/* Folder Header */}
                <div
                  className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors group"
                  onClick={() => toggleBrand(folder.brandId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  {/* Brand identity moves from a 4px left stripe to a dot —
                      same colour, same recognition, no accent bar. */}
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: folder.brandColor }}
                    aria-hidden
                  />
                  <span className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                    {folder.brandName}
                  </span>

                  <span className="text-[12px] text-[var(--text-muted)] tabular-nums shrink-0">
                    {folder.briefs.length}
                  </span>

                  {/* Progress across every brief for this brand, not just the
                      ones this tab shows — otherwise the ratio is pinned to 0
                      in Active and to 100% in Completed. */}
                  {folder.totalAllTabs > 0 && (
                    <div className="hidden sm:flex items-center gap-2 shrink-0 w-[120px]">
                      <div className="h-1 flex-1 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent-employee)] transition-[width] duration-300"
                          style={{ width: `${Math.round((folder.doneAllTabs / folder.totalAllTabs) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {folder.doneAllTabs}/{folder.totalAllTabs}
                      </span>
                    </div>
                  )}

                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {overdueCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-[var(--danger)] bg-[var(--danger-dim)] tabular-nums">
                        {overdueCount} overdue
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateModalForBrand(folder.brandId === "__no_brand__" ? undefined : folder.brandId);
                        }}
                        // Hidden until the row is hovered or focused: it's on
                        // every row, and 15 identical buttons compete with the
                        // brand names people are actually scanning for.
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--accent-admin-text)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--accent-admin-dim)] transition-all"
                      >
                        <Plus className="h-3 w-3" />
                        New Brief
                      </button>
                    )}
                  </div>
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
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex gap-1 flex-wrap">
                                  {Array.from(
                                    new Set(
                                      (brief as { teamNames?: string[] }).teamNames ?? []
                                    )
                                  ).map((name) => (
                                    <Badge key={name} variant="neutral">
                                      {name}
                                    </Badge>
                                  ))}
                                  {!((brief as { teamNames?: string[] }).teamNames?.length) && "-"}
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
                                ) : "-"}
                              </TableCell>
                              <TableCell>
                                {dl ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`} />
                                    <span className={`text-[12px] font-medium whitespace-nowrap ${overdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                                      {formatDate(dl)}
                                    </span>
                                    {daysLeft !== null && brief.status !== "completed" && brief.status !== "archived" && (
                                      <span className={`text-[11px] ${overdue ? "text-[var(--danger)]" : daysLeft <= 3 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
                                        {overdue ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d`}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[var(--text-disabled)] text-[12px]">-</span>
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
                                {(() => {
                                  const b = brief as { progress?: number; taskCount?: number; doneCount?: number };
                                  const total = b.taskCount ?? 0;
                                  const done = b.doneCount ?? 0;
                                  const pct = b.progress ?? 0;
                                  return (
                                    <div className="flex items-center gap-2 min-w-[120px]">
                                      <div className="w-20 h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                                        <div
                                          className="h-full rounded-full"
                                          style={{
                                            width: `${pct}%`,
                                            backgroundColor: "#10b981",
                                          }}
                                        />
                                      </div>
                                      <span className="text-[11px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                                        {done}/{total}
                                      </span>
                                    </div>
                                  );
                                })()}
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

      {/* Show All View */}
      {viewMode === "all" && (
        <div className="flex flex-col gap-5">
          {brandFolders.map((folder) => {
            let globalIndex = 0;
            return (
              <div key={folder.brandId}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  {/* Brand dot, matching the folders view — the 3px left stripe
                      that used to sit here is the same accent-bar tell. */}
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: folder.brandColor }}
                    aria-hidden
                  />
                  {folder.brandId !== "__no_brand__" ? (
                    <Link
                      href={`/brands/${folder.brandId}?returnTo=${encodeURIComponent("/briefs")}`}
                      className="group inline-flex items-center gap-1 font-semibold text-[15px] text-[var(--text-primary)] hover:text-[var(--accent-admin-text)] hover:underline transition-colors"
                      title={`Open ${folder.brandName}`}
                    >
                      {folder.brandName}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ) : (
                    <span className="font-semibold text-[15px] text-[var(--text-primary)]">
                      {folder.brandName}
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    ({folder.briefs.length} brief{folder.briefs.length !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableHead className="w-8"></TableHead>
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
                        const isExpanded = expandedBriefs.has(brief._id);
                        const bType = (brief as any).briefType;
                        // Only show expand-affordance for briefs that have interesting children
                        const expandable = bType !== "single_task";

                        return (
                          <React.Fragment key={brief._id}>
                          <TableRow
                            onClick={() => router.push(`/brief/${brief._id}`)}
                          >
                            <TableCell>
                              {expandable ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleBriefExpand(brief._id);
                                  }}
                                  className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                                  title={isExpanded ? "Collapse" : "Expand"}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : null}
                            </TableCell>
                            <TableCell>{globalIndex}</TableCell>
                            <TableCell className="font-semibold">{brief.title}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              {(brief as { managerName?: string }).managerName ? (
                                <Badge variant="manager">
                                  {(brief as { managerName?: string }).managerName}
                                </Badge>
                              ) : "-"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex gap-1 flex-wrap">
                                {Array.from(
                                  new Set(
                                    (brief as { teamNames?: string[] }).teamNames ?? []
                                  )
                                ).map((name) => (
                                  <Badge key={name} variant="neutral">{name}</Badge>
                                ))}
                                {!((brief as { teamNames?: string[] }).teamNames?.length) && "-"}
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
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              {dl ? (
                                <div className="flex items-center gap-1.5">
                                  <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`} />
                                  <span className={`text-[12px] font-medium whitespace-nowrap ${overdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                                    {formatDate(dl)}
                                  </span>
                                  {daysLeft !== null && brief.status !== "completed" && brief.status !== "archived" && (
                                    <span className={`text-[11px] ${overdue ? "text-[var(--danger)]" : daysLeft <= 3 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
                                      {overdue ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[var(--text-disabled)] text-[12px]">-</span>
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
                              {(() => {
                                const b = brief as { progress?: number; taskCount?: number; doneCount?: number };
                                const total = b.taskCount ?? 0;
                                const done = b.doneCount ?? 0;
                                const pct = b.progress ?? 0;
                                return (
                                  <div className="flex items-center gap-2 min-w-[120px]">
                                    <div className="w-20 h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${pct}%`, backgroundColor: "#10b981" }}
                                      />
                                    </div>
                                    <span className="text-[11px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                                      {done}/{total}
                                    </span>
                                  </div>
                                );
                              })()}
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
                          {isExpanded && (
                            <tr>
                              <td colSpan={isAdmin ? 10 : 9} className="p-0">
                                <BriefSubRowsPanel
                                  briefId={brief._id}
                                  briefType={bType}
                                />
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
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
              <h2 className="font-semibold text-[20px] text-[var(--text-primary)]">
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
                    onClick={() => setBriefMode("individual")}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      briefMode === "individual" ? "bg-white text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    Individual Task
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

              {briefMode === "individual" && (
                <IndividualTaskFields
                  allTeams={allTeams ?? []}
                  itTeams={itTeams}
                  setItTeams={setItTeams}
                  itOverallDeadline={itOverallDeadline}
                  setItOverallDeadline={setItOverallDeadline}
                  itAddToCalendar={itAddToCalendar}
                  setItAddToCalendar={setItAddToCalendar}
                  itCalMonth={itCalMonth}
                  setItCalMonth={setItCalMonth}
                  itCalGoLiveDate={itCalGoLiveDate}
                  setItCalGoLiveDate={setItCalGoLiveDate}
                  briefType={briefType}
                  setBriefType={setBriefType}
                  singleTaskDeadline={deadline}
                  setSingleTaskDeadline={setDeadline}
                />
              )}
              {/* Shared fields: deadline (master-only), brand, manager.
                  Content calendar briefs are evergreen (rolling month sheets)
                  and do not carry a top-level deadline. Every entry inside
                  has its own. */}
              {briefMode === "master" && briefType !== "content_calendar" && (
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                    Deadline (optional)
                  </label>
                  <DatePicker value={deadline} onChange={setDeadline} placeholder="Set deadline" />
                </div>
              )}
              {briefMode === "master" && briefType === "content_calendar" && (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-hover)] px-3 py-2">
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    Content Calendar briefs run month after month. Deadlines live on the individual entries inside, not on the brief itself.
                  </p>
                </div>
              )}
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Brand{briefMode === "individual" && itAddToCalendar ? " *" : ""}
                </label>
                <select
                  value={brandId}
                  onChange={(e) => { setBrandId(e.target.value); setManagerId(""); }}
                  required={briefMode === "individual" && itAddToCalendar}
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
                    {briefMode === "individual" ? "Assignor / Manager (optional)" : "Assign Manager (optional)"}
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
              {showCreativesRequiredField(briefMode, briefType) && (
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
                      const raw = e.target.value;
                      if (raw === "") { setCreativesRequired(""); return; }
                      const v = parseInt(raw, 10);
                      if (!Number.isNaN(v)) setCreativesRequired(Math.min(99, Math.max(1, v)));
                    }}
                    onBlur={() => {
                      if (creativesRequired === "" || Number.isNaN(Number(creativesRequired))) {
                        setCreativesRequired(1);
                      }
                    }}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  />
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Designer sees separate deliverable slots (e.g. 4 creatives = 4). Shown for Designing and Copywriting only.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create"}
                </Button>
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

// ─── Brief Sub-Rows Panel ────────────────────────────────
// Shown inline when the user expands a brief in "Show All" view.
// - For content_calendar briefs: lists each calendar entry (parent task,
//   i.e. `parentTaskId === undefined`) grouped & sorted by month (postDate).
// - For other briefs (master/developmental/etc.): lists the top-level tasks
//   (parentTaskId === undefined) with assignee, status, and deadline.
function BriefSubRowsPanel({
  briefId,
  briefType,
}: {
  briefId: Id<"briefs">;
  briefType: string | undefined;
}) {
  const router = useRouter();
  const data = useQuery(api.tasks.listTasksForBrief, { briefId });

  if (!data) {
    return (
      <div className="px-6 py-3 bg-[var(--bg-primary)] text-[11px] text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  const users = data.users;
  // Parent tasks only (calendar entries OR top-level tasks of a brief)
  const rootTasks = data.tasks.filter((t: any) => !t.parentTaskId);

  if (rootTasks.length === 0) {
    return (
      <div className="px-6 py-3 bg-[var(--bg-primary)] text-[11px] text-[var(--text-muted)]">
        No {briefType === "content_calendar" ? "entries" : "tasks"} yet.
      </div>
    );
  }

  // For content_calendar → group by YYYY-MM (from postDate), sorted ascending.
  // For other briefs → single bucket, sorted by deadline then title.
  type Bucket = { key: string; label: string; tasks: typeof rootTasks };
  const buckets: Bucket[] = [];

  if (briefType === "content_calendar") {
    const byMonth = new Map<string, typeof rootTasks>();
    for (const t of rootTasks) {
      const pd = (t as any).postDate as string | undefined;
      const ym = pd ? pd.slice(0, 7) : "__no_date__";
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym)!.push(t);
    }
    const keys = Array.from(byMonth.keys()).sort((a, b) => {
      if (a === "__no_date__") return 1;
      if (b === "__no_date__") return -1;
      return a.localeCompare(b);
    });
    for (const k of keys) {
      const tasksInMonth = byMonth.get(k)!.slice().sort((a: any, b: any) => {
        const pa = a.postDate ?? "";
        const pb = b.postDate ?? "";
        return pa.localeCompare(pb);
      });
      let label = "No date";
      if (k !== "__no_date__") {
        const [y, m] = k.split("-").map(Number);
        label = new Date(y, m - 1).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
      }
      buckets.push({ key: k, label, tasks: tasksInMonth });
    }
  } else {
    const sorted = rootTasks.slice().sort((a: any, b: any) => {
      const da = a.deadline ?? Number.MAX_SAFE_INTEGER;
      const db = b.deadline ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    buckets.push({ key: "__all__", label: "", tasks: sorted });
  }

  return (
    <div className="bg-[var(--bg-primary)] border-l-2 border-[var(--accent-admin)]">
      {buckets.map((bucket) => (
        <div key={bucket.key}>
          {bucket.label && (
            <div className="px-6 py-1.5 bg-[var(--bg-hover)] border-y border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                {bucket.label}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] ml-2 tabular-nums">
                ({bucket.tasks.length})
              </span>
            </div>
          )}
          <div className="divide-y divide-[var(--border-subtle)]">
            {bucket.tasks.map((t: any) => {
              const assignee = users.find((u: any) => u._id === t.assigneeId);
              const assigneeName = assignee?.name ?? assignee?.email ?? "Unassigned";
              const dl = t.deadline;
              const taskOverdue =
                dl && t.status !== "done" && dl < Date.now();
              const statusColor =
                t.status === "done"
                  ? "#10b981"
                  : t.status === "review"
                    ? "#8b5cf6"
                    : t.status === "in-progress"
                      ? "#f59e0b"
                      : t.status === "on-hold"
                        ? "#ef4444"
                        : "#6b7280";
              return (
                <div
                  key={t._id}
                  onClick={() => router.push(`/brief/${briefId}`)}
                  className="flex items-center gap-3 px-6 py-2 hover:bg-[var(--bg-hover)] cursor-pointer text-[12px]"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: statusColor }}
                  />
                  <span className="flex-1 font-medium text-[var(--text-primary)] truncate">
                    {t.title}
                  </span>
                  {briefType === "content_calendar" && t.postDate && (
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {new Date(t.postDate + "T00:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" }
                      )}
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[160px]">
                    {assigneeName}
                  </span>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
                    style={{
                      color: statusColor,
                      backgroundColor: `${statusColor}15`,
                    }}
                  >
                    {t.status === "done"
                      ? briefType === "content_calendar"
                        ? "Completed"
                        : "Done"
                      : t.status === "in-progress"
                        ? "In Progress"
                        : t.status === "on-hold"
                          ? "On Hold"
                          : t.status === "review"
                            ? "Review"
                            : briefType === "content_calendar"
                              ? "Planned"
                              : "Pending"}
                  </span>
                  <span
                    className={`text-[11px] tabular-nums w-[80px] text-right ${
                      taskOverdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {dl
                      ? new Date(dl).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "-"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Individual Task Fields (unified flow) ────────────────
// Renders the new Individual Task brief creation UI:
//   - Optional brief-type dropdown
//   - Repeatable team blocks (team + member + per-team deadline)
//   - "+ Add another team" / "Remove" controls
//   - For single-team: one top-level "Task deadline"
//   - For multi-team: "Combined/Overall deadline" + "Add to content calendar"
//                     toggle, revealing month/go-live date fields
function IndividualTaskFields({
  allTeams,
  itTeams,
  setItTeams,
  itOverallDeadline,
  setItOverallDeadline,
  itAddToCalendar,
  setItAddToCalendar,
  itCalMonth,
  setItCalMonth,
  itCalGoLiveDate,
  setItCalGoLiveDate,
  briefType,
  setBriefType,
  singleTaskDeadline,
  setSingleTaskDeadline,
}: {
  allTeams: Array<{ _id: string; name: string; color?: string }>;
  itTeams: IndividualTaskTeam[];
  setItTeams: React.Dispatch<React.SetStateAction<IndividualTaskTeam[]>>;
  itOverallDeadline: number | undefined;
  setItOverallDeadline: React.Dispatch<React.SetStateAction<number | undefined>>;
  itAddToCalendar: boolean;
  setItAddToCalendar: React.Dispatch<React.SetStateAction<boolean>>;
  itCalMonth: string;
  setItCalMonth: React.Dispatch<React.SetStateAction<string>>;
  itCalGoLiveDate: string;
  setItCalGoLiveDate: React.Dispatch<React.SetStateAction<string>>;
  briefType: string;
  setBriefType: React.Dispatch<React.SetStateAction<string>>;
  singleTaskDeadline: number | undefined;
  setSingleTaskDeadline: React.Dispatch<React.SetStateAction<number | undefined>>;
}) {
  const isMultiTeam = itTeams.length > 1;

  const updateTeamBlock = (index: number, patch: Partial<IndividualTaskTeam>) => {
    setItTeams((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addTeamBlock = () => {
    setItTeams((prev) => [
      ...prev,
      { teamId: "", assigneeId: "", deadline: undefined },
    ]);
  };

  const removeTeamBlock = (index: number) => {
    setItTeams((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0
        ? [{ teamId: "", assigneeId: "", deadline: undefined }]
        : next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Brief Type (optional) */}
      <div>
        <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
          Task Type (optional)
        </label>
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

      {/* Team Blocks */}
      <div className="flex flex-col gap-3">
        <label className="font-medium text-[13px] text-[var(--text-secondary)] block">
          Team Assignment{isMultiTeam ? "s" : ""}
          {isMultiTeam && (
            <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
              (Sequential handoff: first team → next team)
            </span>
          )}
        </label>

        {itTeams.map((block, idx) => (
          <TeamBlockRow
            key={idx}
            index={idx}
            block={block}
            allTeams={allTeams}
            isMultiTeam={isMultiTeam}
            onChange={(patch) => updateTeamBlock(idx, patch)}
            onRemove={itTeams.length > 1 ? () => removeTeamBlock(idx) : undefined}
          />
        ))}

        <button
          type="button"
          onClick={addTeamBlock}
          className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--accent-admin-text)] bg-[var(--accent-admin-dim)] hover:bg-[var(--accent-admin-strong)] hover:text-white transition-all"
        >
          <Plus className="h-3 w-3" />
          Add another team
        </button>
      </div>

      {/* Single-team deadline */}
      {!isMultiTeam && (
        <div>
          <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
            Task Deadline (optional)
          </label>
          <DatePicker
            value={singleTaskDeadline}
            onChange={setSingleTaskDeadline}
            placeholder="Set task deadline"
          />
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            If you set a per-team deadline above, it takes priority over this.
          </p>
        </div>
      )}

      {/* Multi-team controls */}
      {isMultiTeam && (
        <>
          <div>
            <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
              Combined / Overall Deadline (optional)
            </label>
            <DatePicker
              value={itOverallDeadline}
              onChange={setItOverallDeadline}
              placeholder="Overall deadline for the full task"
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Used as fallback for any team block without its own deadline.
            </p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
            <input
              type="checkbox"
              checked={itAddToCalendar}
              onChange={(e) => setItAddToCalendar(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent-admin)]"
            />
            <div>
              <span className="font-medium text-[13px] text-[var(--text-primary)]">
                Add to content calendar
              </span>
              <p className="text-[11px] text-[var(--text-muted)]">
                Adds this task as a calendar entry under the brand&apos;s Content Calendar brief.
              </p>
            </div>
          </label>

          {itAddToCalendar && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]">
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1.5">
                  Month
                </label>
                <input
                  type="month"
                  value={itCalMonth}
                  onChange={(e) => setItCalMonth(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1.5">
                  Go-Live Date
                </label>
                <input
                  type="date"
                  value={itCalGoLiveDate}
                  onChange={(e) => setItCalGoLiveDate(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Team Block Row ──────────────────────────────────────
// Renders a single team/member/deadline row. Owns its own useQuery hook
// for the member list (hooks cannot be called in a loop in the parent).
function TeamBlockRow({
  index,
  block,
  allTeams,
  isMultiTeam,
  onChange,
  onRemove,
}: {
  index: number;
  block: IndividualTaskTeam;
  allTeams: Array<{ _id: string; name: string; color?: string }>;
  isMultiTeam: boolean;
  onChange: (patch: Partial<IndividualTaskTeam>) => void;
  onRemove?: () => void;
}) {
  const members = useQuery(
    api.teams.getTeamMembers,
    block.teamId ? { teamId: block.teamId as Id<"teams"> } : "skip"
  );

  return (
    <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
          {isMultiTeam ? `Step ${index + 1}` : "Team"}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
            title="Remove team block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div>
        <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1.5">
          Team
        </label>
        <select
          value={block.teamId}
          onChange={(e) => {
            // Clear assignee when team changes
            onChange({ teamId: e.target.value, assigneeId: "" });
          }}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
        >
          <option value="">Select team</option>
          {allTeams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1.5">
          Assignee
        </label>
        <select
          value={block.assigneeId}
          onChange={(e) => onChange({ assigneeId: e.target.value })}
          disabled={!block.teamId}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="">
            {!block.teamId
              ? "Pick a team first"
              : members === undefined
                ? "Loading members…"
                : (members ?? []).length === 0
                  ? "No members in this team"
                  : "Select member"}
          </option>
          {(members ?? []).map((m: any) => (
            <option key={m._id} value={m._id}>
              {m.name ?? m.email}{m.isFreelancer ? " (Freelancer)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1.5">
          Deadline {isMultiTeam && <span className="text-[var(--text-muted)] font-normal">(for this step)</span>}
        </label>
        <DatePicker
          value={block.deadline}
          onChange={(v) => onChange({ deadline: v })}
          placeholder={isMultiTeam ? "Per-step deadline (optional)" : "Task deadline (optional)"}
        />
      </div>
    </div>
  );
}
