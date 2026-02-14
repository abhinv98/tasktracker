"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Clock,
  Briefcase,
  User,
  Copy,
  StickyNote,
  X,
  Check,
  Trash2,
  ArrowUp,
  ArrowDown,
  HelpCircle,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

// ─── Helpers ────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
function getWeekStart(s: string) {
  const d = new Date(s + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  return dateStr(d);
}
function formatMin(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min.toString().padStart(2, "0")} ${ampm}`;
}
function formatDateHeader(s: string) {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function shortDay(s: string) {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const HOUR_HEIGHT = 60;
const GRID_PAD_TOP = 16; // px buffer at top so first hour label isn't clipped
const START_HOUR = 11; // 11 AM
const END_HOUR = 20;   // 8 PM
const WORK_HOURS = END_HOUR - START_HOUR; // 9 hours
const WORK_MINUTES = WORK_HOURS * 60; // 540 minutes
const PRESET_COLORS = ["#6a9bcc", "#788c5d", "#d97757", "#9b7dcf", "#cc6a8e", "#5da0a0"];
const TIME_OPTIONS: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h++) {
  TIME_OPTIONS.push(h * 60);
  if (h < END_HOUR) TIME_OPTIONS.push(h * 60 + 15, h * 60 + 30, h * 60 + 45);
}
function isWeekend(dateString: string) {
  const d = new Date(dateString + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}
function dayName(dateString: string) {
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

const GRID_LEFT = 72;  // px – width of the hour-label column
const GRID_RIGHT = 12; // px – right margin

/**
 * Assign overlapping blocks to side-by-side columns (Google Calendar style).
 * Returns a Map of blockId -> { col, totalCols } for positioning.
 */
function layoutBlocks(blocks: Array<{ startTime: number; endTime: number; _id: string }>) {
  if (blocks.length === 0) return new Map<string, { col: number; totalCols: number }>();

  const sorted = [...blocks].sort(
    (a, b) => a.startTime - b.startTime || (b.endTime - b.startTime) - (a.endTime - a.startTime)
  );

  // Step 1: group blocks into connected overlap clusters
  const clusters: Array<typeof sorted> = [];
  let currentCluster: typeof sorted = [sorted[0]];
  let clusterEnd = sorted[0].endTime;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < clusterEnd) {
      // overlaps with current cluster
      currentCluster.push(sorted[i]);
      clusterEnd = Math.max(clusterEnd, sorted[i].endTime);
    } else {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
      clusterEnd = sorted[i].endTime;
    }
  }
  clusters.push(currentCluster);

  // Step 2: within each cluster, assign column indices
  const result = new Map<string, { col: number; totalCols: number }>();

  for (const cluster of clusters) {
    const columns: Array<Array<(typeof cluster)[number]>> = [];
    for (const block of cluster) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (lastInCol.endTime <= block.startTime) {
          columns[c].push(block);
          result.set(block._id, { col: c, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([block]);
        result.set(block._id, { col: columns.length - 1, totalCols: 0 });
      }
    }
    const totalCols = columns.length;
    for (const block of cluster) {
      const entry = result.get(block._id);
      if (entry) entry.totalCols = totalCols;
    }
  }

  return result;
}

export default function PlannerPage() {
  const user = useQuery(api.users.getCurrentUser);
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTime, setQuickAddTime] = useState(540);
  const [quickAddTab, setQuickAddTab] = useState<"brief_task" | "personal">("brief_task");
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddDesc, setQuickAddDesc] = useState("");
  const [quickAddEndTime, setQuickAddEndTime] = useState(600);
  const [quickAddColor, setQuickAddColor] = useState(PRESET_COLORS[0]);
  const [quickAddTaskId, setQuickAddTaskId] = useState<string>("");
  const [showBlockDetail, setShowBlockDetail] = useState<string | null>(null);
  const [showCopyDay, setShowCopyDay] = useState(false);
  const [copySource, setCopySource] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showPriority, setShowPriority] = useState<string | null>(null);
  const [priorityReason, setPriorityReason] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [conflictModal, setConflictModal] = useState<{
    conflicts: Array<{
      _id: string;
      title: string;
      startTime: number;
      endTime: number;
      createdById: string | null;
      createdByName: string | null;
      employeeId: string;
      employeeName: string;
    }>;
    pendingBlock: {
      userId: Id<"users">;
      date: string;
      startTime: number;
      endTime: number;
      type: "brief_task" | "personal";
      taskId?: Id<"tasks">;
      briefId?: Id<"briefs">;
      title: string;
      description?: string;
      color?: string;
    };
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const isAdminOrManager = isAdmin || isManager;
  const viewingUserId = (isAdminOrManager && selectedUserId) ? selectedUserId : user?._id;
  const isViewingSelf = viewingUserId === user?._id;

  // Queries
  const schedule = useQuery(
    api.schedule.getScheduleForDate,
    viewingUserId ? { userId: viewingUserId, date: selectedDate } : "skip"
  );
  const weekSchedule = useQuery(
    api.schedule.getScheduleForWeek,
    viewMode === "week" && viewingUserId
      ? { userId: viewingUserId, weekStart: getWeekStart(selectedDate) }
      : "skip"
  );
  const employees = useQuery(
    api.schedule.getEmployeesWithSchedule,
    isAdminOrManager ? { date: selectedDate } : "skip"
  );
  const unscheduledTasks = useQuery(
    api.schedule.getUnscheduledTasks,
    viewingUserId ? { userId: viewingUserId, date: selectedDate } : "skip"
  );
  const dailySummary = useQuery(
    api.schedule.getDailySummary,
    viewingUserId ? { userId: viewingUserId, date: selectedDate } : "skip"
  );
  const dailyNote = useQuery(
    api.schedule.getDailyNote,
    viewingUserId ? { userId: viewingUserId, date: selectedDate } : "skip"
  );
  const userTasks = useQuery(
    api.tasks.listTasksForUser,
    viewingUserId ? { userId: viewingUserId } : "skip"
  );

  // Mutations
  const createBlock = useMutation(api.schedule.createBlock);
  const updateBlock = useMutation(api.schedule.updateBlock);
  const deleteBlockMut = useMutation(api.schedule.deleteBlock);
  const copyDayMut = useMutation(api.schedule.copyDay);
  const saveDailyNote = useMutation(api.schedule.saveDailyNote);
  const reorderPriority = useMutation(api.schedule.reorderTaskPriority);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);

  // Auto-set selected user for admin/manager
  useEffect(() => {
    if (isAdminOrManager && !selectedUserId && user) {
      setSelectedUserId(user._id);
    }
  }, [isAdminOrManager, selectedUserId, user]);

  // Load note text
  useEffect(() => {
    setNoteText(dailyNote?.content ?? "");
  }, [dailyNote]);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (viewMode === "day" && selectedDate === todayStr() && gridRef.current) {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const offset = ((currentMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
      gridRef.current.scrollTop = Math.max(0, offset - 200);
    }
  }, [viewMode, selectedDate]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setSelectedDate((d) => addDays(d, -1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setSelectedDate((d) => addDays(d, 1)); }
      if (e.key === "t" || e.key === "T") { setSelectedDate(todayStr()); }
      if (e.key === "w" || e.key === "W") { setViewMode("week"); }
      if (e.key === "d" || e.key === "D") { setViewMode("day"); }
      if (e.key === "n" || e.key === "N") { openQuickAdd(findNextFreeSlot()); }
      if (e.key === "Escape") {
        setShowQuickAdd(false);
        setShowBlockDetail(null);
        setShowCopyDay(false);
        setShowPriority(null);
        setShowShortcuts(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [schedule]);

  function findNextFreeSlot(duration = 60): number {
    const now = new Date();
    let startMin = selectedDate === todayStr()
      ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15
      : START_HOUR * 60;
    if (startMin < START_HOUR * 60) startMin = START_HOUR * 60;
    const blocks = schedule ?? [];
    while (startMin + duration <= END_HOUR * 60) {
      const conflict = blocks.some((b) => b.startTime < startMin + duration && b.endTime > startMin);
      if (!conflict) return startMin;
      startMin += 15;
    }
    return START_HOUR * 60;
  }

  function openQuickAdd(startMin: number) {
    setQuickAddTime(startMin);
    setQuickAddEndTime(Math.min(startMin + 60, END_HOUR * 60));
    setQuickAddTab("brief_task");
    setQuickAddTitle("");
    setQuickAddDesc("");
    setQuickAddTaskId("");
    setQuickAddColor(PRESET_COLORS[0]);
    setShowQuickAdd(true);
    setShowBlockDetail(null);
  }

  function openQuickAddWithTask(taskId: string) {
    const task = (userTasks ?? []).find((t) => t._id === taskId);
    if (!task) return;
    // Cap block duration to remaining work hours (max WORK_MINUTES)
    const blockDuration = Math.min(task.durationMinutes, WORK_MINUTES);
    const startMin = findNextFreeSlot(blockDuration);
    setQuickAddTime(startMin);
    setQuickAddEndTime(Math.min(startMin + blockDuration, END_HOUR * 60));
    setQuickAddTab("brief_task");
    setQuickAddTitle(task.title);
    setQuickAddTaskId(task._id);
    setQuickAddDesc("");
    setShowQuickAdd(true);
    setShowBlockDetail(null);
  }

  // Helper: try creating a block, checking for cross-person conflicts first
  async function tryCreateBlock(blockArgs: {
    userId: Id<"users">;
    date: string;
    startTime: number;
    endTime: number;
    type: "brief_task" | "personal";
    taskId?: Id<"tasks">;
    briefId?: Id<"briefs">;
    title: string;
    description?: string;
    color?: string;
    force?: boolean;
  }) {
    // Check for same-user time conflicts (existing blocks on same date)
    const existingBlocks = schedule ?? [];
    const selfConflicts = existingBlocks.filter(
      (b) => b.startTime < blockArgs.endTime && b.endTime > blockArgs.startTime
    );

    if (selfConflicts.length > 0 && !blockArgs.force) {
      // Build conflict info with createdBy details
      const conflictDetails = selfConflicts.map((b) => ({
        _id: b._id,
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime,
        createdById: (b as Record<string, unknown>).createdBy as string | null ?? null,
        createdByName: null as string | null,
        employeeId: blockArgs.userId as string,
        employeeName: "",
      }));

      // Check if any conflicting block was created by a different person (cross-person conflict)
      const hasCrossPersonConflict = selfConflicts.some(
        (b) => (b as Record<string, unknown>).createdBy && (b as Record<string, unknown>).createdBy !== user?._id
      );

      if (hasCrossPersonConflict || !isViewingSelf) {
        // Show the conflict modal for cross-person resolution
        setConflictModal({
          conflicts: conflictDetails,
          pendingBlock: blockArgs,
        });
        return false;
      } else {
        // Simple self-conflict — just show error
        toast("error", `Time conflict with "${selfConflicts[0].title}" (${formatMin(selfConflicts[0].startTime)} - ${formatMin(selfConflicts[0].endTime)})`);
        return false;
      }
    }

    await createBlock(blockArgs);
    return true;
  }

  // Quick-schedule: one-click add from unscheduled tray directly onto calendar
  async function quickScheduleTask(taskId: string) {
    if (!viewingUserId) return;
    const task = (userTasks ?? []).find((t) => t._id === taskId);
    if (!task) return;
    const blockDuration = Math.min(task.durationMinutes, WORK_MINUTES);
    const startMin = findNextFreeSlot(blockDuration);
    const endMin = Math.min(startMin + blockDuration, END_HOUR * 60);
    try {
      const ok = await tryCreateBlock({
        userId: viewingUserId,
        date: selectedDate,
        startTime: startMin,
        endTime: endMin,
        type: "brief_task",
        taskId: task._id as Id<"tasks">,
        briefId: task.briefId as Id<"briefs">,
        title: task.title,
      });
      if (ok) toast("success", `Scheduled "${task.title}" at ${formatMin(startMin)} - ${formatMin(endMin)}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Time conflict — try manually");
    }
  }

  async function handleCreateBlock() {
    if (!viewingUserId) return;
    try {
      let ok = false;
      if (quickAddTab === "brief_task" && quickAddTaskId) {
        const task = (userTasks ?? []).find((t) => t._id === quickAddTaskId);
        ok = await tryCreateBlock({
          userId: viewingUserId,
          date: selectedDate,
          startTime: quickAddTime,
          endTime: quickAddEndTime,
          type: "brief_task",
          taskId: quickAddTaskId as Id<"tasks">,
          briefId: task?.briefId as Id<"briefs">,
          title: quickAddTitle || task?.title || "Task",
        });
      } else {
        ok = await tryCreateBlock({
          userId: viewingUserId,
          date: selectedDate,
          startTime: quickAddTime,
          endTime: quickAddEndTime,
          type: "personal",
          title: quickAddTitle || "Personal Task",
          description: quickAddDesc || undefined,
          color: quickAddColor,
        });
      }
      if (ok) {
        setShowQuickAdd(false);
        toast("success", "Block added");
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create block");
    }
  }

  async function handleForceCreate() {
    if (!conflictModal) return;
    try {
      await createBlock({ ...conflictModal.pendingBlock, force: true });
      setConflictModal(null);
      setShowQuickAdd(false);
      toast("success", "Block added (conflict overridden)");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create block");
    }
  }

  function handleConflictDm(recipientId: string, recipientName: string) {
    const pending = conflictModal?.pendingBlock;
    if (!pending) return;
    const msg = `Schedule conflict: I need to schedule "${pending.title}" (${formatMin(pending.startTime)} - ${formatMin(pending.endTime)}) on ${formatDateHeader(pending.date)}, but it conflicts with an existing block. Can we coordinate?`;
    router.push(`/messages?to=${recipientId}&msg=${encodeURIComponent(msg)}`);
    setConflictModal(null);
  }

  async function handleDeleteBlock(blockId: string) {
    try {
      await deleteBlockMut({ blockId: blockId as Id<"scheduleBlocks"> });
      setShowBlockDetail(null);
      toast("success", "Block removed");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleCompleteBlock(block: NonNullable<typeof schedule>[number]) {
    try {
      await updateBlock({ blockId: block._id, completed: !block.completed });
      if (!block.completed && block.type === "brief_task" && block.taskId) {
        toast("success", "Block marked complete");
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleCopyDay() {
    if (!viewingUserId || !copySource) return;
    try {
      const result = await copyDayMut({
        userId: viewingUserId,
        sourceDate: copySource,
        targetDate: selectedDate,
      });
      setShowCopyDay(false);
      toast("success", `Copied ${result.copied} blocks${result.skipped > 0 ? ` (${result.skipped} skipped)` : ""}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  const handleSaveNote = useCallback((text: string) => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      saveDailyNote({ date: selectedDate, content: text });
    }, 800);
  }, [selectedDate, saveDailyNote]);

  async function handlePrioritySave(taskId: string, direction: "up" | "down") {
    const task = (userTasks ?? []).find((t) => t._id === taskId);
    if (!task) return;
    const delta = direction === "up" ? -1500 : 1500;
    try {
      await reorderPriority({
        taskId: taskId as Id<"tasks">,
        newSortOrder: Math.max(1, task.sortOrder + delta),
        reason: priorityReason || undefined,
      });
      setShowPriority(null);
      setPriorityReason("");
      toast("success", "Priority adjusted & employee notified");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  // Filter employees
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, searchQuery]);

  // Dynamic grid range: expand beyond default working hours if blocks exist outside
  const { gridStartHour, gridEndHour } = useMemo(() => {
    let minHour = START_HOUR;
    let maxHour = END_HOUR;
    if (schedule && schedule.length > 0) {
      for (const block of schedule) {
        const blockStartHour = Math.floor(block.startTime / 60);
        const blockEndHour = Math.ceil(block.endTime / 60);
        if (blockStartHour < minHour) minHour = blockStartHour;
        if (blockEndHour > maxHour) maxHour = blockEndHour;
      }
    }
    return { gridStartHour: minHour, gridEndHour: maxHour };
  }, [schedule]);

  // Dynamic TIME_OPTIONS for the quick-add dialog based on grid range
  const dynamicTimeOptions = useMemo(() => {
    const opts: number[] = [];
    for (let h = gridStartHour; h <= gridEndHour; h++) {
      opts.push(h * 60);
      if (h < gridEndHour) opts.push(h * 60 + 15, h * 60 + 30, h * 60 + 45);
    }
    return opts;
  }, [gridStartHour, gridEndHour]);

  // Column layout for overlapping blocks
  const blockLayout = useMemo(() => {
    if (!schedule || schedule.length === 0) return new Map<string, { col: number; totalCols: number }>();
    return layoutBlocks(schedule);
  }, [schedule]);

  // Now line position
  const nowLineOffset = useMemo(() => {
    if (selectedDate !== todayStr()) return null;
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < gridStartHour * 60 || min > gridEndHour * 60) return null;
    return ((min - gridStartHour * 60) / 60) * HOUR_HEIGHT;
  }, [selectedDate, gridStartHour, gridEndHour]);

  // Week dates
  const weekDates = useMemo(() => {
    const ws = getWeekStart(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [selectedDate]);

  if (!user) return null;

  const availableTasks = unscheduledTasks ?? [];

  return (
    <div className="flex h-full bg-[var(--bg-primary)]">
      {/* LEFT PANEL */}
      <div className="w-72 shrink-0 flex flex-col border-r border-[var(--border)] bg-white">
        {/* Header */}
        <div className="px-3 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-4 w-4 text-[var(--accent-admin)]" />
            <h1 className="font-semibold text-[14px] text-[var(--text-primary)]">Planner</h1>
          </div>
          {isAdminOrManager && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search people..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
              />
            </div>
          )}
        </div>

        {/* Employee selector (admin/manager) */}
        {isAdminOrManager && (
          <div className="flex-1 overflow-y-auto border-b border-[var(--border)]" style={{ maxHeight: "45%" }}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">People</p>
            {filteredEmployees.map((emp) => {
              const isActive = viewingUserId === emp._id;
              return (
                <button
                  key={emp._id}
                  onClick={() => setSelectedUserId(emp._id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    isActive ? "bg-[var(--accent-admin-dim)] border-l-[3px] border-l-[var(--accent-admin)]" : "hover:bg-[var(--bg-hover)] border-l-[3px] border-l-transparent"
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">{emp.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{emp.totalHours}h scheduled</div>
                  </div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${emp.isBusy ? "bg-[var(--accent-admin)]" : "bg-[var(--accent-employee)]"}`} title={emp.isBusy ? "Busy" : "Free"} />
                </button>
              );
            })}
          </div>
        )}

        {/* Unscheduled Tasks Tray */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Unscheduled ({unscheduledTasks?.length ?? 0})
            </p>
            <span className="text-[8px] text-[var(--text-disabled)] italic">sorted by priority</span>
          </div>
          {(unscheduledTasks ?? []).length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-[var(--text-disabled)] text-center">All tasks scheduled!</p>
          ) : (
            (unscheduledTasks ?? []).map((task) => (
              <div
                key={task._id}
                className="px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-subtle)] group"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openQuickAddWithTask(task._id)}>
                    <div className="flex items-center gap-1.5">
                      <span className={`shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded text-[8px] font-bold px-1 ${
                        task.sortOrder <= 1000 ? "bg-red-100 text-red-700" :
                        task.sortOrder <= 5000 ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {task.sortOrder <= 1000 ? "H" : task.sortOrder <= 5000 ? "M" : "L"}
                      </span>
                      <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-[26px]">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] font-medium truncate max-w-[100px]">{task.briefName}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{task.duration}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => quickScheduleTask(task._id)}
                    className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 px-2 py-1 rounded-md bg-[var(--accent-admin)] text-white text-[9px] font-medium hover:bg-[#c4684d] transition-all"
                    title="Quick schedule on current day"
                  >
                    <Plus className="h-3 w-3 inline mr-0.5" />Add
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Bar */}
        <div className="px-4 py-2.5 border-b border-[var(--border)] bg-white flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDate((d) => addDays(d, -1))} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setSelectedDate(todayStr())} className="px-2.5 py-1 rounded-md text-[11px] font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]">Today</button>
            <button onClick={() => setSelectedDate((d) => addDays(d, 1))} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="font-semibold text-[14px] text-[var(--text-primary)]">{formatDateHeader(selectedDate)}</h2>
          {selectedDate === todayStr() && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent-admin)] text-white">Today</span>}
          {isWeekend(selectedDate) && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Weekend</span>}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setShowCopyDay(true)} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)]" title="Copy from another day">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowNotes(!showNotes)} className={`p-1.5 rounded-md hover:bg-[var(--bg-hover)] ${showNotes ? "text-[var(--accent-admin)]" : "text-[var(--text-muted)]"}`} title="Daily notes">
              <StickyNote className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-hover)] ml-1">
              <button onClick={() => setViewMode("day")} className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${viewMode === "day" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>Day</button>
              <button onClick={() => setViewMode("week")} className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${viewMode === "week" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>Week</button>
            </div>
            <button onClick={() => setShowShortcuts(!showShortcuts)} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] relative" title="Keyboard shortcuts">
              <HelpCircle className="h-3.5 w-3.5" />
              {showShortcuts && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-[var(--border)] rounded-lg shadow-lg z-30 p-3 text-left">
                  <p className="text-[11px] font-semibold text-[var(--text-primary)] mb-2">Shortcuts</p>
                  {[["←/→", "Prev/Next day"], ["T", "Today"], ["N", "New block"], ["D/W", "Day/Week view"], ["Esc", "Close panels"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[10px] py-0.5">
                      <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] font-mono text-[var(--text-primary)]">{k}</kbd>
                      <span className="text-[var(--text-muted)]">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Daily Summary Bar */}
        {dailySummary && viewMode === "day" && (
          <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-white flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-[var(--text-secondary)]"><Clock className="h-3 w-3 inline mr-1" /><strong>{dailySummary.totalHours}h</strong> scheduled</span>
              <span className="text-[var(--accent-admin)]"><Briefcase className="h-3 w-3 inline mr-1" />{dailySummary.briefHours}h brief</span>
              <span className="text-[var(--accent-manager)]"><User className="h-3 w-3 inline mr-1" />{dailySummary.personalHours}h personal</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-24 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden flex">
                <div className="h-full bg-[var(--accent-admin)]" style={{ width: `${Math.min(100, (dailySummary.briefHours / WORK_HOURS) * 100)}%` }} />
                <div className="h-full bg-[var(--accent-manager)]" style={{ width: `${Math.min(100 - (dailySummary.briefHours / WORK_HOURS) * 100, (dailySummary.personalHours / WORK_HOURS) * 100)}%` }} />
              </div>
              <span className="text-[10px] font-medium text-[var(--text-muted)] tabular-nums">{dailySummary.utilizationPct}%</span>
            </div>
          </div>
        )}

        {/* Day View */}
        {viewMode === "day" ? (
          <div className="flex-1 overflow-auto relative" ref={gridRef}>
            {/* Weekend notice */}
            {isWeekend(selectedDate) && (
              <div className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                <span className="text-[11px] font-medium">{dayName(selectedDate)} — Emergency / overtime work only.</span>
                <span className="text-[10px] text-amber-600">Blocks added here will be visible to your manager.</span>
              </div>
            )}
            <div className="relative" style={{ height: (gridEndHour - gridStartHour) * HOUR_HEIGHT + GRID_PAD_TOP + 16 }}>
              {/* Hour lines */}
              {Array.from({ length: gridEndHour - gridStartHour + 1 }, (_, i) => (
                <div key={i} className="absolute left-0 right-0 flex items-start" style={{ top: GRID_PAD_TOP + i * HOUR_HEIGHT }}>
                  <span className={`w-16 shrink-0 text-right pr-3 text-[10px] -translate-y-1.5 select-none ${(gridStartHour + i) < START_HOUR || (gridStartHour + i) > END_HOUR ? "text-amber-400" : "text-[var(--text-muted)]"}`}>{formatMin((gridStartHour + i) * 60)}</span>
                  <div className={`flex-1 border-t ${(gridStartHour + i) < START_HOUR || (gridStartHour + i) > END_HOUR ? "border-amber-200" : "border-[var(--border-subtle)]"}`} />
                </div>
              ))}
              {/* Half-hour lines */}
              {Array.from({ length: gridEndHour - gridStartHour }, (_, i) => (
                <div key={`half-${i}`} className="absolute left-16 right-0 border-t border-dotted border-[var(--border-subtle)] opacity-40" style={{ top: GRID_PAD_TOP + i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
              ))}

              {/* Now line */}
              {nowLineOffset !== null && (
                <div className="absolute left-14 right-0 z-10 flex items-center pointer-events-none" style={{ top: GRID_PAD_TOP + nowLineOffset }}>
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-admin)] -ml-1" />
                  <div className="flex-1 border-t-2 border-[var(--accent-admin)]" />
                </div>
              )}

              {/* Clickable empty slots — rendered BEFORE blocks so blocks sit on top */}
              {Array.from({ length: (gridEndHour - gridStartHour) * 2 }, (_, i) => {
                const slotTime = gridStartHour * 60 + i * 30;
                return (
                  <div
                    key={`slot-${i}`}
                    className="absolute left-[72px] right-3 cursor-pointer hover:bg-[var(--accent-admin-dim)] rounded transition-colors opacity-0 hover:opacity-100"
                    style={{ top: GRID_PAD_TOP + (i * HOUR_HEIGHT) / 2, height: HOUR_HEIGHT / 2, zIndex: 1 }}
                    onClick={() => openQuickAdd(slotTime)}
                  >
                    <div className="flex items-center justify-center h-full">
                      <Plus className="h-3 w-3 text-[var(--accent-admin)]" />
                    </div>
                  </div>
                );
              })}

              {/* Schedule blocks — rendered AFTER slots so they sit on top and are interactive */}
              {(schedule ?? []).map((block) => {
                const top = GRID_PAD_TOP + ((block.startTime - gridStartHour * 60) / 60) * HOUR_HEIGHT;
                const height = ((block.endTime - block.startTime) / 60) * HOUR_HEIGHT;
                const bgColor = block.type === "personal"
                  ? (block.color ?? PRESET_COLORS[0])
                  : (block.teamColor ?? "var(--accent-admin)");

                // Column layout for overlapping blocks
                const layout = blockLayout.get(block._id);
                const col = layout?.col ?? 0;
                const totalCols = layout?.totalCols ?? 1;
                const leftPct = (col / totalCols) * 100;
                const widthPct = (1 / totalCols) * 100;

                return (
                  <div
                    key={block._id}
                    className={`absolute rounded-lg cursor-pointer transition-all hover:shadow-md group ${block.completed ? "opacity-50" : ""}`}
                    style={{
                      top,
                      height: Math.max(height, 28),
                      left: `calc(${GRID_LEFT}px + (100% - ${GRID_LEFT + GRID_RIGHT}px) * ${leftPct / 100})`,
                      width: `calc((100% - ${GRID_LEFT + GRID_RIGHT}px) * ${widthPct / 100} - ${totalCols > 1 ? 2 : 0}px)`,
                      zIndex: 5,
                      backgroundColor: block.type === "personal"
                        ? `color-mix(in srgb, ${bgColor} 12%, white)`
                        : "white",
                      borderLeft: `3px solid ${bgColor}`,
                      border: block.type !== "personal" ? `1px solid var(--border)` : undefined,
                      borderLeftWidth: 3,
                      borderLeftColor: bgColor,
                    }}
                    onClick={() => { setShowBlockDetail(showBlockDetail === block._id ? null : block._id); setShowQuickAdd(false); }}
                  >
                    <div className="px-2 py-1 h-full flex flex-col justify-center overflow-hidden rounded-lg">
                      <p className={`text-[11px] font-medium text-[var(--text-primary)] truncate pr-5 ${block.completed ? "line-through" : ""}`}>{block.title}</p>
                      {height >= 40 && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {block.briefTitle && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] font-medium truncate max-w-[120px]">{block.briefTitle}</span>
                          )}
                          <span className="text-[9px] text-[var(--text-muted)]">{formatMin(block.startTime)} - {formatMin(block.endTime)}</span>
                          {block.taskStatus && (
                            <span className={`w-1.5 h-1.5 rounded-full ${block.taskStatus === "done" ? "bg-[var(--accent-employee)]" : block.taskStatus === "in-progress" ? "bg-[var(--accent-manager)]" : "bg-[var(--text-muted)]"}`} />
                          )}
                        </div>
                      )}
                    </div>
                    {/* Delete button — always semi-visible, full on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBlock(block._id); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-md bg-white/80 border border-[var(--border)] flex items-center justify-center opacity-40 group-hover:opacity-100 hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] transition-all text-[var(--text-muted)]"
                      title="Delete block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>

                    {/* Block detail popover */}
                    {showBlockDetail === block._id && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-[var(--border)] rounded-lg shadow-lg p-3" style={{ zIndex: 30 }} onClick={(e) => e.stopPropagation()}>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">{block.title}</p>
                        {block.briefTitle && <p className="text-[11px] text-[var(--accent-admin)] mb-1">Brief: {block.briefTitle}</p>}
                        <p className="text-[11px] text-[var(--text-secondary)] mb-2">{formatMin(block.startTime)} - {formatMin(block.endTime)}</p>
                        {block.description && <p className="text-[11px] text-[var(--text-muted)] mb-2">{block.description}</p>}
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleCompleteBlock(block)} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${block.completed ? "bg-[var(--accent-employee-dim)] text-[var(--accent-employee)]" : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--accent-employee-dim)]"}`}>
                            <Check className="h-3 w-3" />{block.completed ? "Completed" : "Complete"}
                          </button>
                          {(isViewingSelf || isAdmin) && (
                            <button onClick={() => handleDeleteBlock(block._id)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--danger-dim)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors">
                              <Trash2 className="h-3 w-3" />Delete
                            </button>
                          )}
                          {isAdminOrManager && !isViewingSelf && block.type === "brief_task" && block.taskId && (
                            <button onClick={() => { setShowPriority(block.taskId!); setShowBlockDetail(null); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] hover:bg-[var(--accent-admin)] hover:text-white transition-colors">
                              Priority
                            </button>
                          )}
                        </div>
                        {/* Task status sync */}
                        {block.completed && block.type === "brief_task" && block.taskId && block.taskStatus !== "done" && (
                          <button
                            onClick={async () => {
                              await updateTaskStatus({ taskId: block.taskId as Id<"tasks">, newStatus: "done" });
                              toast("success", "Task marked as Done");
                            }}
                            className="mt-2 w-full text-center py-1.5 rounded-md text-[10px] font-medium bg-[var(--accent-employee-dim)] text-[var(--accent-employee)] hover:bg-[var(--accent-employee)] hover:text-white transition-colors"
                          >
                            Also mark task as Done?
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Daily Notes */}
            {showNotes && (
              <div className="border-t border-[var(--border)] bg-white p-4">
                <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Daily Notes</p>
                <textarea
                  value={noteText}
                  onChange={(e) => { setNoteText(e.target.value); handleSaveNote(e.target.value); }}
                  placeholder="Add notes for the day... (standup notes, blockers, reminders)"
                  className="w-full p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] resize-none"
                  rows={3}
                  readOnly={!isViewingSelf}
                />
              </div>
            )}
          </div>
        ) : (
          /* Week View */
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-7 gap-2">
              {weekDates.map((date) => {
                const blocks = weekSchedule?.[date] ?? [];
                const totalMin = blocks.reduce((s, b) => s + (b.endTime - b.startTime), 0);
                const isToday = date === todayStr();
                return (
                  <button
                    key={date}
                    onClick={() => { setSelectedDate(date); setViewMode("day"); }}
                    className={`flex flex-col rounded-lg border p-3 min-h-[200px] text-left transition-colors hover:border-[var(--accent-admin)] ${
                      isToday ? "border-[var(--accent-admin)] bg-[var(--accent-admin-dim)]" : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <p className={`text-[11px] font-semibold mb-2 ${isToday ? "text-[var(--accent-admin)]" : "text-[var(--text-secondary)]"}`}>{shortDay(date)}</p>
                    <div className="flex-1 flex flex-col gap-1">
                      {blocks.slice(0, 6).map((b) => (
                        <div key={b._id} className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: b.color ?? (b.type === "brief_task" ? "var(--accent-admin)" : "var(--accent-manager)") }} />
                          <span className={`text-[9px] text-[var(--text-primary)] truncate ${b.completed ? "line-through opacity-50" : ""}`}>{b.title}</span>
                        </div>
                      ))}
                      {blocks.length > 6 && <p className="text-[9px] text-[var(--text-muted)]">+{blocks.length - 6} more</p>}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 pt-1 border-t border-[var(--border-subtle)]">{(totalMin / 60).toFixed(1)}h</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Popover (Overlay) */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20" onClick={() => setShowQuickAdd(false)}>
          <div className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-[380px] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">Schedule Block</h3>
              <button onClick={() => setShowQuickAdd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--bg-hover)] mb-3">
              <button onClick={() => setQuickAddTab("brief_task")} className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${quickAddTab === "brief_task" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>Brief Task</button>
              <button onClick={() => setQuickAddTab("personal")} className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${quickAddTab === "personal" ? "bg-white shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>Personal</button>
            </div>

            {quickAddTab === "brief_task" ? (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Task</label>
                  <select
                    value={quickAddTaskId}
                    onChange={(e) => {
                      setQuickAddTaskId(e.target.value);
                      const task = availableTasks.find((t) => t._id === e.target.value);
                      if (task) {
                        setQuickAddTitle(task.title);
                        setQuickAddEndTime(Math.min(quickAddTime + task.durationMinutes, END_HOUR * 60));
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">Select a task...</option>
                    {availableTasks.map((t) => (
                      <option key={t._id} value={t._id}>{t.title} ({t.briefName}) - {t.duration}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Title</label>
                  <input
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder="e.g., Design review, Lunch break"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Description (optional)</label>
                  <input
                    type="text"
                    value={quickAddDesc}
                    onChange={(e) => setQuickAddDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Color</label>
                  <div className="flex gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button key={c} onClick={() => setQuickAddColor(c)} className={`w-6 h-6 rounded-full border-2 transition-all ${quickAddColor === c ? "border-[var(--text-primary)] scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Time pickers */}
            <div className="grid grid-cols-2 gap-2.5 mt-3">
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Start</label>
                <select value={quickAddTime} onChange={(e) => setQuickAddTime(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]">
                  {dynamicTimeOptions.map((t) => <option key={t} value={t}>{formatMin(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">End</label>
                <select value={quickAddEndTime} onChange={(e) => setQuickAddEndTime(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]">
                  {dynamicTimeOptions.filter((t) => t > quickAddTime).map((t) => <option key={t} value={t}>{formatMin(t)}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleCreateBlock} disabled={quickAddTab === "brief_task" ? !quickAddTaskId : !quickAddTitle.trim()} className="mt-3 w-full py-2 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:bg-[#c4684d] disabled:opacity-30 transition-colors">
              Add to Schedule
            </button>
          </div>
        </div>
      )}

      {/* Copy Day Modal */}
      {showCopyDay && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20" onClick={() => setShowCopyDay(false)}>
          <div className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-[320px] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-3">Copy from another day</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mb-2">Clone schedule blocks to <strong>{formatDateHeader(selectedDate)}</strong></p>
            <input type="date" value={copySource} onChange={(e) => setCopySource(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)] mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setShowCopyDay(false)} className="flex-1 py-2 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">Cancel</button>
              <button onClick={handleCopyDay} disabled={!copySource} className="flex-1 py-2 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium hover:bg-[#c4684d] disabled:opacity-30">Copy</button>
            </div>
          </div>
        </div>
      )}

      {/* Priority Adjustment Modal */}
      {showPriority && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20" onClick={() => { setShowPriority(null); setPriorityReason(""); }}>
          <div className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-[320px] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[14px] text-[var(--text-primary)] mb-3">Adjust Priority</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mb-3">
              {(userTasks ?? []).find((t) => t._id === showPriority)?.title ?? "Task"}
            </p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => handlePrioritySave(showPriority, "up")} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-[var(--border)] text-[12px] font-medium hover:bg-[var(--accent-employee-dim)] hover:text-[var(--accent-employee)] transition-colors">
                <ArrowUp className="h-3.5 w-3.5" />Higher
              </button>
              <button onClick={() => handlePrioritySave(showPriority, "down")} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-[var(--border)] text-[12px] font-medium hover:bg-[var(--accent-admin-dim)] hover:text-[var(--accent-admin)] transition-colors">
                <ArrowDown className="h-3.5 w-3.5" />Lower
              </button>
            </div>
            <input
              type="text"
              value={priorityReason}
              onChange={(e) => setPriorityReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
            />
          </div>
        </div>
      )}

      {/* Conflict Modal */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConflictModal(null)}>
          <div className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-[420px] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">Schedule Conflict</h3>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-[12px] text-amber-800 mb-2">
                <strong>&quot;{conflictModal.pendingBlock.title}&quot;</strong> ({formatMin(conflictModal.pendingBlock.startTime)} - {formatMin(conflictModal.pendingBlock.endTime)}) conflicts with:
              </p>
              {conflictModal.conflicts.map((c) => (
                <div key={c._id} className="flex items-center gap-2 py-1.5 border-t border-amber-200 first:border-t-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-amber-900">&quot;{c.title}&quot;</span>
                    <span className="text-[10px] text-amber-700 ml-1">({formatMin(c.startTime)} - {formatMin(c.endTime)})</span>
                    {c.createdByName && (
                      <span className="text-[10px] text-amber-600 ml-1">scheduled by {c.createdByName}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Message buttons for each unique conflict creator */}
              {(() => {
                const creators = conflictModal.conflicts
                  .filter((c) => c.createdById && c.createdByName)
                  .reduce((acc, c) => {
                    if (c.createdById && !acc.find((a) => a.id === c.createdById)) {
                      acc.push({ id: c.createdById, name: c.createdByName! });
                    }
                    return acc;
                  }, [] as Array<{ id: string; name: string }>);

                return creators.map((creator) => (
                  <button
                    key={creator.id}
                    onClick={() => handleConflictDm(creator.id, creator.name)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
                    Message {creator.name}
                  </button>
                ));
              })()}

              {/* Message employee (if viewing someone else's calendar) */}
              {!isViewingSelf && conflictModal.conflicts[0]?.employeeId && (
                <button
                  onClick={() => handleConflictDm(conflictModal.conflicts[0].employeeId, conflictModal.conflicts[0].employeeName)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-manager)]" />
                  Message Employee
                </button>
              )}

              <button
                onClick={handleForceCreate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent-admin)] text-white text-[11px] font-medium hover:bg-[#c4684d] transition-colors"
              >
                Add Anyway
              </button>

              <button
                onClick={() => setConflictModal(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
