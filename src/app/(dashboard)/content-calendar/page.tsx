"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, useToast } from "@/components/ui";
import { ContentCalendarEntrySidebar } from "@/components/ContentCalendarView";
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Link2,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Inbox,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Check,
  Copy,
  CalendarRange,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

const PLATFORMS = [
  "Instagram",
  "Facebook",
  "Twitter/X",
  "LinkedIn",
  "YouTube",
  "TikTok",
  "Pinterest",
  "Other",
];
const CONTENT_TYPES = [
  "Post",
  "Reel",
  "Story",
  "Carousel",
  "Video",
  "Blog",
  "Newsletter",
  "Other",
];

const STATUS_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  pending: { bg: "#f3f4f6", dot: "#6b7280", label: "Planned" },
  "in-progress": { bg: "#fef3c7", dot: "#f59e0b", label: "In Progress" },
  review: { bg: "#ede9fe", dot: "#8b5cf6", label: "Review" },
  done: { bg: "#d1fae5", dot: "#10b981", label: "Completed" },
};

const BRAND_COLORS = [
  "#D5573B", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#EF4444", "#14B8A6", "#6366F1",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ContentCalendarPage() {
  const searchParams = useSearchParams();
  const now = new Date();
  // Optional ?month=YYYY-MM deep-link (used when jumping in from a task).
  const monthParam = searchParams.get("month");
  const parsedMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? {
          year: parseInt(monthParam.slice(0, 4), 10),
          month: parseInt(monthParam.slice(5, 7), 10) - 1,
        }
      : null;
  const [year, setYear] = useState(parsedMonth?.year ?? now.getFullYear());
  const [month, setMonth] = useState(parsedMonth?.month ?? now.getMonth());
  const [selectedBrandId, setSelectedBrandId] = useState<string>(searchParams.get("brand") ?? "");
  const [showCreateBrand, setShowCreateBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandColor, setNewBrandColor] = useState(BRAND_COLORS[0]);

  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState(PLATFORMS[0]);
  const [newContentType, setNewContentType] = useState(CONTENT_TYPES[0]);
  const [newAssignee, setNewAssignee] = useState("");
  const [newAssignor, setNewAssignor] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [popoverDate, setPopoverDate] = useState<string | null>(null);
  const [showBreakDayPicker, setShowBreakDayPicker] = useState(false);

  // Staging shelf (sheets-like "set this section aside" area). Server-backed:
  // staged tasks keep their postDate but carry stagedAt/stagedBy, are hidden
  // from the grid server-side, and are visible to every admin on any device.
  const [shelfCollapsed, setShelfCollapsed] = useState(false);
  const [trayContextMenu, setTrayContextMenu] = useState<{
    taskId: string;
    x: number;
    y: number;
  } | null>(null);

  // Multi-select (bulk move / shelf / month) state.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastToggledId, setLastToggledId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<null | "shift" | "month">(null);
  const [shiftDays, setShiftDays] = useState("7");
  const [shiftStartDate, setShiftStartDate] = useState("");
  const [targetMonth, setTargetMonth] = useState("");

  // Duplicate-to-date modal.
  const [duplicateTaskId, setDuplicateTaskId] = useState<string | null>(null);
  const [duplicateDate, setDuplicateDate] = useState("");

  useEffect(() => {
    if (!trayContextMenu) return;
    const close = () => setTrayContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [trayContextMenu]);

  const { toast } = useToast();

  const user = useQuery(api.users.getCurrentUser);
  const allBrands = useQuery(api.brands.listBrands);
  // For employees, the set of brand IDs whose calendar they're allowed to
  // see (sticky — based on any past task in that brand's calendar brief).
  // Admins get null here and see every brand.
  const accessibleBrandIds = useQuery(
    api.contentCalendar.getMyAccessibleCalendarBrandIds
  );
  const brands = useMemo(() => {
    if (!allBrands) return allBrands;
    if (user?.role === "admin") return allBrands;
    if (!accessibleBrandIds) return undefined; // still loading scope
    const allowed = new Set(accessibleBrandIds);
    return allBrands.filter((b: any) => allowed.has(b._id));
  }, [allBrands, accessibleBrandIds, user?.role]);
  const allUsers = useQuery(api.users.listAllUsers);
  const allTeams = useQuery(api.teams.listTeams, {});
  const createBrand = useMutation(api.brands.createBrand);
  const createEntry = useMutation(api.contentCalendar.createEntryForBrand);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const toggleBreakDayMut = useMutation(api.contentCalendar.toggleBreakDay);
  const stageEntriesMut = useMutation(api.contentCalendar.stageEntries);
  const unstageEntryMut = useMutation(api.contentCalendar.unstageEntry);
  const bulkShiftMut = useMutation(api.contentCalendar.bulkShiftDates);
  const bulkMoveMonthMut = useMutation(api.contentCalendar.bulkMoveToMonth);
  const duplicateEntryMut = useMutation(api.contentCalendar.duplicateEntry);

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const tasks = useQuery(
    api.contentCalendar.listTasksByBrandMonth,
    selectedBrandId
      ? { brandId: selectedBrandId as Id<"brands">, month: monthStr }
      : "skip"
  );

  const calendarBriefId = useQuery(
    api.contentCalendar.getCalendarBriefForBrand,
    selectedBrandId ? { brandId: selectedBrandId as Id<"brands"> } : "skip"
  );
  const breakDaysForMonth = useQuery(
    api.contentCalendar.listBreakDays,
    calendarBriefId && monthStr
      ? { briefId: calendarBriefId, month: monthStr }
      : "skip"
  );
  const breakDaySet = useMemo(
    () => new Set(breakDaysForMonth ?? []),
    [breakDaysForMonth]
  );

  const brandManagers = useQuery(
    api.brands.getManagersForBrand,
    selectedBrandId ? { brandId: selectedBrandId as Id<"brands"> } : "skip"
  );

  const employees = useMemo(
    () => (allUsers ?? []).filter((u: any) => u.role === "employee"),
    [allUsers]
  );

  const admins = useMemo(
    () => (allUsers ?? []).filter((u: any) => u.role === "admin"),
    [allUsers]
  );

  const defaultAssignor = useMemo(() => {
    if (!brandManagers?.length || !admins.length) return "";
    const mgr = admins.find((u: any) => brandManagers.includes(u._id));
    return mgr?._id ?? "";
  }, [brandManagers, admins]);

  const isEditable = user?.role === "admin";
  const hasNoAccess =
    user?.role === "employee" &&
    accessibleBrandIds !== undefined &&
    accessibleBrandIds.length === 0;

  // If an employee deep-linked to a brand they no longer have access to,
  // drop the selection so they don't see an empty/permission-denied view.
  useEffect(() => {
    if (user?.role !== "employee") return;
    if (!selectedBrandId) return;
    if (!accessibleBrandIds) return;
    if (!accessibleBrandIds.includes(selectedBrandId)) {
      setSelectedBrandId("");
    }
  }, [user?.role, selectedBrandId, accessibleBrandIds]);

  const selectedBrand = useMemo(
    () => (brands ?? []).find((b: any) => b._id === selectedBrandId),
    [brands, selectedBrandId]
  );

  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of tasks ?? []) {
      if (t.postDate) {
        if (!map[t.postDate]) map[t.postDate] = [];
        map[t.postDate].push(t);
      }
    }
    return map;
  }, [tasks]);

  // Server-backed staging shelf, shared across all admins and devices.
  const shelfTasks =
    useQuery(
      api.contentCalendar.listStagedEntries,
      selectedBrandId ? { brandId: selectedBrandId as Id<"brands"> } : "skip"
    ) ?? [];

  // The old localStorage tray is gone; parked items were never date-cleared,
  // so they simply reappear on their original days. Drop stale keys once.
  useEffect(() => {
    if (typeof window === "undefined" || !selectedBrandId) return;
    try {
      localStorage.removeItem(`cc:tray:${selectedBrandId}`);
    } catch {
      /* ignore */
    }
  }, [selectedBrandId]);

  // Reset selection when the brand or month changes.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkAction(null);
  }, [selectedBrandId, monthStr]);

  const handleAddToShelf = useCallback(
    async (taskId: string) => {
      setTrayContextMenu(null);
      setShelfCollapsed(false);
      try {
        await stageEntriesMut({ taskIds: [taskId as Id<"tasks">] });
        toast("info", "Moved to staging shelf");
      } catch (err: any) {
        toast("error", err.message ?? "Failed to move to shelf");
      }
    },
    [stageEntriesMut, toast]
  );

  const handleRemoveFromShelf = useCallback(
    async (taskId: string) => {
      try {
        await unstageEntryMut({ taskId: taskId as Id<"tasks"> });
      } catch (err: any) {
        toast("error", err.message ?? "Failed to restore entry");
      }
    },
    [unstageEntryMut, toast]
  );

  // Ordered ids of the visible month grid (for shift-click range select).
  const orderedVisibleIds = useMemo(() => {
    const dates = Object.keys(tasksByDate).sort();
    const ids: string[] = [];
    for (const d of dates) for (const t of tasksByDate[d]) ids.push(t._id);
    return ids;
  }, [tasksByDate]);

  const toggleSelected = useCallback(
    (taskId: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastToggledId) {
          const a = orderedVisibleIds.indexOf(lastToggledId);
          const b = orderedVisibleIds.indexOf(taskId);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(orderedVisibleIds[i]);
            return next;
          }
        }
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        return next;
      });
      setLastToggledId(taskId);
    },
    [lastToggledId, orderedVisibleIds]
  );

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }

  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault();
    try {
      const id = await createBrand({ name: newBrandName, color: newBrandColor });
      setSelectedBrandId(id);
      setShowCreateBrand(false);
      setNewBrandName("");
      toast("success", "Brand created");
    } catch (err: any) {
      toast("error", err.message ?? "Failed to create brand");
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBrandId || !addingDate) return;
    const assignor = newAssignor || defaultAssignor || undefined;
    try {
      await createEntry({
        brandId: selectedBrandId as Id<"brands">,
        title: newTitle,
        description: newDescription || undefined,
        ...(newAssignee ? { assigneeId: newAssignee as Id<"users"> } : {}),
        ...(assignor ? { assignedBy: assignor as Id<"users"> } : {}),
        platform: newPlatform,
        contentType: newContentType,
        postDate: addingDate,
        ...(newDeadline ? { deadline: new Date(newDeadline + "T23:59:59").getTime() } : {}),
      });
      setNewTitle("");
      setNewDescription("");
      setNewAssignee("");
      setNewAssignor("");
      setNewDeadline("");
      setAddingDate(null);
      toast("success", "Entry added");
    } catch (err: any) {
      toast("error", err.message ?? "Failed to add entry");
    }
  }

  const [activeTask, setActiveTask] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = (event.active.data.current as any)?.task;
    if (task) setActiveTask(task);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;
      const task = (active.data.current as any)?.task;
      if (!task) return;
      const fromShelf = String(active.id).startsWith("shelf-");
      const overId = over.id as string;

      // Drop onto the staging shelf → park it (postDate untouched).
      if (overId === "staging-shelf") {
        if (fromShelf) return;
        try {
          await stageEntriesMut({ taskIds: [task._id as Id<"tasks">] });
          toast("info", "Moved to staging shelf");
        } catch (err: any) {
          toast("error", err.message ?? "Failed to move to shelf");
        }
        return;
      }

      // Drop onto a day cell.
      const targetDate = overId;
      if (fromShelf) {
        try {
          await unstageEntryMut({
            taskId: task._id as Id<"tasks">,
            postDate: targetDate,
          });
          toast("success", "Entry placed");
        } catch (err: any) {
          toast("error", err.message ?? "Failed to place entry");
        }
        return;
      }
      if (targetDate === task.postDate) return;
      try {
        await updateTask({ taskId: task._id as Id<"tasks">, postDate: targetDate });
        toast("success", "Entry moved");
      } catch (err: any) {
        toast("error", err.message ?? "Failed to move entry");
      }
    },
    [updateTask, stageEntriesMut, unstageEntryMut, toast]
  );

  async function handleBulkToShelf() {
    if (selectedIds.size === 0) return;
    try {
      await stageEntriesMut({
        taskIds: [...selectedIds] as Id<"tasks">[],
      });
      toast("success", `${selectedIds.size} moved to shelf`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast("error", err.message ?? "Failed to move to shelf");
    }
  }

  async function handleBulkShift() {
    if (selectedIds.size === 0) return;
    const delta = shiftStartDate ? undefined : parseInt(shiftDays, 10);
    if (!shiftStartDate && (delta === undefined || Number.isNaN(delta) || delta === 0)) {
      toast("error", "Enter days to shift, or pick a new start date");
      return;
    }
    try {
      await bulkShiftMut({
        taskIds: [...selectedIds] as Id<"tasks">[],
        ...(shiftStartDate ? { newStartDate: shiftStartDate } : { deltaDays: delta }),
      });
      toast("success", `${selectedIds.size} rescheduled`);
      setSelectedIds(new Set());
      setBulkAction(null);
      setShiftStartDate("");
    } catch (err: any) {
      toast("error", err.message ?? "Failed to reschedule");
    }
  }

  async function handleBulkMonth() {
    if (selectedIds.size === 0 || !targetMonth) return;
    try {
      await bulkMoveMonthMut({
        taskIds: [...selectedIds] as Id<"tasks">[],
        month: targetMonth,
      });
      toast("success", `${selectedIds.size} moved to ${targetMonth}`);
      setSelectedIds(new Set());
      setBulkAction(null);
    } catch (err: any) {
      toast("error", err.message ?? "Failed to move");
    }
  }

  async function handleDuplicate() {
    if (!duplicateTaskId || !duplicateDate) return;
    try {
      await duplicateEntryMut({
        taskId: duplicateTaskId as Id<"tasks">,
        postDate: duplicateDate,
      });
      toast("success", "Entry duplicated");
      setDuplicateTaskId(null);
      setDuplicateDate("");
    } catch (err: any) {
      toast("error", err.message ?? "Failed to duplicate");
    }
  }

  // Next 12 months for the "move to month" picker.
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const base = new Date(year, month, 1);
    for (let i = -1; i <= 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, [year, month]);

  const selectedFromLocal = selectedTaskId && tasks
    ? tasks.find((t: any) => t._id === selectedTaskId)
    : null;

  // Linked Copy tasks are filtered out of the calendar grid (only parent
  // entries appear). When the sidebar requests one we fall back to a server
  // fetch so users can open and edit the child.
  const externalTaskDetail = useQuery(
    api.tasks.getTaskDetail,
    selectedTaskId && !selectedFromLocal
      ? { taskId: selectedTaskId as Id<"tasks"> }
      : "skip"
  );

  const selectedTask =
    selectedFromLocal ??
    (externalTaskDetail?.task
      ? {
          ...externalTaskDetail.task,
          assigneeName:
            externalTaskDetail.assignee?.name ??
            externalTaskDetail.assignee?.email ??
            "Unknown",
          assigneeDesignation:
            externalTaskDetail.assignee?.designation ?? "",
          assignorName:
            externalTaskDetail.assignedBy?.name ??
            externalTaskDetail.assignedBy?.email ??
            "-",
        }
      : null);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-white shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-5 w-5 text-[var(--accent-admin)]" />
            <h1 className="font-semibold text-[18px] text-[var(--text-primary)]">
              Content Calendar
            </h1>
          </div>

          {/* Brand Selector */}
          <div className="flex items-center gap-2 ml-4">
            {selectedBrand && (
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center overflow-hidden shrink-0"
                style={{ backgroundColor: selectedBrand.color ?? "#D5573B" }}
              >
                {selectedBrand.logoUrl ? (
                  <img src={selectedBrand.logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[10px] font-bold">
                    {selectedBrand.name?.charAt(0)?.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <select
              value={selectedBrandId}
              onChange={(e) => {
                if (e.target.value === "__create__") {
                  setShowCreateBrand(true);
                } else {
                  setSelectedBrandId(e.target.value);
                  setSelectedTaskId(null);
                }
              }}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[180px]"
            >
              <option value="">Select brand</option>
              {(brands ?? []).map((b: any) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
              {isEditable && <option value="__create__">+ Create new brand</option>}
            </select>
          </div>
          {isEditable && calendarBriefId && (
            <button
              type="button"
              onClick={() => setShowBreakDayPicker((v) => !v)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                showBreakDayPicker
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {showBreakDayPicker ? "Done" : "Break days"}
            </button>
          )}
          {isEditable && selectedBrandId && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds(new Set());
                setBulkAction(null);
              }}
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                selectMode
                  ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)] text-[var(--accent-admin)]"
                  : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectMode ? "Done selecting" : "Select"}
            </button>
          )}
        </div>

        {/* Month Nav */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const n = new Date();
              setYear(n.getFullYear());
              setMonth(n.getMonth());
            }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-[14px] text-[var(--text-primary)] min-w-[140px] text-center">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Status legend */}
          <div className="hidden lg:flex items-center gap-3 pl-3 border-l border-[var(--border)]">
            {Object.entries(STATUS_COLORS).map(([key, sc]) => (
              <span key={key} className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sc.dot }} />
                {sc.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {hasNoAccess ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <Calendar className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-[15px] text-[var(--text-secondary)] font-medium">
              No content calendars to show yet
            </p>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              You'll see a brand's content calendar here as soon as you're
              assigned a task in it. Access stays open after that.
            </p>
          </div>
        </div>
      ) : !selectedBrandId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Calendar className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-[15px] text-[var(--text-secondary)] font-medium">Select a brand to view its content calendar</p>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">Choose a brand from the dropdown above</p>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        <div className="flex-1 flex overflow-hidden">
          {/* Calendar Grid */}
          <div className={`flex-1 overflow-auto p-4 ${selectedTask ? "border-r border-[var(--border)]" : ""}`}>
            {(() => {
              const incomplete = (tasks ?? []).filter((t: any) => !t.assigneeId || !t.deadline);
              const noAssignee = incomplete.filter((t: any) => !t.assigneeId).length;
              const noDeadline = incomplete.filter((t: any) => !t.deadline).length;
              if (incomplete.length === 0) return null;
              return (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-[12px] font-semibold text-amber-800">
                    {incomplete.length} task{incomplete.length !== 1 ? "s" : ""} need attention
                  </span>
                  <span className="text-[11px] text-amber-700">
                    {noAssignee > 0 && `${noAssignee} unassigned`}
                    {noAssignee > 0 && noDeadline > 0 && " · "}
                    {noDeadline > 0 && `${noDeadline} no deadline`}
                  </span>
                  <span className="text-[10px] text-amber-600 ml-auto">Click a task to assign</span>
                </div>
              );
            })()}
            {!calendarBriefId && (
              <p className="mb-3 text-[11px] text-[var(--text-muted)] px-1">
                Add at least one calendar entry for this brand to load break days (same data as the brief Content Calendar).
              </p>
            )}
            {showBreakDayPicker && calendarBriefId && (
              <div className="mb-3 px-3 py-3 rounded-lg border border-amber-200 bg-amber-50 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-amber-900">
                      Break days - {MONTHS[month]} {year}
                    </p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Tap dates below to mark or clear breaks (same as the brand&apos;s Content Calendar brief). Red cells in the grid are full-day breaks.
                    </p>
                  </div>
                </div>
                {(() => {
                  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                  const cells: (number | null)[] = [];
                  for (let i = 0; i < firstDay; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                  while (cells.length % 7 !== 0) cells.push(null);
                  return (
                    <div className="grid grid-cols-7 gap-1 max-w-[420px]">
                      {weekdays.map((wd) => (
                        <div key={wd} className="text-center text-[10px] font-semibold text-amber-900/70 py-0.5">
                          {wd}
                        </div>
                      ))}
                      {cells.map((day, i) => {
                        if (day === null) return <div key={`empty-${i}`} />;
                        const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
                        const isBreak = breakDaySet.has(dateStr);
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() =>
                              toggleBreakDayMut({
                                briefId: calendarBriefId,
                                date: dateStr,
                              })
                                .then((r) =>
                                  toast(
                                    "success",
                                    r.added ? `Marked ${dateStr} as break` : `Removed break from ${dateStr}`
                                  )
                                )
                                .catch(() => toast("error", "Failed to toggle break day"))
                            }
                            className={`rounded-md text-[12px] font-medium py-1.5 transition-colors ${
                              isBreak
                                ? "bg-red-500 text-white hover:bg-red-600"
                                : "bg-white text-[var(--text-primary)] hover:bg-amber-100 border border-amber-200"
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Staging shelf — the "set aside" section of the sheet. */}
            {(isEditable || shelfTasks.length > 0) && (
              <StagingShelf
                tasks={shelfTasks}
                collapsed={shelfCollapsed}
                onToggle={() => setShelfCollapsed((v) => !v)}
                onRestore={handleRemoveFromShelf}
                onSelectTask={(id) => setSelectedTaskId(id)}
                isDragEnabled={!!isEditable && !selectMode}
              />
            )}

            {/* Weekday Headers — sticky relative to the scrolling parent.
                Opaque bg + bottom border + shadow so cells scrolling under
                the row are clipped cleanly instead of bleeding through. */}
            <div className="grid grid-cols-7 gap-px mb-px sticky top-0 z-20 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] shadow-[0_2px_4px_-2px_rgba(0,0,0,0.06)]">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center py-2 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide bg-[var(--bg-primary)]">
                  {d}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7 gap-px bg-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)]">
              {/* Empty cells for days before the 1st */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-[var(--bg-primary)] min-h-[120px] p-2 opacity-40" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
                const dayTasks = tasksByDate[dateStr] ?? [];
                const isToday = dateStr === todayStr;
                const isWeekend = new Date(year, month, day).getDay() === 0 || new Date(year, month, day).getDay() === 6;

                return (
                  <DroppableDayCell
                    key={day}
                    dateStr={dateStr}
                    isToday={isToday}
                    isWeekend={isWeekend}
                    isBreakDay={breakDaySet.has(dateStr)}
                    day={day}
                    isEditable={!!isEditable}
                    onAddClick={() => {
                      setAddingDate(dateStr);
                      setNewPlatform(PLATFORMS[0]);
                      setNewContentType(CONTENT_TYPES[0]);
                    }}
                  >
                    <div className="flex flex-col gap-1.5 flex-1">
                      {dayTasks.slice(0, 2).map((task: any) => (
                        <DraggableTaskCard
                          key={task._id}
                          task={task}
                          isSelected={selectedTaskId === task._id}
                          isDragEnabled={!!isEditable && !selectMode}
                          selectMode={selectMode}
                          isChecked={selectedIds.has(task._id)}
                          onClick={(e) => {
                            if (selectMode) {
                              toggleSelected(task._id, e?.shiftKey ?? false);
                              return;
                            }
                            setSelectedTaskId(task._id);
                            setPopoverDate(null);
                          }}
                          onContextMenu={
                            isEditable
                              ? (x, y) =>
                                  setTrayContextMenu({
                                    taskId: task._id,
                                    x,
                                    y,
                                  })
                              : undefined
                          }
                        />
                      ))}
                      {dayTasks.length > 2 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPopoverDate(popoverDate === dateStr ? null : dateStr);
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-0.5">
                            {dayTasks.slice(2).map((t: any) => {
                              const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS.pending;
                              return <div key={t._id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />;
                            })}
                          </div>
                          +{dayTasks.length - 2} more
                        </button>
                      )}
                    </div>

                    {popoverDate === dateStr && dayTasks.length > 0 && (
                      <DayPopover
                        dateStr={dateStr}
                        tasks={dayTasks}
                        selectedTaskId={selectedTaskId}
                        isEditable={!!isEditable}
                        onSelectTask={(id) => { setSelectedTaskId(id); setPopoverDate(null); }}
                        onAddEntry={() => {
                          setAddingDate(dateStr);
                          setNewPlatform(PLATFORMS[0]);
                          setNewContentType(CONTENT_TYPES[0]);
                          setPopoverDate(null);
                        }}
                        onClose={() => setPopoverDate(null)}
                      />
                    )}
                  </DroppableDayCell>
                );
              })}

              {/* Trailing empty cells */}
              {(() => {
                const totalCells = firstDay + daysInMonth;
                const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
                return Array.from({ length: remaining }).map((_, i) => (
                  <div key={`trail-${i}`} className="bg-[var(--bg-primary)] min-h-[120px] p-2 opacity-40" />
                ));
              })()}
            </div>
          </div>

          {/* Detail Sidebar.
              Keep the slot mounted while a linked-task fetch is in flight
              so clicking a workflow card does not collapse the sidebar
              and pop it back open. */}
          {selectedTaskId ? (
            selectedTask ? (
              <ContentCalendarEntrySidebar
                key={selectedTask._id}
                task={selectedTask}
                isEditable={!!isEditable}
                employees={employees}
                admins={admins}
                teams={allTeams ?? []}
                briefId={selectedTask.briefId}
                brandId={selectedBrandId as Id<"brands">}
                currentSheetMonth={monthStr}
                onClose={() => setSelectedTaskId(null)}
                onSelectTask={(id) => setSelectedTaskId(id)}
                updateTask={updateTask}
                updateTaskStatus={updateTaskStatus}
                deleteTask={deleteTask}
                toast={toast}
              />
            ) : (
              <div className="w-[360px] shrink-0 bg-white flex items-center justify-center border-l border-[var(--border)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
              </div>
            )
          ) : null}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
        </DragOverlay>
        </DndContext>
      )}

      {/* Bulk action bar (select mode) */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--text-primary)] text-white shadow-2xl">
          <span className="text-[12px] font-semibold tabular-nums">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-5 bg-white/20" />
          <button
            type="button"
            onClick={handleBulkToShelf}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/15 transition-colors"
          >
            <Inbox className="h-3.5 w-3.5" /> To shelf
          </button>
          <button
            type="button"
            onClick={() => setBulkAction(bulkAction === "shift" ? null : "shift")}
            className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
              bulkAction === "shift" ? "bg-white/20" : "hover:bg-white/15"
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" /> Shift dates
          </button>
          <button
            type="button"
            onClick={() => setBulkAction(bulkAction === "month" ? null : "month")}
            className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
              bulkAction === "month" ? "bg-white/20" : "hover:bg-white/15"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" /> Move to month
          </button>
          <div className="w-px h-5 bg-white/20" />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-[12px] text-white/70 hover:text-white px-1.5 transition-colors"
          >
            Clear
          </button>

          {/* Shift-dates popover */}
          {bulkAction === "shift" && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[280px] rounded-xl bg-white text-[var(--text-primary)] border border-[var(--border)] shadow-xl p-3">
              <p className="text-[12px] font-semibold mb-2">Shift selected entries</p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="number"
                  value={shiftDays}
                  onChange={(e) => {
                    setShiftDays(e.target.value);
                    setShiftStartDate("");
                  }}
                  className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
                <span className="text-[12px] text-[var(--text-secondary)]">
                  days (negative = earlier)
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-1.5">
                …or move the earliest entry to a date (gaps preserved):
              </p>
              <input
                type="date"
                value={shiftStartDate}
                onChange={(e) => setShiftStartDate(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] mb-2.5"
              />
              <button
                type="button"
                onClick={handleBulkShift}
                className="w-full py-2 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-semibold"
              >
                Apply
              </button>
            </div>
          )}

          {/* Move-to-month popover */}
          {bulkAction === "month" && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[240px] rounded-xl bg-white text-[var(--text-primary)] border border-[var(--border)] shadow-xl p-3">
              <p className="text-[12px] font-semibold mb-2">Move to month</p>
              <select
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] appearance-none cursor-pointer mb-2.5"
              >
                <option value="">Choose month…</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {new Date(m + "-01T00:00:00").toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--text-muted)] mb-2">
                Day-of-month is kept (clamped to the month&apos;s end).
              </p>
              <button
                type="button"
                onClick={handleBulkMonth}
                disabled={!targetMonth}
                className="w-full py-2 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-semibold disabled:opacity-50"
              >
                Move
              </button>
            </div>
          )}
        </div>
      )}

      {/* Duplicate-to-date modal */}
      {duplicateTaskId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
                Duplicate entry
              </h3>
              <button
                onClick={() => setDuplicateTaskId(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[12px] text-[var(--text-muted)] mb-2">
              A copy (status reset to Planned) is created on the chosen date.
            </p>
            <input
              type="date"
              value={duplicateDate}
              onChange={(e) => setDuplicateDate(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] mb-3"
            />
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={!duplicateDate}
              className="w-full py-2 rounded-md bg-[var(--accent-admin)] text-white text-[13px] font-semibold disabled:opacity-50"
            >
              Duplicate
            </button>
          </Card>
        </div>
      )}

      {/* Right-click context menu for calendar cards. */}
      {trayContextMenu && (
        <div
          className="fixed z-50 rounded-lg shadow-lg border border-[var(--border)] bg-white py-1 text-[12px]"
          style={{
            left: Math.min(trayContextMenu.x, window.innerWidth - 200),
            top: Math.min(trayContextMenu.y, window.innerHeight - 90),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleAddToShelf(trayContextMenu.taskId)}
            className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <Inbox className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
            Move to staging shelf
          </button>
          <button
            type="button"
            onClick={() => {
              setDuplicateTaskId(trayContextMenu.taskId);
              setDuplicateDate("");
              setTrayContextMenu(null);
            }}
            className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <Copy className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
            Duplicate to date…
          </button>
        </div>
      )}

      {/* Add Entry Modal */}
      {addingDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
                Add Entry - Go Live: {new Date(addingDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </h3>
              <button
                onClick={() => setAddingDate(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddEntry} className="flex flex-col gap-3">
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="e.g. Instagram Post - Product Launch"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional description or caption..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Platform</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Content Type</label>
                  <select
                    value={newContentType}
                    onChange={(e) => setNewContentType(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Assignor</label>
                <select
                  value={newAssignor || defaultAssignor}
                  onChange={(e) => setNewAssignor(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Select assignor</option>
                  {admins.map((u: any) => (
                    <option key={u._id} value={u._id}>
                      {u.name ?? u.email}{u.designation ? ` - ${u.designation}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Assignee (optional)</label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Unassigned</option>
                  {employees.map((emp: any) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name ?? emp.email}{emp.isFreelancer ? " (Freelancer)" : ""}{emp.designation ? ` - ${emp.designation}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Deadline (optional)</label>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary">Add Entry</Button>
                <Button type="button" variant="secondary" onClick={() => setAddingDate(null)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Create Brand Modal */}
      {showCreateBrand && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">Create Brand</h3>
              <button onClick={() => setShowCreateBrand(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateBrand} className="flex flex-col gap-3">
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Brand Name</label>
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  required
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Brand Color</label>
                <div className="flex gap-2 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewBrandColor(c)}
                      className={`w-7 h-7 rounded-lg transition-all ${newBrandColor === c ? "ring-2 ring-offset-2 ring-[var(--accent-admin)]" : "hover:scale-110"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary">Create</Button>
                <Button type="button" variant="secondary" onClick={() => setShowCreateBrand(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ────── Drag & Drop Helpers ────── */

function DroppableDayCell({
  dateStr,
  isToday,
  isWeekend,
  isBreakDay,
  day,
  isEditable,
  onAddClick,
  children,
}: {
  dateStr: string;
  isToday: boolean;
  isWeekend: boolean;
  isBreakDay: boolean;
  day: number;
  isEditable: boolean;
  onAddClick: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] p-2 flex flex-col transition-colors group relative ${
        isBreakDay
          ? "!bg-red-500 text-white"
          : `bg-white ${isWeekend ? "bg-[#fafafa]" : ""}`
      } ${
        isToday && !isBreakDay
          ? "ring-2 ring-inset ring-[var(--accent-admin)]"
          : ""
      } ${
        isToday && isBreakDay
          ? "ring-2 ring-inset ring-white/90"
          : ""
      } ${isOver ? "!bg-[var(--accent-admin-dim)] ring-2 ring-inset ring-[var(--accent-admin)]" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[12px] font-medium ${
            isBreakDay
              ? "bg-white/20 text-white w-6 h-6 rounded-full flex items-center justify-center"
              : isToday
                ? "bg-[var(--accent-admin)] text-white w-6 h-6 rounded-full flex items-center justify-center"
                : "text-[var(--text-secondary)]"
          }`}
        >
          {day}
        </span>
        {isEditable && (
          <button
            onClick={onAddClick}
            className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all ${
              isBreakDay
                ? "text-white/70 hover:text-white hover:bg-white/15"
                : "text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function DraggableTaskCard({
  task,
  isSelected,
  isDragEnabled,
  selectMode = false,
  isChecked = false,
  onClick,
  onContextMenu,
}: {
  task: any;
  isSelected: boolean;
  isDragEnabled: boolean;
  selectMode?: boolean;
  isChecked?: boolean;
  onClick: (e?: React.MouseEvent) => void;
  onContextMenu?: (clientX: number, clientY: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task._id,
    data: { task },
    disabled: !isDragEnabled,
  });

  const sc = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;

  return (
    <button
      ref={setNodeRef}
      {...(isDragEnabled ? { ...listeners, ...attributes } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e.clientX, e.clientY);
            }
          : undefined
      }
      className={`w-full text-left px-1.5 py-1 rounded-md text-[10px] leading-tight transition-all hover:shadow-sm ${
        isSelected && !selectMode ? "outline outline-2 outline-[var(--accent-admin)] shadow-sm" : ""
      } ${selectMode && isChecked ? "outline outline-2 outline-[var(--accent-admin)]" : ""} ${
        isDragging ? "opacity-30" : ""
      } ${isDragEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ backgroundColor: sc.bg }}
    >
      <div className="flex items-center gap-1">
        {selectMode ? (
          <span
            className={`w-3 h-3 rounded-[3px] border shrink-0 flex items-center justify-center ${
              isChecked
                ? "bg-[var(--accent-admin)] border-[var(--accent-admin)]"
                : "border-[var(--border-strong)] bg-white"
            }`}
          >
            {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
          </span>
        ) : (
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: sc.dot }}
          />
        )}
        <span className="font-medium text-[var(--text-primary)] truncate">
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-0.5 ml-2.5">
        <span className="text-[var(--text-muted)] truncate">
          {task.platform}
        </span>
        {(!task.assigneeId || !task.deadline) && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title={!task.assigneeId && !task.deadline ? "Unassigned & No Deadline" : !task.assigneeId ? "Unassigned" : "No Deadline"} />
        )}
      </div>
    </button>
  );
}

function TaskCardOverlay({ task }: { task: any }) {
  const sc = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;

  return (
    <div
      className="px-1.5 py-1 rounded-md text-[10px] leading-tight shadow-lg ring-2 ring-[var(--accent-admin)] cursor-grabbing w-[140px]"
      style={{ backgroundColor: sc.bg }}
    >
      <div className="flex items-center gap-1">
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: sc.dot }}
        />
        <span className="font-medium text-[var(--text-primary)] truncate">
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-0.5 ml-2.5">
        <span className="text-[var(--text-muted)] truncate">
          {task.platform}
        </span>
      </div>
    </div>
  );
}

/* ────── Day Popover ────── */

function DayPopover({
  dateStr,
  tasks,
  selectedTaskId,
  isEditable,
  onSelectTask,
  onAddEntry,
  onClose,
}: {
  dateStr: string;
  tasks: any[];
  selectedTaskId: string | null;
  isEditable: boolean;
  onSelectTask: (id: string) => void;
  onAddEntry: () => void;
  onClose: () => void;
}) {
  const dateLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-xl border border-[var(--border)] p-3 min-w-[240px] max-w-[300px] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            {dateLabel}
          </span>
          <div className="flex items-center gap-1">
            {isEditable && (
              <button
                onClick={onAddEntry}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
          {tasks.map((task: any) => {
            const sc = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;
            const isSelected = selectedTaskId === task._id;
            return (
              <button
                key={task._id}
                onClick={() => onSelectTask(task._id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition-all hover:shadow-sm ${
                  isSelected ? "outline outline-2 outline-[var(--accent-admin)]" : ""
                }`}
                style={{ backgroundColor: sc.bg }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sc.dot }} />
                  <span className="font-medium text-[var(--text-primary)] truncate flex-1">{task.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-3.5">
                  <span className="text-[var(--text-muted)]">{task.platform}</span>
                  <span className="text-[var(--text-muted)]">{task.assigneeName}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] text-center">
          {tasks.length} {tasks.length === 1 ? "entry" : "entries"}
        </div>
      </div>
    </>
  );
}

/* ────── Staging Shelf ────── */

function StagingShelf({
  tasks,
  collapsed,
  onToggle,
  onRestore,
  onSelectTask,
  isDragEnabled,
}: {
  tasks: any[];
  collapsed: boolean;
  onToggle: () => void;
  onRestore: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  isDragEnabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "staging-shelf" });

  return (
    <div
      ref={setNodeRef}
      className={`mb-3 rounded-xl border transition-colors ${
        isOver
          ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]"
          : "border-dashed border-[var(--border-strong)] bg-white"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Inbox className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Staging shelf
        </span>
        <span className="text-[10px] tabular-nums text-[var(--text-muted)] bg-[var(--bg-hover)] rounded-full px-1.5 py-0.5">
          {tasks.length}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
          Set entries aside here, then drag them back onto a day. Shared with the whole team.
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          aria-label={collapsed ? "Expand shelf" : "Collapse shelf"}
        >
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {!collapsed && (
        <div className="px-3 pb-2.5 flex flex-wrap gap-1.5 min-h-[34px]">
          {tasks.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] py-1">
              Empty. Drag an entry here (or right-click one → “Move to staging shelf”).
            </p>
          ) : (
            tasks.map((task) => (
              <ShelfChip
                key={task._id}
                task={task}
                onRestore={() => onRestore(task._id)}
                onClick={() => onSelectTask(task._id)}
                isDragEnabled={isDragEnabled}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ShelfChip({
  task,
  onRestore,
  onClick,
  isDragEnabled,
}: {
  task: any;
  onRestore: () => void;
  onClick: () => void;
  isDragEnabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `shelf-${task._id}`,
    data: { task },
    disabled: !isDragEnabled,
  });

  const sc = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;
  const origDate = task.postDate
    ? new Date(task.postDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      ref={setNodeRef}
      {...(isDragEnabled ? { ...listeners, ...attributes } : {})}
      className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-[var(--border-subtle)] max-w-[240px] ${
        isDragging ? "opacity-30" : ""
      } ${isDragEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ backgroundColor: sc.bg }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: sc.dot }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="text-left text-[11px] font-medium text-[var(--text-primary)] truncate"
      >
        {task.title}
      </button>
      {origDate && (
        <span className="text-[9px] font-medium text-[var(--text-muted)] bg-white/70 rounded px-1 py-px shrink-0">
          was {origDate}
        </span>
      )}
      {isDragEnabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/60 shrink-0"
          title="Put back on its original day"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

