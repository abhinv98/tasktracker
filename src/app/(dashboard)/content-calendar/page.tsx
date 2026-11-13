"use client";

import { useMutation, useQuery } from "convex/react";
import { useUpdateTaskStatus } from "@/lib/useUpdateTaskStatus";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, Modal, useToast } from "@/components/ui";
import { TASK_STATUS_META, taskStatusMeta } from "@/lib/status";
import { readCalendarCsv, type CalendarCsvRow } from "@/lib/calendarCsv";
import { ContentCalendarEntrySidebar, DeadlineInput } from "@/components/ContentCalendarView";
import { deadlineInputToMs } from "@/lib/deadlineInput";
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
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
import { fieldBaseClass, fieldClass, iconButtonClass } from "@/components/ui/classes";

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

// One look for every field, label and icon button on this page.
const FIELD = `w-full ${fieldClass}`;
const LABEL = "block mb-1 text-[12px] font-medium text-[var(--text-muted)]";
const ICON_BTN = iconButtonClass;
// Same button, sized for the inside of a day cell, the shelf and popovers.
const ICON_BTN_SM =
  "inline-flex items-center justify-center h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors";

// New entries default the assignee to the assignor as a placeholder, so an
// entry whose assignee is its assignor still needs someone assigned.
const isUnassigned = (t: any) => !t.assigneeId || t.assigneeId === t.assignedBy;

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

  // ?task=<id> opens that entry (links from Review, My Tasks, Work Log…).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(searchParams.get("task"));
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
  const allBrands = useQuery(api.brands.listBrands, {});
  // Brands whose calendar this user may open — sticky for employees, based on
  // any past task in that brand's calendar brief. `brands.listBrands` returns
  // nothing to employees, so their picker is fed by this scoped list instead.
  const myCalendarBrands = useQuery(api.contentCalendar.listMyCalendarBrands);
  const accessibleBrandIds = useMemo(
    () => myCalendarBrands?.map((b: any) => b._id as string),
    [myCalendarBrands]
  );
  const brands = user?.role === "admin" ? allBrands : myCalendarBrands;
  const allUsers = useQuery(api.users.listAllUsers);
  const allTeams = useQuery(api.teams.listTeams, {});
  const createBrand = useMutation(api.brands.createBrand);
  const createEntry = useMutation(api.contentCalendar.createEntryForBrand);
  const importMonthRows = useMutation(api.contentCalendar.importMonthRows);
  // CSV upload for the open month: the rows read from the file, shown for a
  // look before anything is added. null = no file picked.
  const [csvRows, setCsvRows] = useState<CalendarCsvRow[] | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateTaskStatus = useUpdateTaskStatus();
  const deleteTask = useMutation(api.tasks.deleteTask);
  const toggleBreakDayMut = useMutation(api.contentCalendar.toggleBreakDay);
  const stageEntriesMut = useMutation(api.contentCalendar.stageEntries);
  const unstageEntryMut = useMutation(api.contentCalendar.unstageEntry);
  const bulkShiftMut = useMutation(api.contentCalendar.bulkShiftDates);
  const shiftInFlight = useRef(false);
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

  // listAllUsers is admin-only; employees fall back to the two open lists so
  // the assignee/assignor pickers aren't empty for them.
  const nonAdmin = user != null && user.role !== "admin";
  const employeeList = useQuery(
    api.users.listEmployees,
    nonAdmin ? {} : "skip"
  );
  const managerList = useQuery(
    api.users.listManagers,
    nonAdmin ? {} : "skip"
  );

  const employees = useMemo(
    () => (allUsers ?? employeeList ?? []).filter((u: any) => u.role === "employee"),
    [allUsers, employeeList]
  );

  const admins = useMemo(
    () => (allUsers ?? managerList ?? []).filter((u: any) => u.role === "admin"),
    [allUsers, managerList]
  );

  const defaultAssignor = useMemo(() => {
    if (!brandManagers?.length || !admins.length) return "";
    const mgr = admins.find((u: any) => brandManagers.includes(u._id));
    return mgr?._id ?? "";
  }, [brandManagers, admins]);

  const isAdmin = user?.role === "admin";
  // Employees involved in a brand's calendar can edit it, not just read it.
  const isEditable =
    isAdmin ||
    (!!selectedBrandId && !!accessibleBrandIds?.includes(selectedBrandId));
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

  const [addingEntry, setAddingEntry] = useState(false);
  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    // One save at a time: a slow round-trip must not become a second entry.
    if (!selectedBrandId || !addingDate || addingEntry) return;
    const assignor = newAssignor || defaultAssignor || undefined;
    setAddingEntry(true);
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
        ...(newDeadline ? { deadline: deadlineInputToMs(newDeadline) } : {}),
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
    } finally {
      setAddingEntry(false);
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
    // A shift is relative, so a double-click would apply it twice.
    if (selectedIds.size === 0 || shiftInFlight.current) return;
    const delta = shiftStartDate ? undefined : parseInt(shiftDays, 10);
    if (!shiftStartDate && (delta === undefined || Number.isNaN(delta) || delta === 0)) {
      toast("error", "Enter days to shift, or pick a new start date");
      return;
    }
    shiftInFlight.current = true;
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
    } finally {
      shiftInFlight.current = false;
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--border)] bg-white shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
          <h1 className="font-semibold text-[18px] sm:text-[20px] text-[var(--text-primary)] tracking-[-0.01em] whitespace-nowrap">
            Content Calendar
          </h1>

          {/* Brand Selector */}
          <div className="flex items-center gap-2">
            {selectedBrand && (
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center overflow-hidden shrink-0"
                style={{ backgroundColor: selectedBrand.color ?? "#D5573B" }}
              >
                {selectedBrand.logoUrl ? (
                  <img src={selectedBrand.logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[11px] font-bold">
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
              aria-label="Brand"
              className="h-8 bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[var(--text-primary)] px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[180px]"
            >
              <option value="">Select brand</option>
              {/* On-hold brands take no new entries, so they are not offered;
                  one that is already open stays listed. */}
              {(brands ?? []).filter((b: { _id: string; onHold?: boolean }) => !b.onHold || b._id === selectedBrandId).map((b: any) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
              {isAdmin && <option value="__create__">+ Create new brand</option>}
            </select>
          </div>
          {/* Actions on the open month, kept apart from the brand picker. */}
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {isEditable && calendarBriefId && (
            <Button
              type="button"
              variant="secondary"
              aria-pressed={showBreakDayPicker}
              onClick={() => setShowBreakDayPicker((v) => !v)}
              className={showBreakDayPicker ? "!bg-[var(--bg-hover)] !border-[var(--border-strong)]" : ""}
            >
              {showBreakDayPicker ? "Done" : "Break days"}
            </Button>
          )}
          {isEditable && selectedBrandId && (
            <>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // picking the same file again must fire
                  if (!file) return;
                  if (file.size > 1_000_000) return toast("error", "That file is too large for a month of posts");
                  const rows = readCalendarCsv(await file.text(), monthStr, PLATFORMS);
                  if (rows.length === 0) return toast("error", "That file has no rows");
                  setCsvRows(rows);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => csvInputRef.current?.click()}
                title={`Fill ${MONTHS[month]} from a CSV file`}
              >
                Upload CSV
              </Button>
            </>
          )}
          {isEditable && selectedBrandId && (
            <Button
              type="button"
              variant="secondary"
              aria-pressed={selectMode}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds(new Set());
                setBulkAction(null);
              }}
              className={selectMode ? "!bg-[var(--bg-hover)] !border-[var(--border-strong)]" : ""}
            >
              <CheckSquare className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              {selectMode ? "Done selecting" : "Select"}
            </Button>
          )}
          </div>
        </div>

        {/* Month Nav */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            variant="secondary"
            onClick={() => {
              const n = new Date();
              setYear(n.getFullYear());
              setMonth(n.getMonth());
            }}
          >
            Today
          </Button>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} aria-label="Previous month" className={ICON_BTN}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-[15px] text-[var(--text-primary)] min-w-[140px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} aria-label="Next month" className={ICON_BTN}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Status legend */}
          <div className="hidden lg:flex flex-wrap items-center gap-x-3 gap-y-1 pl-3 border-l border-[var(--border)]">
            {Object.entries(TASK_STATUS_META).map(([key, sc]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
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
            <Calendar className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-3" aria-hidden />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">
              No content calendars to show yet
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              You'll see a brand's content calendar here as soon as you're
              assigned a task in it. Access stays open after that.
            </p>
          </div>
        </div>
      ) : !selectedBrandId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Calendar className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-3" aria-hidden />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">Select a brand to view its content calendar</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Choose a brand from the dropdown above</p>
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
              const incomplete = (tasks ?? []).filter((t: any) => isUnassigned(t) || !t.deadline);
              const noAssignee = incomplete.filter(isUnassigned).length;
              const noDeadline = incomplete.filter((t: any) => !t.deadline).length;
              if (incomplete.length === 0) return null;
              return (
                <div className="mb-3 px-3 py-2 rounded-md bg-[var(--warning-dim)] flex flex-wrap items-center gap-x-3 gap-y-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />
                  <span className="text-[12px] font-medium text-[var(--warning)]">
                    {incomplete.length} task{incomplete.length !== 1 ? "s" : ""} need attention
                  </span>
                  <span className="text-[12px] text-[var(--text-secondary)]">
                    {noAssignee > 0 && `${noAssignee} unassigned`}
                    {noAssignee > 0 && noDeadline > 0 && " · "}
                    {noDeadline > 0 && `${noDeadline} no deadline`}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)] ml-auto">Click a task to assign</span>
                </div>
              );
            })()}
            {!calendarBriefId && (
              <p className="mb-3 rounded-md bg-[var(--bg-hover)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                Add at least one calendar entry for this brand to load break days (same data as the brief Content Calendar).
              </p>
            )}
            {showBreakDayPicker && calendarBriefId && (
              <div className="mb-3 p-3 rounded-lg border border-[var(--border)] bg-white flex flex-col gap-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Break days - {MONTHS[month]} {year}
                  </p>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    Tap dates below to mark or clear breaks (same as the brand&apos;s Content Calendar brief). Cells marked Break in the grid are full-day breaks.
                  </p>
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
                        <div key={wd} className="text-center text-[12px] font-medium text-[var(--text-muted)] py-0.5">
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
                            aria-pressed={isBreak}
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
                                ? "bg-[var(--text-primary)] text-white border border-[var(--text-primary)] hover:opacity-90"
                                : "bg-white text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]"
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
                Opaque bg + bottom border so cells scrolling under the row
                are clipped cleanly instead of bleeding through. */}
            <div className="grid grid-cols-7 gap-px mb-px sticky top-0 z-20 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center py-2 text-[12px] font-medium text-[var(--text-muted)] bg-[var(--bg-primary)]">
                  {d}
                </div>
              ))}
            </div>

            {/* Day Cells. The grid always ends on a full week, so the four
                corner cells are fixed positions and can carry the radius
                (no overflow-hidden: the day popover hangs outside its cell). */}
            <div className="grid grid-cols-7 gap-px bg-[var(--border-subtle)] rounded-lg border border-[var(--border)] [&>*:first-child]:rounded-tl-[6px] [&>*:nth-child(7)]:rounded-tr-[6px] [&>*:nth-last-child(7)]:rounded-bl-[6px] [&>*:last-child]:rounded-br-[6px]">
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
                          className="flex items-center gap-1.5 h-6 px-1.5 rounded-md text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-0.5">
                            {dayTasks.slice(2).map((t: any) => {
                              const sc = taskStatusMeta(t.status);
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--text-primary)] text-white shadow-lg">
          <span className="px-1 text-[13px] font-medium tabular-nums">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-5 bg-white/20" />
          <button
            type="button"
            onClick={handleBulkToShelf}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium hover:bg-white/15 transition-colors"
          >
            <Inbox className="h-3.5 w-3.5" /> To shelf
          </button>
          <button
            type="button"
            aria-pressed={bulkAction === "shift"}
            onClick={() => setBulkAction(bulkAction === "shift" ? null : "shift")}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-colors ${
              bulkAction === "shift" ? "bg-white/20" : "hover:bg-white/15"
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" /> Shift dates
          </button>
          <button
            type="button"
            aria-pressed={bulkAction === "month"}
            onClick={() => setBulkAction(bulkAction === "month" ? null : "month")}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-colors ${
              bulkAction === "month" ? "bg-white/20" : "hover:bg-white/15"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" /> Move to month
          </button>
          <div className="w-px h-5 bg-white/20" />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex items-center h-8 px-3 rounded-md text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          >
            Clear
          </button>

          {/* Shift-dates popover */}
          {bulkAction === "shift" && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[280px] rounded-lg bg-white text-[var(--text-primary)] border border-[var(--border)] shadow-lg p-3">
              <p className="text-[13px] font-semibold mb-2">Shift selected entries</p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="number"
                  value={shiftDays}
                  onChange={(e) => {
                    setShiftDays(e.target.value);
                    setShiftStartDate("");
                  }}
                  aria-label="Days to shift"
                  className={`${fieldClass} w-20 tabular-nums`}
                />
                <span className="text-[12px] text-[var(--text-secondary)]">
                  days (negative = earlier)
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mb-1.5">
                …or move the earliest entry to a date (gaps preserved):
              </p>
              <input
                type="date"
                value={shiftStartDate}
                onChange={(e) => setShiftStartDate(e.target.value)}
                aria-label="New start date"
                className={`${FIELD} mb-2.5`}
              />
              <Button type="button" variant="primary" onClick={handleBulkShift} className="w-full">
                Apply
              </Button>
            </div>
          )}

          {/* Move-to-month popover */}
          {bulkAction === "month" && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[240px] rounded-lg bg-white text-[var(--text-primary)] border border-[var(--border)] shadow-lg p-3">
              <p className="text-[13px] font-semibold mb-2">Move to month</p>
              <select
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                aria-label="Target month"
                className={`${FIELD} cursor-pointer mb-2.5`}
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
              <p className="text-[12px] text-[var(--text-muted)] mb-2">
                Day-of-month is kept (clamped to the month&apos;s end).
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={handleBulkMonth}
                disabled={!targetMonth}
                className="w-full"
              >
                Move
              </Button>
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
                aria-label="Close"
                className={ICON_BTN}
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
              aria-label="Date for the copy"
              className={`${FIELD} mb-3`}
            />
            <Button
              type="button"
              variant="primary"
              onClick={handleDuplicate}
              disabled={!duplicateDate}
              className="w-full"
            >
              Duplicate
            </Button>
          </Card>
        </div>
      )}

      {/* Right-click context menu for calendar cards. */}
      {trayContextMenu && (
        <div
          className="fixed z-50 rounded-lg shadow-lg border border-[var(--border)] bg-white py-1 text-[13px]"
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
            <Inbox className="h-3.5 w-3.5 text-[var(--text-muted)]" />
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
            <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Duplicate to date…
          </button>
        </div>
      )}

      {/* Add Entry Modal */}
      {addingDate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">
                Add entry - Go live: {new Date(addingDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </h3>
              <button
                onClick={() => setAddingDate(null)}
                aria-label="Close"
                className={ICON_BTN}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddEntry} className="flex flex-col gap-3">
              <div>
                <label className={LABEL}>Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="e.g. Instagram Post - Product Launch"
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional description or caption..."
                  className={`w-full ${fieldBaseClass} py-1.5 resize-none`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Platform</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className={FIELD}
                  >
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Content type</label>
                  <select
                    value={newContentType}
                    onChange={(e) => setNewContentType(e.target.value)}
                    className={FIELD}
                  >
                    {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL}>Assignor</label>
                <select
                  value={newAssignor || defaultAssignor}
                  onChange={(e) => setNewAssignor(e.target.value)}
                  className={FIELD}
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
                <label className={LABEL}>Assignee (optional)</label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className={FIELD}
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
                <label className={LABEL}>Deadline (optional)</label>
                <DeadlineInput
                  value={newDeadline}
                  onChange={setNewDeadline}
                  className={FIELD}
                />
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary" loading={addingEntry} disabled={addingEntry}>Add entry</Button>
                <Button type="button" variant="ghost" onClick={() => setAddingDate(null)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CSV preview: what the file will add */}
      {csvRows && (() => {
        const good = csvRows.filter((r) => !r.error && r.date);
        const posts = good.filter((r) => !r.isBreak).length;
        const breaks = good.length - posts;
        const bad = csvRows.length - good.length;
        return (
          <Modal
            open
            onClose={() => setCsvRows(null)}
            title={`Add to ${selectedBrand?.name ?? "this brand"}, ${MONTHS[month]} ${year}`}
            size="lg"
            footer={
              <>
                <Button variant="ghost" onClick={() => setCsvRows(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={good.length === 0}
                  onClick={async () => {
                    try {
                      const res = await importMonthRows({
                        brandId: selectedBrandId as Id<"brands">,
                        month: monthStr,
                        rows: good.map((r) => ({ date: r.date!, title: r.title, platform: r.platform, isBreak: r.isBreak })),
                      });
                      setCsvRows(null);
                      toast(
                        "success",
                        `Added ${res.created} post${res.created !== 1 ? "s" : ""} and ${res.breaks} break day${res.breaks !== 1 ? "s" : ""}` +
                          (res.skipped ? `. ${res.skipped} already there, left as they were.` : "")
                      );
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Couldn't add the rows");
                    }
                  }}
                >
                  Add {posts} post{posts !== 1 ? "s" : ""}
                  {breaks > 0 ? ` and ${breaks} break day${breaks !== 1 ? "s" : ""}` : ""}
                </Button>
              </>
            }
          >
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">
              {bad > 0
                ? `${bad} row${bad !== 1 ? "s" : ""} can't be read and will be left out. Fix the file and upload again to add them.`
                : "This is what the file will add. Posts come in as Pending and assigned to you until you assign them."}
            </p>
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-[var(--border)]">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0">
                  <tr>
                    <th className="h-8 px-3 text-left">Date</th>
                    <th className="h-8 px-3 text-left">Post title</th>
                    <th className="h-8 px-3 text-left">Platform</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {csvRows.map((r) => (
                    <tr key={r.line} className={r.error ? "text-[var(--text-muted)]" : ""}>
                      <td className="h-9 px-3 whitespace-nowrap tabular-nums">
                        {r.date
                          ? new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
                          : `Line ${r.line}`}
                      </td>
                      {r.error ? (
                        <td colSpan={2} className="px-3 text-[var(--danger)]">
                          Left out: {r.error}
                        </td>
                      ) : r.isBreak ? (
                        <td colSpan={2} className="px-3 text-[var(--text-secondary)]">
                          Break day
                        </td>
                      ) : (
                        <>
                          <td className="px-3 max-w-[340px] truncate">{r.title}</td>
                          <td className="px-3 text-[var(--text-secondary)]">{r.platform}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">
              Columns: Date, Post title, Platform. All three are optional. A row without a date takes the day after the
              row above. For a break day write the date and the word break.{" "}
              <a
                className="font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
                download="content-calendar-sample.csv"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                  `Date,Post title,Platform\n01/${String(month + 1).padStart(2, "0")}/${year},Festive greeting,Instagram\n02/${String(month + 1).padStart(2, "0")}/${year},Product reel,Facebook\n03/${String(month + 1).padStart(2, "0")}/${year},break\n`
                )}`}
              >
                Download a sample
              </a>
            </p>
          </Modal>
        );
      })()}

      {/* Create Brand Modal */}
      {showCreateBrand && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">Create brand</h3>
              <button onClick={() => setShowCreateBrand(false)} aria-label="Close" className={ICON_BTN}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateBrand} className="flex flex-col gap-3">
              <div>
                <label className={LABEL}>Brand name</label>
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  required
                  placeholder="e.g. Acme Corp"
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>Brand color</label>
                <div className="flex gap-2 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewBrandColor(c)}
                      aria-label={`Brand color ${c}`}
                      aria-pressed={newBrandColor === c}
                      className={`w-7 h-7 rounded-md transition-all ${newBrandColor === c ? "ring-2 ring-offset-2 ring-[var(--text-primary)]" : "hover:scale-110"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary">Create</Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreateBrand(false)}>Cancel</Button>
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
        // A break is a quiet tint with a label; red stays for overdue.
        isBreakDay
          ? "bg-[var(--bg-hover)]"
          : isWeekend
            ? "bg-[var(--bg-primary)]"
            : "bg-white"
      } ${isOver ? "!bg-[var(--accent-admin-dim)] ring-2 ring-inset ring-[var(--accent-admin)]" : ""}`}
    >
      <div className="flex items-center justify-between h-6 mb-1">
        <span className="flex items-center gap-1.5 min-w-0">
          {/* Today is marked once: the date in an ink disc. */}
          <span
            className={`text-[12px] font-medium tabular-nums ${
              isToday
                ? "bg-[var(--text-primary)] text-white w-6 h-6 rounded-full flex items-center justify-center"
                : isBreakDay
                  ? "text-[var(--text-muted)]"
                  : "text-[var(--text-secondary)]"
            }`}
            aria-current={isToday ? "date" : undefined}
          >
            {day}
          </span>
          {isBreakDay && (
            <span className="text-[11px] font-medium text-[var(--text-muted)]">Break</span>
          )}
        </span>
        {isEditable && (
          <button
            onClick={onAddClick}
            aria-label={`Add entry on ${dateStr}`}
            className={`${ICON_BTN_SM} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
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

  const sc = taskStatusMeta(task.status);

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
      className={`w-full text-left px-1.5 py-1 rounded-md text-[11px] leading-tight transition-all hover:brightness-[0.97] ${
        isSelected && !selectMode ? "outline outline-2 outline-[var(--accent-admin)]" : ""
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
                ? "bg-[var(--text-primary)] border-[var(--text-primary)]"
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
        {(isUnassigned(task) || !task.deadline) && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0" title={isUnassigned(task) && !task.deadline ? "Unassigned & No Deadline" : isUnassigned(task) ? "Unassigned" : "No Deadline"} />
        )}
      </div>
    </button>
  );
}

function TaskCardOverlay({ task }: { task: any }) {
  const sc = taskStatusMeta(task.status);

  return (
    <div
      className="px-1.5 py-1 rounded-md text-[11px] leading-tight shadow-lg ring-2 ring-[var(--accent-admin)] cursor-grabbing w-[140px]"
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
        className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-lg shadow-lg border border-[var(--border)] p-3 min-w-[240px] max-w-[300px] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {dateLabel}
          </span>
          <div className="flex items-center gap-1">
            {isEditable && (
              <button onClick={onAddEntry} aria-label="Add entry" className={ICON_BTN_SM}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className={ICON_BTN_SM}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
          {tasks.map((task: any) => {
            const sc = taskStatusMeta(task.status);
            const isSelected = selectedTaskId === task._id;
            return (
              <button
                key={task._id}
                onClick={() => onSelectTask(task._id)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-all hover:brightness-[0.97] ${
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
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-muted)] text-center tabular-nums">
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
      className={`mb-3 rounded-lg border transition-colors ${
        isOver
          ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]"
          : "border-dashed border-[var(--border-strong)] bg-white"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          Staging shelf
        </span>
        <span className="text-[13px] tabular-nums text-[var(--text-muted)]">
          {tasks.length}
        </span>
        <span className="text-[12px] text-[var(--text-muted)] hidden sm:inline">
          Set entries aside here, then drag them back onto a day. Shared with the whole team.
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={`ml-auto ${ICON_BTN_SM}`}
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
            <p className="text-[12px] text-[var(--text-muted)] py-1">
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

  const sc = taskStatusMeta(task.status);
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
      className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border border-[var(--border-subtle)] max-w-[240px] ${
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
        <span className="text-[11px] font-medium text-[var(--text-muted)] bg-white/70 rounded px-1 py-px shrink-0">
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
          aria-label="Put back on its original day"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

