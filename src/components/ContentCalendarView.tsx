"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, useRef, useMemo, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, useToast } from "@/components/ui";
import {
  Plus,
  Trash2,
  X,
  Paperclip,
  Download,
  Loader2,
  ChevronRight,
  Calendar,
  Link2,
  ExternalLink,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  RotateCcw,
} from "lucide-react";

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

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "pending", label: "Planned", color: "#6b7280" },
  { value: "in-progress", label: "In Progress", color: "#f59e0b" },
  { value: "on-hold", label: "On Hold", color: "#ef4444" },
  { value: "review", label: "Review", color: "#8b5cf6" },
  { value: "done", label: "Completed", color: "#10b981" },
];

function statusInfo(status: string) {
  return (
    STATUS_OPTIONS.find((s) => s.value === status) ?? {
      value: status,
      label: status,
      color: "#6b7280",
    }
  );
}

function formatPostDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.toLocaleDateString("en-US", { day: "numeric" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return { display: `${month} ${day}`, weekday };
}

/** Explicit deadline, or end-of-day go-live (postDate) when no deadline is set. */
function effectiveDeadlineMs(task: {
  deadline?: number | null;
  postDate?: string | null;
}): number | null {
  if (task.deadline != null && task.deadline !== undefined) return task.deadline;
  if (task.postDate) {
    return new Date(task.postDate + "T23:59:59").getTime();
  }
  return null;
}

/**
 * Row-level deadline rollup for a calendar entry. Considers parent + linked
 * child tasks together so updating a child's deadline (e.g. extending the
 * Design team's timeline) is reflected on the entry instead of the row
 * showing stale "overdue" against the original parent date.
 *
 * Rule: while any task is incomplete, return the latest deadline among the
 * incomplete ones; overdue only fires if that latest date is past. If every
 * task is done, fall back to the parent's deadline and never flag overdue.
 */
function rowDeadlineInfo(task: {
  deadline?: number | null;
  postDate?: string | null;
  status?: string;
  linkedTasks?: Array<{
    status: string;
    deadline?: number | null;
    postDate?: string | null;
  }>;
}): { dl: number | null; overdue: boolean } {
  const parentDl = effectiveDeadlineMs(task);
  const pieces: Array<{ status?: string; dl: number | null }> = [
    { status: task.status, dl: parentDl },
    ...((task.linkedTasks ?? []).map((lt) => ({
      status: lt.status,
      dl: effectiveDeadlineMs(lt),
    }))),
  ];

  const incompleteWithDl = pieces.filter(
    (p) => p.status !== "done" && p.dl != null
  ) as Array<{ status?: string; dl: number }>;

  if (incompleteWithDl.length === 0) {
    return { dl: parentDl, overdue: false };
  }

  const latest = Math.max(...incompleteWithDl.map((p) => p.dl));
  return { dl: latest, overdue: latest < Date.now() };
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** First and last calendar date strings (YYYY-MM-DD) for a YYYY-MM month. */
function monthDateBounds(ym: string): { min: string; max: string } {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    min: `${ym}-01`,
    max: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

interface ContentCalendarViewProps {
  briefId: Id<"briefs">;
  isEditable: boolean;
  brandId?: Id<"brands">;
  /** "YYYY-MM" — open on this month's sheet (deep link from a task). */
  initialMonth?: string | null;
}

export function ContentCalendarView({
  briefId,
  isEditable,
  brandId,
  initialMonth,
}: ContentCalendarViewProps) {
  const sheets = useQuery(api.contentCalendar.listSheets, { briefId });
  const allUsers = useQuery(api.users.listAllUsers, {});
  const user = useQuery(api.users.getCurrentUser);
  const brandManagers = useQuery(
    api.brands.getManagersForBrand,
    brandId ? { brandId } : "skip"
  );
  const allTeams = useQuery(api.teams.listTeams, {});
  const createSheet = useMutation(api.contentCalendar.createSheet);
  const deleteSheetMut = useMutation(api.contentCalendar.deleteSheet);
  const createEntry = useMutation(api.contentCalendar.createCalendarEntry);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const toggleBreakDay = useMutation(api.contentCalendar.toggleBreakDay);

  const { toast } = useToast();

  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [newSheetMonth, setNewSheetMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [deleteSheetId, setDeleteSheetId] =
    useState<Id<"contentCalendarSheets"> | null>(null);

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState(PLATFORMS[0]);
  const [newContentType, setNewContentType] = useState(CONTENT_TYPES[0]);
  const [newPostDate, setNewPostDate] = useState("");
  const [newAssignee, setNewAssignee] = useState<string>("");
  const [newAssignor, setNewAssignor] = useState<string>("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newTeamFilter, setNewTeamFilter] = useState<string>("");

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showBreakDayPicker, setShowBreakDayPicker] = useState(false);

  // Once a tab is clicked, activeSheet wins. Until then, honour a deep link's
  // month when a sheet for it exists; otherwise fall back to the first sheet.
  const deepLinkedMonth =
    initialMonth && sheets?.some((s) => s.month === initialMonth)
      ? initialMonth
      : null;
  const currentSheetMonth =
    activeSheet ??
    deepLinkedMonth ??
    (sheets && sheets.length > 0 ? sheets[0].month : null);

  const tasks = useQuery(
    api.contentCalendar.listTasksForSheet,
    currentSheetMonth ? { briefId, month: currentSheetMonth } : "skip"
  );

  const breakDays = useQuery(
    api.contentCalendar.listBreakDays,
    currentSheetMonth ? { briefId, month: currentSheetMonth } : "skip"
  );
  const breakDaySet = new Set(breakDays ?? []);

  // Team members for the selected team filter in the add entry form
  const newTeamMembers = useQuery(
    api.teams.getTeamMembers,
    newTeamFilter ? { teamId: newTeamFilter as Id<"teams"> } : "skip"
  );

  const employees = (allUsers ?? []).filter(
    (u: any) => u.role === "employee"
  );
  const admins = (allUsers ?? []).filter(
    (u: any) => u.role === "admin"
  );
  const defaultAssignor = brandManagers && brandManagers.length > 0 ? brandManagers[0] : "";

  async function handleCreateSheet(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createSheet({ briefId, month: newSheetMonth });
      setActiveSheet(newSheetMonth);
      setShowNewSheet(false);
      toast("success", `Created sheet for ${monthLabel(newSheetMonth)}`);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to create sheet"
      );
    }
  }

  async function handleDeleteSheet() {
    if (!deleteSheetId) return;
    try {
      await deleteSheetMut({ sheetId: deleteSheetId });
      setDeleteSheetId(null);
      if (
        activeSheet &&
        sheets?.find((s) => s._id === deleteSheetId)?.month === activeSheet
      ) {
        setActiveSheet(null);
      }
      toast("success", "Sheet and its entries deleted");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to delete sheet"
      );
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!currentSheetMonth) return;
    if (newPostDate && !newPostDate.startsWith(currentSheetMonth)) {
      toast(
        "error",
        `Post date must be in ${monthLabel(currentSheetMonth)} (active month tab).`
      );
      return;
    }
    const assignor = newAssignor || (defaultAssignor as string) || undefined;
    try {
      await createEntry({
        briefId,
        title: newTitle,
        ...(newAssignee ? { assigneeId: newAssignee as Id<"users"> } : {}),
        ...(assignor ? { assignedBy: assignor as Id<"users"> } : {}),
        platform: newPlatform,
        contentType: newContentType,
        postDate: newPostDate,
        ...(newDeadline
          ? { deadline: new Date(newDeadline + "T23:59:59").getTime() }
          : {}),
      });
      setNewTitle("");
      setNewPostDate("");
      setNewAssignee("");
      setNewAssignor("");
      setNewDeadline("");
      setShowAddEntry(false);
      toast("success", "Entry added");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to add entry"
      );
    }
  }

  // NOTE: hooks must run on every render in the same order. The
  // `externalTaskDetail` query stays ABOVE the conditional early returns
  // below so React always sees the same hook sequence (otherwise we hit
  // the Rules of Hooks violation, React error #310).
  const selectedFromLocal =
    selectedTaskId && tasks
      ? tasks.find((t: any) => t._id === selectedTaskId)
      : null;

  // Linked Copy tasks are filtered out of the spreadsheet (they only appear
  // in the parent entry's sidebar). When the user clicks one, fall back to
  // a server fetch so the sidebar can render with full edit capability.
  const externalTaskDetail = useQuery(
    api.tasks.getTaskDetail,
    selectedTaskId && !selectedFromLocal
      ? { taskId: selectedTaskId as Id<"tasks"> }
      : "skip"
  );

  if (sheets === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Calendar className="h-10 w-10 text-[var(--text-muted)]" />
        <p className="text-[14px] text-[var(--text-secondary)]">
          No content calendar sheets yet
        </p>
        {isEditable && (
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={newSheetMonth}
              onChange={(e) => setNewSheetMonth(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px]"
            />
            <Button
              variant="primary"
              onClick={() =>
                createSheet({ briefId, month: newSheetMonth })
                  .then(() => {
                    setActiveSheet(newSheetMonth);
                    toast(
                      "success",
                      `Created ${monthLabel(newSheetMonth)}`
                    );
                  })
                  .catch((err) =>
                    toast(
                      "error",
                      err instanceof Error
                        ? err.message
                        : "Failed to create"
                    )
                  )
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Create First Sheet
            </Button>
          </div>
        )}
      </div>
    );
  }

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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-white shrink-0">
        <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">
          {currentSheetMonth ? monthLabel(currentSheetMonth) : "Content Calendar"}
        </h3>
        <div className="flex items-center gap-2">
          {isEditable && currentSheetMonth && (
            <>
              <Button
                variant={showBreakDayPicker ? "destructive" : "secondary"}
                onClick={() => setShowBreakDayPicker((v) => !v)}
                className="text-[12px] px-3 py-1.5 h-auto"
              >
                <Calendar className="h-3.5 w-3.5 mr-1" />
                {showBreakDayPicker ? "Done" : "Break Days"}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (currentSheetMonth) {
                    const [y, m] = currentSheetMonth.split("-").map(Number);
                    const firstDay = `${currentSheetMonth}-01`;
                    setNewPostDate(firstDay);
                  }
                  setShowAddEntry(true);
                }}
                className="text-[12px] px-3 py-1.5 h-auto"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Entry
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Break Day Picker */}
      {showBreakDayPicker && currentSheetMonth && (
        <div className="px-4 py-3 border-b border-[var(--border)] bg-red-50/40 shrink-0">
          <p className="text-[11px] font-semibold text-red-700 mb-1">
            Click a day to toggle a break. Rows in the table below show a BREAK badge when that post date matches (entries with no row still show as breaks in the month strip).
          </p>
          {(() => {
            const [y, m] = currentSheetMonth.split("-").map(Number);
            const daysInMonth = new Date(y, m, 0).getDate();
            const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
            const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const cells: (number | null)[] = [];
            for (let i = 0; i < firstDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);
            while (cells.length % 7 !== 0) cells.push(null);
            return (
              <div className="grid grid-cols-7 gap-1 max-w-[420px]">
                {weekdays.map((wd) => (
                  <div key={wd} className="text-center text-[10px] font-semibold text-[var(--text-muted)] py-0.5">
                    {wd}
                  </div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} />;
                  const dateStr = `${currentSheetMonth}-${String(day).padStart(2, "0")}`;
                  const isBreak = breakDaySet.has(dateStr);
                  return (
                    <button
                      key={dateStr}
                      onClick={() =>
                        toggleBreakDay({ briefId, date: dateStr })
                          .then((r) =>
                            toast(
                              "success",
                              r.added
                                ? `Marked ${dateStr} as break`
                                : `Removed break from ${dateStr}`
                            )
                          )
                          .catch(() => toast("error", "Failed to toggle break day"))
                      }
                      className={`rounded-md text-[12px] font-medium py-1.5 transition-colors ${
                        isBreak
                          ? "bg-red-500 text-white hover:bg-red-600"
                          : "bg-white text-[var(--text-primary)] hover:bg-red-100 border border-[var(--border-subtle)]"
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

      {/* Month strip: break days visible even when no entry exists for that date */}
      {currentSheetMonth && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)] shrink-0">
          <p className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">
            {monthLabel(currentSheetMonth)} - break days (red)
          </p>
          <div className="flex flex-wrap gap-1 max-w-full">
            {Array.from(
              { length: new Date(Number(currentSheetMonth.split("-")[0]), Number(currentSheetMonth.split("-")[1]), 0).getDate() },
              (_, i) => {
                const d = i + 1;
                const dateStr = `${currentSheetMonth}-${String(d).padStart(2, "0")}`;
                const isBreak = breakDaySet.has(dateStr);
                return (
                  <div
                    key={dateStr}
                    title={dateStr}
                    className={`w-7 h-7 flex items-center justify-center rounded text-[10px] font-medium shrink-0 ${
                      isBreak
                        ? "bg-red-500 text-white"
                        : "bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    }`}
                  >
                    {d}
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Spreadsheet + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Spreadsheet */}
        <div
          className={`flex-1 overflow-auto bg-[var(--bg-primary)] ${selectedTask ? "border-r border-[var(--border)]" : ""}`}
        >
          {(() => {
            const hasRealAssignee = (t: any) => t.assigneeId && t.assigneeId !== t.assignedBy;
            const incomplete = (tasks ?? []).filter(
              (t: any) => !hasRealAssignee(t) || rowDeadlineInfo(t).dl == null
            );
            const noAssignee = incomplete.filter((t: any) => !hasRealAssignee(t)).length;
            const noDeadline = incomplete.filter((t: any) => rowDeadlineInfo(t).dl == null).length;
            if (incomplete.length === 0) return null;
            return (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
                <span className="text-[12px] font-semibold text-amber-800">
                  {incomplete.length} task{incomplete.length !== 1 ? "s" : ""} need attention
                </span>
                <span className="text-[11px] text-amber-700">
                  {noAssignee > 0 && `${noAssignee} unassigned`}
                  {noAssignee > 0 && noDeadline > 0 && " · "}
                  {noDeadline > 0 && `${noDeadline} no deadline`}
                </span>
                <span className="text-[10px] text-amber-600 ml-auto">Click a row to assign</span>
              </div>
            );
          })()}
          <table className="w-full min-w-[1050px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--bg-primary)] border-b border-[var(--border)]">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[120px]">
                  Date
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[120px]">
                  Platform
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[110px]">
                  Content Type
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Title / Caption
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[100px]">
                  Status
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[140px]">
                  Copy Assignee
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[140px]">
                  Design Assignee
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[100px]">
                  Deadline
                </th>
                {isEditable && <th className="w-[40px]" />}
              </tr>
            </thead>
            <tbody>
              {(tasks ?? []).map((task: any) => {
                const pd = task.postDate
                  ? formatPostDate(task.postDate)
                  : null;
                const si = statusInfo(task.status);
                const isSelected = selectedTaskId === task._id;
                const isBreakDay = task.postDate && breakDaySet.has(task.postDate);
                return (
                  <tr
                    key={task._id}
                    onClick={() => setSelectedTaskId(task._id)}
                    className={`border-b border-[var(--border-subtle)] cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--accent-admin-dim)]"
                        : isBreakDay
                          ? "bg-red-100 hover:bg-red-200"
                          : ((!task.assigneeId || task.assigneeId === task.assignedBy) ||
                              rowDeadlineInfo(task).dl == null)
                            ? "bg-amber-50/50 hover:bg-amber-50"
                            : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {pd ? (
                        <div className="flex items-center gap-1.5">
                          <div>
                            <span className="text-[12px] font-medium text-[var(--text-primary)]">
                              {pd.display}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] ml-1">
                              {pd.weekday}
                            </span>
                          </div>
                          {isBreakDay && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-red-500">
                              BREAK
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[var(--text-muted)]">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-[var(--text-primary)]">
                        {task.platform ?? "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-[var(--text-primary)]">
                        {task.contentType ?? "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-[var(--text-primary)] font-medium">
                        {task.title}
                      </span>
                      {task.description && (
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate max-w-[200px]">
                          {task.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium"
                        style={{
                          color: si.color,
                          backgroundColor: `${si.color}15`,
                        }}
                      >
                        {si.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {/* Copy Assignee — resolved server-side from team
                          membership (Copy Team → copy, Design Team → design).
                          Works for legacy entries where the parent task holds
                          the design assignee and the child holds the copy. */}
                      {task.copyAssigneeName ? (
                        <div>
                          <span className="text-[12px] text-[var(--text-primary)]">
                            {task.copyAssigneeName}
                          </span>
                          {task.copyAssigneeDesignation && (
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {task.copyAssigneeDesignation}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-700 bg-amber-100">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {/* Design Assignee — resolved by entry schema. */}
                      {task.designAssigneeName ? (
                        <div>
                          <span className="text-[12px] text-[var(--text-primary)]">
                            {task.designAssigneeName}
                          </span>
                          {task.designAssigneeDesignation && (
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {task.designAssigneeDesignation}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const { dl, overdue } = rowDeadlineInfo(task);
                        return dl != null ? (
                          <span
                            className={`text-[11px] font-medium ${
                              overdue
                                ? "text-[var(--danger)]"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {new Date(dl).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-700 bg-amber-100">
                            No Deadline
                          </span>
                        );
                      })()}
                    </td>
                    {isEditable && (
                      <td
                        className="px-2 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            deleteTask({ taskId: task._id })
                              .then(() => {
                                if (selectedTaskId === task._id)
                                  setSelectedTaskId(null);
                                toast("success", "Entry deleted");
                              })
                              .catch((err) =>
                                toast(
                                  "error",
                                  err instanceof Error
                                    ? err.message
                                    : "Failed"
                                )
                              )
                          }
                          className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {tasks?.length === 0 && (
                <tr>
                  <td
                    colSpan={isEditable ? 9 : 8}
                    className="px-4 py-12 text-center"
                  >
                    <p className="text-[13px] text-[var(--text-muted)]">
                      No entries for {currentSheetMonth ? monthLabel(currentSheetMonth) : "this month"}.
                    </p>
                    {isEditable && (
                      <button
                        onClick={() => setShowAddEntry(true)}
                        className="mt-2 text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
                      >
                        Add your first entry
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail Sidebar.
            We keep the slot mounted while a linked-task fetch is in flight
            so clicking a workflow card (Copy ↔ Design) does not collapse
            the sidebar and re-open it. The spinner shell occupies the
            same width so the grid layout does not jump either. */}
        {selectedTaskId ? (
          selectedTask ? (
            <ContentCalendarEntrySidebar
              key={selectedTask._id}
              task={selectedTask}
              isEditable={isEditable}
              employees={employees}
              admins={admins}
              teams={allTeams ?? []}
              briefId={briefId}
              brandId={brandId}
              currentSheetMonth={currentSheetMonth}
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

      {/* Sheet Tabs Bar (Excel-style) */}
      <div className="flex items-center gap-0 border-t border-[var(--border)] bg-white px-1 shrink-0 overflow-x-auto">
        {sheets.map((sheet) => {
          const isActive =
            currentSheetMonth === sheet.month;
          return (
            <div
              key={sheet._id}
              className={`group relative flex items-center gap-1 px-4 py-2 text-[12px] font-medium cursor-pointer border-r border-[var(--border-subtle)] transition-colors ${
                isActive
                  ? "bg-white text-[var(--text-primary)] border-t-2 border-t-[var(--accent-admin)]"
                  : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-t-2 border-t-transparent"
              }`}
              onClick={() => setActiveSheet(sheet.month)}
            >
              {monthLabel(sheet.month)}
              {isEditable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteSheetId(sheet._id);
                  }}
                  className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        {isEditable && (
          <button
            onClick={() => setShowNewSheet(true)}
            className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* New Sheet Modal */}
      {showNewSheet && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
                Add Month Sheet
              </h3>
              <button
                onClick={() => setShowNewSheet(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSheet} className="flex flex-col gap-3">
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Month
                </label>
                <input
                  type="month"
                  value={newSheetMonth}
                  onChange={(e) => setNewSheetMonth(e.target.value)}
                  required
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary">
                  Create
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowNewSheet(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Add Entry Modal */}
      {showAddEntry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
                Add Content Entry
              </h3>
              <button
                onClick={() => setShowAddEntry(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddEntry} className="flex flex-col gap-3">
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Title
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="e.g. Instagram Post - Product Launch"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Post Date
                </label>
                <input
                  type="date"
                  value={newPostDate}
                  min={currentSheetMonth ? monthDateBounds(currentSheetMonth).min : undefined}
                  max={currentSheetMonth ? monthDateBounds(currentSheetMonth).max : undefined}
                  onChange={(e) => setNewPostDate(e.target.value)}
                  required
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                    Platform
                  </label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                    Content Type
                  </label>
                  <select
                    value={newContentType}
                    onChange={(e) => setNewContentType(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    {CONTENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Copy Team → Copy Assignee flow (primary).
                  Design assignee is added later via the sidebar's "Assign task" panel. */}
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Copy Team
                </label>
                <select
                  value={newTeamFilter}
                  onChange={(e) => {
                    setNewTeamFilter(e.target.value);
                    setNewAssignee(""); // Reset assignee when team changes
                  }}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Select copy team</option>
                  {(allTeams ?? [])
                    .filter((team: any) => {
                      const n = (team.name || "").toLowerCase();
                      return n.includes("copy") || n.includes("content") || n.includes("writing");
                    })
                    .map((team: any) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  The copy team owns the entry. Design is assigned separately from the entry's sidebar.
                </p>
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Copy Assignee
                </label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Unassigned</option>
                  {(newTeamFilter && newTeamMembers
                    ? newTeamMembers
                    : employees
                  ).map((emp: any) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name ?? emp.email}
                      {emp.designation ? ` - ${emp.designation}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Assignor is auto-set to the brand manager.
                </p>
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Deadline (optional)
                </label>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary">
                  Add Entry
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddEntry(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Sheet Confirmation */}
      {deleteSheetId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="font-semibold text-[16px] text-[var(--text-primary)] mb-2">
              Delete Sheet
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-4">
              This will permanently delete this month's sheet and all its
              entries. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDeleteSheet}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeleteSheetId(null)}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ────── Entry detail sidebar (shared: brief Content Calendar + /content-calendar grid) ────── */
export function ContentCalendarEntrySidebar({
  task,
  isEditable,
  employees,
  admins,
  teams,
  briefId,
  brandId,
  currentSheetMonth,
  onClose,
  onSelectTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  toast,
}: {
  task: any;
  isEditable: boolean;
  employees: any[];
  admins: any[];
  teams: any[];
  briefId: Id<"briefs">;
  brandId?: Id<"brands">;
  currentSheetMonth: string | null;
  onClose: () => void;
  /** Optional: switch the sidebar to a different task (e.g. opening a linked Copy task). */
  onSelectTask?: (taskId: string) => void;
  updateTask: any;
  updateTaskStatus: any;
  deleteTask: any;
  toast: (type: "success" | "error" | "info", msg: string) => void;
}) {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPlatform, setEditPlatform] = useState(task.platform ?? "");
  const [editContentType, setEditContentType] = useState(
    task.contentType ?? ""
  );
  const [editPostDate, setEditPostDate] = useState(task.postDate ?? "");
  // Number of creatives required from the design assignee for this entry.
  // Lives on the design task (parent in design-first, child in modern); the
  // sidebar reads and writes it via `designCreativesRequired` exposed by
  // the calendar query.
  const [editCreativesRequired, setEditCreativesRequired] = useState<string>(
    (task as any).designCreativesRequired != null
      ? String((task as any).designCreativesRequired)
      : ""
  );
  const [editDeadline, setEditDeadline] = useState(
    task.deadline
      ? new Date(task.deadline).toISOString().split("T")[0]
      : ""
  );
  const [editAssignee, setEditAssignee] = useState(task.assigneeId ?? "");
  const [editAssignor, setEditAssignor] = useState(task.assignedBy ?? "");
  const [editDescription, setEditDescription] = useState(
    task.description ?? ""
  );
  const [editCreativeCopy, setEditCreativeCopy] = useState(task.creativeCopy ?? "");
  const [editCaption, setEditCaption] = useState(task.caption ?? "");
  const [editPostTitle, setEditPostTitle] = useState((task as any).postTitle ?? "");
  const [editPostDescription, setEditPostDescription] = useState(
    (task as any).postDescription ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [sidebarTeamFilter, setSidebarTeamFilter] = useState<string>("");
  const teamFilterTouched = useRef(false);
  const [submittingTo, setSubmittingTo] = useState<"tl" | "bm" | "as" | null>(null);

  // Sidebar navigation: null → Main entry overview is shown; otherwise the
  // sidebar swaps to a per-task editor for the chosen team. `creatingNew`
  // means the user is creating a brand-new linked team task from the cards
  // list. Clicking a role card on Main sets openTaskId; the editor's back
  // arrow returns to Main.
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  // Query team members for sidebar team filter
  const sidebarTeamMembers = useQuery(
    api.teams.getTeamMembers,
    sidebarTeamFilter ? { teamId: sidebarTeamFilter as Id<"teams"> } : "skip"
  );

  // Query deliverables for this task
  const deliverables = useQuery(api.approvals.listDeliverables, { taskId: task._id });
  const submitDeliverable = useMutation(api.approvals.submitDeliverable);
  const submitDirectToManager = useMutation(api.approvals.submitDeliverableDirectToManager);
  const submitDirectToAssignor = useMutation(api.approvals.submitDeliverableDirectToAssignor);
  const createLinkedCalendarTask = useMutation(api.contentCalendar.createLinkedCalendarTask);

  const calendarEntryTaskId = (task.parentTaskId ?? task._id) as Id<"tasks">;
  const linkedTasks = useQuery(api.contentCalendar.listLinkedTasksForEntry, {
    parentTaskId: calendarEntryTaskId,
  });
  const removeLinkedTask = useMutation(api.contentCalendar.removeLinkedCalendarTask);

  // When the sidebar is mounted on a linked child, its own enriched row
  // (teamId / teamName / role) from the linked-tasks query.
  const selfLinked = useMemo(
    () =>
      task.parentTaskId
        ? ((linkedTasks ?? []) as any[]).find((lt) => lt._id === task._id) ?? null
        : null,
    [task.parentTaskId, task._id, linkedTasks]
  );

  // Pre-select the child task's own team in the Team dropdown (it used to
  // sit on "All Teams" even though the task clearly belongs to one).
  useEffect(() => {
    if (teamFilterTouched.current) return;
    if (selfLinked?.teamId) setSidebarTeamFilter(selfLinked.teamId as string);
  }, [selfLinked?.teamId]);

  // Surface brief-level metadata (brand, brief type, manager) on the Main
  // view so multi-team briefs routed through `/briefs` → "Add to Calendar"
  // show up with full context, not just title + roles.
  const briefMeta = useQuery(api.briefs.getBrief, { briefId });

  // When the user opens a linked (Copy) task, we don't have the parent entry's
  // assignee/status baked in. Fetch it so the Workflow summary can render Design.
  const parentEntryDetail = useQuery(
    api.tasks.getTaskDetail,
    task.parentTaskId ? { taskId: calendarEntryTaskId } : "skip"
  );

  const [deletingLinkedId, setDeletingLinkedId] = useState<string | null>(null);

  // ── Open team-task editor state ───────────────────────────────
  // When the user clicks a role card on Main, the sidebar swaps to a
  // per-task editor whose fields target the chosen task (parent or child).
  // These state vars hold the editable copy; useEffect rehydrates them
  // whenever `openTaskId` swaps.

  // Identify the task currently open in the per-team editor.
  const openTask = useMemo(() => {
    if (!openTaskId) return null;
    if (openTaskId === task._id) return task;
    return (linkedTasks ?? []).find((lt: any) => lt._id === openTaskId) ?? null;
  }, [openTaskId, task, linkedTasks]);

  const [oTeam, setOTeam] = useState<string>("");
  const [oAssignee, setOAssignee] = useState<string>("");
  const [oDeadline, setODeadline] = useState<string>("");
  const [oCreativeCopy, setOCreativeCopy] = useState<string>("");
  const [oCaption, setOCaption] = useState<string>("");
  const [oSaving, setOSaving] = useState(false);

  const oTeamMembers = useQuery(
    api.teams.getTeamMembers,
    oTeam ? { teamId: oTeam as Id<"teams"> } : "skip"
  );

  // Reset the editor's local state when the user opens a different task,
  // creates a new one, or returns to Main.
  useEffect(() => {
    if (creatingNew) {
      setOTeam("");
      setOAssignee("");
      setODeadline("");
      setOCreativeCopy("");
      setOCaption("");
      return;
    }
    if (openTask) {
      setOTeam(""); // user can pick a different team; we don't infer the bound team
      setOAssignee(openTask.assigneeId ?? "");
      setODeadline(
        openTask.deadline
          ? new Date(openTask.deadline).toISOString().split("T")[0]
          : ""
      );
      setOCreativeCopy(openTask.creativeCopy ?? "");
      setOCaption(openTask.caption ?? "");
    }
  }, [openTaskId, creatingNew, openTask?._id, openTask?.assigneeId, openTask?.deadline, openTask?.creativeCopy, openTask?.caption]);

  // Reference links
  const updateReferenceLinks = useMutation(api.contentCalendar.updateReferenceLinks);
  const [refLinks, setRefLinks] = useState<string[]>(task.referenceLinks ?? []);
  const [newLink, setNewLink] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);

  async function handleAddLink() {
    const link = newLink.trim();
    if (!link) return;
    const updated = [...refLinks, link];
    setRefLinks(updated);
    setNewLink("");
    setShowLinkInput(false);
    try {
      await updateReferenceLinks({ taskId: task._id, referenceLinks: updated });
    } catch {
      setRefLinks(refLinks);
    }
  }

  async function handleRemoveLink(index: number) {
    const updated = refLinks.filter((_, i) => i !== index);
    setRefLinks(updated);
    try {
      await updateReferenceLinks({ taskId: task._id, referenceLinks: updated });
    } catch {
      setRefLinks(refLinks);
    }
  }

  const attachments = useQuery(api.attachments.getAttachments, {
    parentType: "task" as const,
    parentId: task._id,
  });
  const addAttachment = useMutation(api.attachments.addAttachment);
  const deleteAttachment = useMutation(api.attachments.deleteAttachment);
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const user = useQuery(api.users.getCurrentUser);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (editTitle !== task.title) updates.title = editTitle;
      if (editPlatform !== (task.platform ?? ""))
        updates.platform = editPlatform;
      if (editContentType !== (task.contentType ?? ""))
        updates.contentType = editContentType;
      if (editPostDate !== (task.postDate ?? ""))
        updates.postDate = editPostDate;
      if (editDescription !== (task.description ?? ""))
        updates.description = editDescription;
      if (editCreativeCopy !== (task.creativeCopy ?? ""))
        updates.creativeCopy = editCreativeCopy;
      if (editCaption !== (task.caption ?? ""))
        updates.caption = editCaption;
      if (editPostTitle !== ((task as any).postTitle ?? ""))
        updates.postTitle = editPostTitle;
      if (editPostDescription !== ((task as any).postDescription ?? ""))
        updates.postDescription = editPostDescription;
      if (editAssignee && editAssignee !== task.assigneeId)
        updates.assigneeId = editAssignee;
      // Assignor edits removed from UI — assignor is always the brand manager
      // (auto-set on task creation). Leave existing task.assignedBy alone.
      if (editDeadline) {
        const ts = new Date(editDeadline + "T23:59:59").getTime();
        if (ts !== task.deadline) updates.deadline = ts;
      } else if (task.deadline) {
        updates.clearDeadline = true;
      }

      if (Object.keys(updates).length > 0) {
        await updateTask({ taskId: task._id, ...updates });
      }

      // Write Number of Creatives onto the design task (parent in
      // design-first entries, design child in the modern split). Updated
      // separately so it routes to the correct task.
      const designTaskId =
        ((task as any).designTaskId as Id<"tasks"> | null) ?? null;
      const currentCreatives =
        (task as any).designCreativesRequired ?? null;
      const trimmed = editCreativesRequired.trim();
      const nextCreatives = trimmed === "" ? null : Math.max(1, Math.min(99, parseInt(trimmed, 10) || 0));
      if (designTaskId && nextCreatives !== currentCreatives) {
        if (nextCreatives === null) {
          await updateTask({
            taskId: designTaskId,
            clearCreativesRequired: true,
          });
        } else {
          await updateTask({
            taskId: designTaskId,
            creativesRequired: nextCreatives,
          });
        }
      }

      if (Object.keys(updates).length > 0 || (designTaskId && nextCreatives !== currentCreatives)) {
        toast("success", "Entry updated");
      } else {
        toast("info", "No changes to save");
      }
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteTask({ taskId: task._id });
      onClose();
      toast("success", "Entry deleted");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete");
    }
  }

  // Save the open team-task editor. When `creatingNew` is true we spawn a
  // linked child via createLinkedCalendarTask; otherwise we patch whichever
  // task is currently open via updateTask.
  async function handleSaveOpenTask(teamLabelForNew?: string) {
    if (!oAssignee) {
      toast("error", "Select a team member first");
      return;
    }
    setOSaving(true);
    try {
      const deadlineMs = oDeadline
        ? new Date(oDeadline + "T23:59:59").getTime()
        : undefined;

      if (creatingNew) {
        const label = teamLabelForNew ?? "Team";
        await createLinkedCalendarTask({
          briefId,
          parentTaskId: calendarEntryTaskId,
          assigneeId: oAssignee as Id<"users">,
          title: `[${label}] ${task.title}`,
          ...(oTeam ? { teamId: oTeam as Id<"teams"> } : {}),
          ...(deadlineMs !== undefined ? { deadline: deadlineMs } : {}),
        });
        toast("success", "Team task created");
        setCreatingNew(false);
        return;
      }

      if (!openTask) return;
      const updates: Record<string, any> = {};
      if (oAssignee !== openTask.assigneeId) updates.assigneeId = oAssignee;
      if (deadlineMs !== undefined) {
        if (deadlineMs !== openTask.deadline) updates.deadline = deadlineMs;
      } else if (openTask.deadline) {
        updates.clearDeadline = true;
      }
      if (oCreativeCopy !== (openTask.creativeCopy ?? "")) updates.creativeCopy = oCreativeCopy;
      if (oCaption !== (openTask.caption ?? "")) updates.caption = oCaption;
      // Number of Creatives — applies to the Design role's task only.
      if (editingTaskRole === "design") {
        const current = (openTask as any).creativesRequired ?? null;
        const trimmed = editCreativesRequired.trim();
        const next =
          trimmed === ""
            ? null
            : Math.max(1, Math.min(99, parseInt(trimmed, 10) || 0));
        if (next !== current) {
          if (next === null) updates.clearCreativesRequired = true;
          else updates.creativesRequired = next;
        }
      }
      if (Object.keys(updates).length > 0) {
        await updateTask({ taskId: openTask._id, ...updates });
        toast("success", "Task updated");
      } else {
        toast("info", "No changes to save");
      }
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to save"
      );
    } finally {
      setOSaving(false);
    }
  }

  // Universal deliverable-submit helper for the Copy tab.
  //   "tl" → normal team-lead review path
  //   "bm" → skip team lead, route directly to brand manager
  //   "as" → skip both, route directly to the task's assignor
  // Saves the parent task first so the latest Creative Copy + Caption are
  // captured in the deliverable message.
  async function handleSubmitCopyDeliverable(to: "tl" | "bm" | "as") {
    setSubmittingTo(to);
    try {
      await handleSave();
      const msg = [
        editCreativeCopy?.trim() ? `**Creative Copy:**\n${editCreativeCopy.trim()}` : "",
        editCaption?.trim() ? `**Caption:**\n${editCaption.trim()}` : "",
      ].filter(Boolean).join("\n\n");
      if (to === "tl") {
        await submitDeliverable({ taskId: task._id, message: msg });
        toast("success", "Sent to Team Lead for review");
      } else if (to === "bm") {
        await submitDirectToManager({ taskId: task._id, message: msg });
        toast("success", "Sent directly to Brand Manager");
      } else {
        await submitDirectToAssignor({ taskId: task._id, message: msg });
        toast("success", "Sent directly to Assignor");
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmittingTo(null);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await addAttachment({
        parentType: "task",
        parentId: task._id,
        fileId: storageId,
        fileName: file.name,
        fileType: file.type,
      });
      toast("success", "File uploaded");
    } catch (err) {
      toast("error", "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const si = statusInfo(task.status);

  const isViewingLinkedChild = !!task.parentTaskId;

  // Sidebar layout flags derived from openTaskId.
  //  viewingMain  → render the entry overview (Main view).
  //  editingTaskMode → render the per-team task editor (replaces Main).
  // The legacy drill-into-child mode (isViewingLinkedChild) keeps the
  // historical full-form layout so direct child URLs don't regress.
  const viewingMain = !isViewingLinkedChild && openTaskId === null && !creatingNew;
  const editingTaskMode = openTaskId !== null || creatingNew;
  const editingParent = openTaskId === task._id;

  // Role of the task being edited in the drill-in view. Used to pick the
  // header label ("Design Team" vs "Copy Team") and to gate role-specific
  // fields (Creative Copy / Caption are Copy-only; Number of Creatives is
  // a Design field).
  const taskMeta = task as any;
  const editingTaskRole: "copy" | "design" | null = (() => {
    if (creatingNew || !openTaskId) return null;
    if (taskMeta.designTaskId && openTaskId === taskMeta.designTaskId) return "design";
    if (taskMeta.copyTaskId && openTaskId === taskMeta.copyTaskId) return "copy";
    const lt = (linkedTasks ?? []).find((l: any) => l._id === openTaskId) as any;
    if (lt?.role === "design") return "design";
    if (lt?.role === "copy") return "copy";
    return null;
  })();
  const editingRoleLabel =
    editingTaskRole === "design" ? "Design Team" : "Copy Team";

  // Upstream content propagation: the first team (parent if it has a real
  // assignee, else linkedTasks[0]) owns the Creative Copy / Caption. When
  // we're editing a downstream task we show those upstream fields read-only
  // (live-read; Convex reactivity keeps it in sync as the upstream team
  // edits and submits).
  const upstreamInfo = useMemo(() => {
    const parent = parentEntryDetail?.task ?? null;
    const parentHasRealAssignee = isViewingLinkedChild && parent
      ? !!parent.assigneeId && parent.assigneeId !== parent.assignedBy
      : !!task.assigneeId && task.assigneeId !== task.assignedBy;

    let firstTask: any = null;
    let firstTaskLabel = "Copy";
    if (isViewingLinkedChild) {
      if (parentHasRealAssignee && parent) {
        firstTask = parent;
        firstTaskLabel = "Copy";
      } else if (linkedTasks && linkedTasks.length > 0) {
        const lt = linkedTasks[0] as any;
        firstTask = lt;
        firstTaskLabel = lt.teamName ?? "Copy";
      }
    } else if (parentHasRealAssignee) {
      firstTask = task;
      firstTaskLabel = "Copy";
    } else if (linkedTasks && linkedTasks.length > 0) {
      const lt = linkedTasks[0] as any;
      firstTask = lt;
      firstTaskLabel = lt.teamName ?? "Copy";
    }

    const isFirstTeam = firstTask ? firstTask._id === task._id : true;
    return { upstream: isFirstTeam ? null : firstTask, label: firstTaskLabel, isFirstTeam };
  }, [task, linkedTasks, parentEntryDetail, isViewingLinkedChild]);

  function upstreamStatusBadge(statusValue?: string) {
    const map: Record<string, { label: string; bg: string; fg: string }> = {
      pending: { label: "Pending", bg: "#fef3c7", fg: "#92400e" },
      "in-progress": { label: "In Progress", bg: "#dbeafe", fg: "#1e40af" },
      review: { label: "In Review", bg: "#fae8ff", fg: "#86198f" },
      done: { label: "Approved", bg: "#dcfce7", fg: "#166534" },
      "on-hold": { label: "On Hold", bg: "#f3f4f6", fg: "#374151" },
    };
    return map[statusValue ?? "pending"] ?? map.pending;
  }

  return (
    <div className="w-[360px] shrink-0 bg-white flex flex-col overflow-hidden">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          {isViewingLinkedChild && onSelectTask && task.parentTaskId && (
            <button
              type="button"
              onClick={() => onSelectTask(task.parentTaskId as string)}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
              title="Back to parent entry"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </button>
          )}
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: si.color }} />
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] truncate">
            {isViewingLinkedChild
              ? selfLinked?.teamName ??
                (selfLinked?.role === "copy"
                  ? "Copy Team"
                  : selfLinked?.role === "design"
                    ? "Design Team"
                    : "Team Task")
              : "Entry Details"}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {isEditable && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-50 transition-colors"
              title="Delete entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* No tab strip — navigation is via the role cards on the Main view
            (cards open per-team editors; back arrow inside the editor
            returns to Main). */}

        {/* ── Main view: dynamic role cards ── */}
        {viewingMain && (() => {
          // Build the cards array: parent (when it has a real assignee) +
          // all linked children. Each card opens the per-team editor.
          //
          // Card labels honour the entry's schema (see classifyCalendarEntry
          // in convex/contentCalendar.ts). For legacy entries the linked
          // child is "Copy" and the parent is "Design" — without this hint
          // the parent would mislabel as "Copy" and the child would inherit
          // its userTeams team name (e.g. "Copy Team"), confusing admins.
          const cards: Array<{
            taskId: Id<"tasks">;
            label: string;
            assigneeName?: string;
            assigneeDesignation?: string;
            accent: string;
          }> = [];

          const parentHasRealAssignee =
            !!task.assigneeId && task.assigneeId !== task.assignedBy;
          // parentRole — prefer the calendar query's own classifier result
          // (copyTaskId / designTaskId on the task), which is populated even
          // when there are no linked children (the design-first case where
          // someone assigns a designer directly to the parent entry).
          // Fall back to linkedTasks[0].parentRole then "copy".
          const taskAny = task as any;
          const parentRole: "copy" | "design" =
            taskAny.designTaskId && taskAny.designTaskId === task._id
              ? "design"
              : taskAny.copyTaskId && taskAny.copyTaskId === task._id
                ? "copy"
                : ((linkedTasks?.[0] as any)?.parentRole ?? "copy");

          // One card per role. A role owned by an assigned task (the parent,
          // for legacy entries where Copy lives on the entry itself) is the
          // single source of truth — a stray unassigned linked child for the
          // same role must NOT be surfaced as a separate editable task
          // (that's the "ROLES says Ananya / Linked Task says Unassigned"
          // mismatch). Unassigned children are still shown when their role
          // has no other (assigned) owner, so it can still be assigned.
          const seen = new Set<string>();
          const normRole = (s: string) =>
            s.toLowerCase().replace(/\s*team\s*$/i, "").trim();

          if (parentHasRealAssignee) {
            const parentLabel =
              parentRole === "design" ? "Design" : "Copy";
            seen.add(normRole(parentLabel));
            cards.push({
              taskId: task._id as Id<"tasks">,
              label: parentLabel,
              assigneeName: task.assigneeName,
              assigneeDesignation: task.assigneeDesignation,
              accent: parentRole === "design" ? "#8b5cf6" : "#3b82f6",
            });
          }

          const colors = ["#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#ef4444"];
          let colorIdx = 0;
          for (const lt of (linkedTasks ?? []) as any[]) {
            if (lt._id === task._id) continue;
            // Prefer the semantic role from the classifier; only fall back
            // to teamName / generic labels when the entry is multi-team
            // (createIndividualTaskBrief) and neither side is copy/design.
            let label: string;
            if (lt.role === "copy") label = "Copy";
            else if (lt.role === "design") label = "Design";
            else label = lt.teamName ?? (cards.length === 0 ? "Design" : `Team ${cards.length + 1}`);
            const key = normRole(label);
            // Skip a stray unassigned child whose role is already owned by
            // an assigned task (the orphan-duplicate that caused the
            // ROLES vs Linked-Task contradiction).
            if (!lt.assigneeId && seen.has(key)) continue;
            seen.add(key);
            cards.push({
              taskId: lt._id,
              label,
              assigneeName: lt.assigneeName,
              assigneeDesignation: lt.assigneeDesignation,
              accent: colors[colorIdx++ % colors.length],
            });
          }

          return (
            <div className="space-y-2">
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block">
                Roles
              </label>
              {cards.length === 0 && (
                <p className="text-[11px] text-amber-700 italic px-2.5 py-2 rounded-md bg-amber-50 border border-amber-200">
                  No teams assigned yet.
                </p>
              )}
              {cards.map((c) => (
                <button
                  key={c.taskId}
                  type="button"
                  onClick={() => {
                    // Parent task → open in-place editor inside this sidebar.
                    // Child task → drill into it via onSelectTask (sidebar
                    // swaps to that child's full editor where every field
                    // already binds to that task naturally).
                    setCreatingNew(false);
                    if (c.taskId === task._id) {
                      setOpenTaskId(task._id as Id<"tasks">);
                    } else if (onSelectTask) {
                      onSelectTask(c.taskId as string);
                    } else {
                      setOpenTaskId(c.taskId);
                    }
                  }}
                  className="w-full text-left p-2.5 rounded-lg border border-[var(--border-subtle)] bg-white hover:border-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.accent }} />
                      <span className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                        {/* Avoid doubling: a label resolved from userTeams
                            (e.g. "Copy Team") already ends with "Team", so
                            only append the suffix to bare role names. */}
                        {c.label}
                        {/\bteam\s*$/i.test(c.label) ? "" : " Team"}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--accent-admin)]">Open →</span>
                  </div>
                  {c.assigneeName ? (
                    <p className="text-[12px] text-[var(--text-primary)] truncate">
                      {c.assigneeName}
                      {c.assigneeDesignation ? (
                        <span className="text-[var(--text-muted)]"> · {c.assigneeDesignation}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-700">Not assigned</p>
                  )}
                </button>
              ))}
              {isEditable && (
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNew(true);
                    setOpenTaskId(null);
                  }}
                  className="w-full text-left p-2.5 rounded-lg border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-admin)] hover:text-[var(--accent-admin)] transition-colors text-[12px] font-medium"
                >
                  + Add team task
                </button>
              )}

              {/* Brief Info chips — brand / brief type / manager. Surfaces
                  the metadata an admin filled in when the entry was created
                  through the multi-team brief form. */}
              {(briefMeta?.brand?.name || briefMeta?.briefType || briefMeta?.manager) && (
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {briefMeta?.brand?.name && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {briefMeta.brand.name}
                    </span>
                  )}
                  {briefMeta?.briefType && briefMeta.briefType !== "content_calendar" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-100">
                      {briefMeta.briefType === "video_editing" ? "Video Editing"
                        : briefMeta.briefType === "single_task" ? "Single Task"
                        : briefMeta.briefType.replace(/_/g, " ")}
                    </span>
                  )}
                  {briefMeta?.manager?.name && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                      Manager: {briefMeta.manager.name}
                    </span>
                  )}
                </div>
              )}

              {/* Submitted Creative Copy + Caption preview (read-only here;
                  edit inside the relevant team tab) */}
              {task.creativeCopy?.trim() && (
                <div className="pt-2">
                  <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                    Creative Copy
                  </label>
                  <p className="text-[12px] text-[var(--text-primary)] whitespace-pre-wrap p-2.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                    {task.creativeCopy}
                  </p>
                </div>
              )}
              {task.caption?.trim() && (
                <div>
                  <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                    Caption
                  </label>
                  <p className="text-[12px] text-[var(--text-primary)] whitespace-pre-wrap p-2.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                    {task.caption}
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Back-arrow header — only when an in-place team-task editor or the
            create-new form is active. Drilled-into-child mode (legacy) keeps
            its own back arrow in the sidebar header. */}
        {!isViewingLinkedChild && editingTaskMode && (
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => {
                setOpenTaskId(null);
                setCreatingNew(false);
              }}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-colors"
              title="Back to entry"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </button>
            <h4 className="font-semibold text-[13px] text-[var(--text-primary)]">
              {creatingNew ? "New team task" : editingRoleLabel}
            </h4>
          </div>
        )}

        {/* Create-new team task form — only when the user clicked
            "+ Add team task" on Main. Spawns a linked child via
            createLinkedCalendarTask. */}
        {!isViewingLinkedChild && creatingNew && (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--text-muted)]">
              Pick a team and the person who will own the task. After creating it, click the card on the entry view to fill in the rest.
            </p>
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Team
              </label>
              <select
                value={oTeam}
                onChange={(e) => {
                  setOTeam(e.target.value);
                  setOAssignee("");
                }}
                disabled={!isEditable}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-50"
              >
                <option value="">Select team</option>
                {teams.map((team: any) => (
                  <option key={team._id} value={team._id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Assignee
              </label>
              <select
                value={oAssignee}
                onChange={(e) => setOAssignee(e.target.value)}
                disabled={!isEditable}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-50"
              >
                <option value="">Select member</option>
                {(oTeam && oTeamMembers ? oTeamMembers : employees).map((emp: any) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name ?? emp.email}
                    {emp.designation ? ` - ${emp.designation}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Deadline
              </label>
              <input
                type="date"
                value={oDeadline}
                onChange={(e) => setODeadline(e.target.value)}
                disabled={!isEditable}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-50"
              />
            </div>
            {editingTaskRole === "design" && (
              <div>
                <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                  Number of Creatives
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={editCreativesRequired}
                  onChange={(e) => setEditCreativesRequired(e.target.value)}
                  disabled={!isEditable}
                  placeholder="e.g. 4"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] disabled:opacity-50"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Shows on this design assignee's task as "X / N creatives required" with separate deliverable slots.
                </p>
              </div>
            )}
            {isEditable && (
              <button
                type="button"
                disabled={oSaving || !oAssignee || (creatingNew && !oTeam)}
                onClick={() => {
                  const teamLabel = (teams.find((t: any) => t._id === oTeam)?.name as string | undefined) ?? "Team";
                  handleSaveOpenTask(teamLabel);
                }}
                className="w-full px-3 py-2 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {oSaving ? "Creating…" : "Create team task"}
              </button>
            )}
          </div>
        )}

        {/* Title — entry-level (Main view + linked-child drill-down) */}
        {viewingMain && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Title
            </label>
            {isEditable ? (
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
            ) : (
              <p className="text-[13px] text-[var(--text-primary)] font-medium">
                {task.title}
              </p>
            )}
          </div>
        )}

        {/* Description — entry-level */}
        {viewingMain && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Description
            </label>
            {isEditable ? (
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                placeholder="Add description..."
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-none"
              />
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                {task.description || "No description"}
              </p>
            )}
          </div>
        )}

        {/* Creative Copy — editable for the first team, read-only upstream
            display for any downstream team. Hidden when the editor is the
            Design role (which doesn't author copy). */}
        {(isViewingLinkedChild || editingTaskMode) && editingTaskRole !== "design" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide">
                Creative Copy
              </label>
              {!upstreamInfo.isFirstTeam && upstreamInfo.upstream && (() => {
                const b = upstreamStatusBadge(upstreamInfo.upstream.status);
                return (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold"
                    style={{ backgroundColor: b.bg, color: b.fg }}
                  >
                    From {upstreamInfo.label} · {b.label}
                  </span>
                );
              })()}
            </div>
            {upstreamInfo.isFirstTeam ? (
              isEditable ? (
                <textarea
                  value={editCreativeCopy}
                  onChange={(e) => setEditCreativeCopy(e.target.value)}
                  rows={3}
                  placeholder="Add creative copy..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-none"
                />
              ) : (
                <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
                  {task.creativeCopy || "No creative copy"}
                </p>
              )
            ) : (
              <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap p-2.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                {upstreamInfo.upstream?.creativeCopy?.trim() || (
                  <span className="text-[var(--text-muted)] italic text-[12px]">
                    Waiting on the {upstreamInfo.label} team to submit creative copy.
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Caption — same upstream-pass-through rule as Creative Copy.
            Hidden when editing the Design role. */}
        {(isViewingLinkedChild || editingTaskMode) && editingTaskRole !== "design" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide">
                Caption
              </label>
              {!upstreamInfo.isFirstTeam && upstreamInfo.upstream && (() => {
                const b = upstreamStatusBadge(upstreamInfo.upstream.status);
                return (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold"
                    style={{ backgroundColor: b.bg, color: b.fg }}
                  >
                    From {upstreamInfo.label} · {b.label}
                  </span>
                );
              })()}
            </div>
            {upstreamInfo.isFirstTeam ? (
              isEditable ? (
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={3}
                  placeholder="Add caption..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-none"
                />
              ) : (
                <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
                  {task.caption || "No caption"}
                </p>
              )
            ) : (
              <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap p-2.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                {upstreamInfo.upstream?.caption?.trim() || (
                  <span className="text-[var(--text-muted)] italic text-[12px]">
                    Waiting on the {upstreamInfo.label} team to submit caption.
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Reference Links — entry-level, lives on Main view (shared across
            all teams). Hidden inside team-task editors. */}
        {viewingMain && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Reference Links
            </label>
            {isEditable && user?.role === "admin" && (
              <button
                onClick={() => setShowLinkInput(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-admin)] hover:underline"
              >
                <Plus className="h-3 w-3" />
                Add Link
              </button>
            )}
          </div>
          {showLinkInput && (
            <div className="flex gap-1.5 mb-2">
              <input
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLink(); } }}
                placeholder="https://..."
                autoFocus
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
              />
              <button
                onClick={handleAddLink}
                className="px-2 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[11px] font-medium hover:opacity-90"
              >
                Add
              </button>
              <button
                onClick={() => { setShowLinkInput(false); setNewLink(""); }}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {refLinks.map((link, idx) => (
              <div key={idx} className="flex items-center gap-1.5 group">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--bg-hover)] text-[11px] text-[var(--accent-admin)] hover:underline flex-1 min-w-0"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link}</span>
                </a>
                {isEditable && user?.role === "admin" && (
                  <button
                    onClick={() => handleRemoveLink(idx)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {refLinks.length === 0 && !showLinkInput && (
              <p className="text-[11px] text-[var(--text-muted)]">No reference links added</p>
            )}
          </div>
        </div>
        )}

        {/* Platform + Content Type — entry-level (Main view + drill-down) */}
        {viewingMain && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Platform
            </label>
            {isEditable ? (
              <select
                value={editPlatform}
                onChange={(e) => setEditPlatform(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              >
                <option value="">-</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-[var(--text-primary)]">
                {task.platform ?? "-"}
              </p>
            )}
          </div>
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Content Type
            </label>
            {isEditable ? (
              <select
                value={editContentType}
                onChange={(e) => setEditContentType(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              >
                <option value="">-</option>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-[var(--text-primary)]">
                {task.contentType ?? "-"}
              </p>
            )}
          </div>
        </div>
        )}

        {/* Go Live Date + Status side-by-side — entry-level */}
        {viewingMain && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Go Live Date
              </label>
              {isEditable ? (
                <input
                  type="date"
                  value={editPostDate}
                  onChange={(e) => setEditPostDate(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              ) : (
                <p className="text-[13px] text-[var(--text-primary)]">
                  {task.postDate
                    ? formatPostDate(task.postDate).display
                    : "-"}
                </p>
              )}
            </div>
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Status
              </label>
              {(isEditable || (user && task.assigneeId === user._id)) ? (
                <select
                  value={task.status}
                  onChange={(e) =>
                    updateTaskStatus({
                      taskId: task._id,
                      newStatus: e.target.value,
                    }).catch((err: any) =>
                      toast(
                        "error",
                        err instanceof Error ? err.message : "Failed to update status"
                      )
                    )
                  }
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant="neutral">{si.label}</Badge>
              )}
            </div>
          </div>
        )}

        {/* Post Title + Description — the CLIENT-FACING copy for this entry.
            The client portal calendar shows these instead of the raw internal
            title, keeping the client view clean. Entry-level only. */}
        {viewingMain && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 flex flex-col gap-2.5">
            <p className="font-medium text-[11px] text-[var(--accent-admin)] uppercase tracking-wide">
              Client Portal Display
            </p>
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Post Title
              </label>
              {isEditable ? (
                <input
                  value={editPostTitle}
                  onChange={(e) => setEditPostTitle(e.target.value)}
                  placeholder="Shown to the client instead of the internal title"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              ) : (
                <p className="text-[13px] text-[var(--text-primary)]">
                  {(task as any).postTitle || "-"}
                </p>
              )}
            </div>
            <div>
              <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
                Post Description
              </label>
              {isEditable ? (
                <textarea
                  value={editPostDescription}
                  onChange={(e) => setEditPostDescription(e.target.value)}
                  rows={3}
                  placeholder="Client-facing description for this post..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] resize-none"
                />
              ) : (
                <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">
                  {(task as any).postDescription || "-"}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Request Changes — entry-level. Reopens the parent calendar
            task when it has been marked done. */}
        {viewingMain && task.status === "done" && (
          <RequestChangesControl
            taskId={task._id}
            currentDeadlineMs={task.deadline ?? null}
          />
        )}

        {/* Number of creatives — only when the entry has a design task
            (modern split or design-first parent). Writes to the design
            task so the design assignee sees "X / N creatives" on their
            task. */}
        {viewingMain && (task as any).designTaskId && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Number of Creatives
            </label>
            {isEditable ? (
              <>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={editCreativesRequired}
                  onChange={(e) => setEditCreativesRequired(e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Shows on the design assignee's task as "X / N creatives required" with separate deliverable slots.
                </p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-primary)]">
                {(task as any).designCreativesRequired ?? "-"}
              </p>
            )}
          </div>
        )}

        {/* Assignor field removed — every calendar task's assignor is the
            brand manager (auto-set by createCalendarEntry / createLinkedCalendarTask
            / createIndividualTaskBrief). The Brief Info "Manager" chip on
            Main view already surfaces who that is. */}

        {/* Team filter → Assignee — Copy tab */}
        {(isViewingLinkedChild || editingTaskMode) && isEditable && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Team
            </label>
            <select
              value={sidebarTeamFilter}
              onChange={(e) => {
                teamFilterTouched.current = true;
                setSidebarTeamFilter(e.target.value);
                setEditAssignee(""); // Reset assignee when team changes
              }}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">All Teams</option>
              {teams.map((team: any) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(isViewingLinkedChild || editingTaskMode) && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              {isViewingLinkedChild
                ? "Assignee"
                : ((linkedTasks?.[0] as any)?.parentRole === "design"
                    ? "Design Assignee"
                    : "Copy Assignee")}
            </label>
            {isEditable ? (
              (() => {
                const options: any[] =
                  sidebarTeamFilter && sidebarTeamMembers
                    ? sidebarTeamMembers
                    : employees;
                // The task's current assignee must always be a visible option
                // — otherwise an assignee outside this list (e.g. an admin
                // like a Content Head) silently renders as "Unassigned".
                const hasCurrent =
                  !task.assigneeId ||
                  options.some((o: any) => o._id === task.assigneeId);
                return (
                  <select
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">Unassigned</option>
                    {!hasCurrent && (
                      <option value={task.assigneeId}>
                        {task.assigneeName ?? "Current assignee"}
                        {task.assigneeDesignation ? ` - ${task.assigneeDesignation}` : ""}
                      </option>
                    )}
                    {options.map((emp: any) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.name ?? emp.email}
                        {emp.designation ? ` - ${emp.designation}` : ""}
                      </option>
                    ))}
                  </select>
                );
              })()
            ) : (
              <div>
                <p className="text-[13px] text-[var(--text-primary)]">
                  {task.assigneeName}
                </p>
                {task.assigneeDesignation && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {task.assigneeDesignation}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sibling team tasks on the same entry. Creating new team tasks
            happens on the entry's Main view ("+ Add team task"), which
            wires the sequential handoff chain for any team. */}
        {isViewingLinkedChild && isEditable && (
          <div className="pt-3 border-t border-[var(--border)]">
            <p className="text-[10px] text-[var(--text-muted)]">
              Teams work this entry in sequence — an approved deliverable is
              passed to the next team&apos;s task automatically. Add teams from
              the entry view.
            </p>
            {linkedTasks && linkedTasks.filter((lt: any) => lt._id !== task._id).length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase">Linked tasks</p>
                {linkedTasks
                  .filter((lt: any) => lt._id !== task._id)
                  .map((lt: any) => (
                    <div
                      key={lt._id}
                      className="flex items-center gap-1.5 min-w-0 group/row rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTask?.(lt._id)}
                        className="flex-1 min-w-0 text-left p-1 rounded-md disabled:cursor-not-allowed"
                        disabled={!onSelectTask}
                        title={onSelectTask ? "Open this linked task to edit it" : ""}
                      >
                        <p className="text-[11px] text-[var(--text-secondary)] truncate hover:text-[var(--accent-admin)]">
                          · {lt.title}
                        </p>
                        {lt.assigneeName && (
                          <p className="text-[10px] text-[var(--text-muted)] ml-2.5">
                            Assigned to: <span className="font-medium text-[var(--text-secondary)]">{lt.assigneeName}</span>
                            {lt.assigneeDesignation ? ` - ${lt.assigneeDesignation}` : ""}
                          </p>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={deletingLinkedId === lt._id}
                        title="Remove linked task"
                        onClick={async () => {
                          if (
                            !confirm(
                              `Remove linked task "${lt.title}"? This cannot be undone.`
                            )
                          )
                            return;
                          setDeletingLinkedId(lt._id);
                          try {
                            await removeLinkedTask({ taskId: lt._id });
                            toast("success", "Linked task removed");
                          } catch (err) {
                            toast(
                              "error",
                              err instanceof Error
                                ? err.message
                                : "Failed to remove task"
                            );
                          } finally {
                            setDeletingLinkedId(null);
                          }
                        }}
                        className="p-1 rounded-md shrink-0 text-[var(--text-muted)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        {deletingLinkedId === lt._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Assigned At — Copy tab */}
        {(isViewingLinkedChild || editingTaskMode) && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Assigned At
            </label>
            <p className="text-[13px] text-[var(--text-primary)]">
              {task.assignedAt
                ? new Date(task.assignedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Not yet assigned"}
            </p>
          </div>
        )}

        {/* Deadline — Copy tab */}
        {(isViewingLinkedChild || editingTaskMode) && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Deadline
            </label>
            {isEditable ? (
              <input
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
            ) : (
              <p className="text-[13px] text-[var(--text-primary)]">
                {(() => {
                  const dl = effectiveDeadlineMs(task);
                  return dl != null
                    ? new Date(dl).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "No deadline";
                })()}
              </p>
            )}
          </div>
        )}

        {/* Status — Copy tab */}
        {(isViewingLinkedChild || editingTaskMode) && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Status
            </label>
            {(isEditable || (user && task.assigneeId === user._id)) ? (
              <select
                value={task.status}
                onChange={(e) =>
                  updateTaskStatus({
                    taskId: task._id,
                    newStatus: e.target.value,
                  }).catch((err: any) =>
                    toast(
                      "error",
                      err instanceof Error
                        ? err.message
                        : "Failed to update status"
                    )
                  )
                }
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <Badge variant="neutral">{si.label}</Badge>
            )}
          </div>
        )}

        {/* Request Changes — appears whenever this Copy / Design task is
            done. Reopens the task, captures the iteration count, and
            prompts for a new deadline. */}
        {(isViewingLinkedChild || editingTaskMode) && task.status === "done" && (
          <div>
            <RequestChangesControl
              taskId={task._id}
              currentDeadlineMs={task.deadline ?? null}
            />
          </div>
        )}

        {/* Auto-Handoff UI removed per design refinement — the schema field
            `handoffTargetTeamId` still drives the post-approval chain in
            createIndividualTaskBrief, but admins no longer pick it here. */}

        {/* ── Deliverable Submission — Copy tab ──────── */}
        {(isViewingLinkedChild || editingTaskMode) && task.assigneeId && (task.status === "in-progress" || task.status === "pending") && (
          <div className="pt-3 border-t border-[var(--border)]">
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-2">
              Submit Deliverable
            </label>
            {(!editCreativeCopy?.trim() && !editCaption?.trim()) ? (
              <p className="text-[11px] text-[var(--text-muted)] italic">
                Fill in Creative Copy or Caption above to enable submission.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  disabled={submittingTo === "tl"}
                  onClick={() => handleSubmitCopyDeliverable("tl")}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {submittingTo === "tl" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send to Team Lead
                </button>
                <button
                  disabled={submittingTo === "bm"}
                  onClick={() => handleSubmitCopyDeliverable("bm")}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  {submittingTo === "bm" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send to Brand Manager
                </button>
                {task.assignedBy && task.assignedBy !== user?._id && (
                  <button
                    disabled={submittingTo === "as"}
                    onClick={() => handleSubmitCopyDeliverable("as")}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {submittingTo === "as" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send to Assignor
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Approval Status — Copy tab ──────── */}
        {(isViewingLinkedChild || editingTaskMode) && deliverables && deliverables.length > 0 && (
          <div className="pt-3 border-t border-[var(--border)]">
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-2">
              Approval Status
            </label>
            <div className="flex flex-col gap-2">
              {[...deliverables].sort((a: any, b: any) => b.submittedAt - a.submittedAt).map((d: any) => {
                const tlStatus = d.teamLeadStatus;
                const bmStatus = d.status;
                const isPassed = !!d.passedToManagerAt;
                return (
                  <div key={d._id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[var(--text-muted)]">
                        {new Date(d.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {/* Team Lead status */}
                    <div className="flex items-center gap-1.5">
                      {tlStatus === "approved" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : tlStatus === "changes_requested" ? (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span className="text-[11px] font-medium text-[var(--text-primary)]">
                        Team Lead: {tlStatus === "approved" ? "Approved" : tlStatus === "changes_requested" ? "Changes Requested" : "Pending"}
                      </span>
                    </div>
                    {d.teamLeadReviewNote && (
                      <p className="text-[10px] text-[var(--text-secondary)] pl-5 italic">
                        {d.teamLeadReviewNote}
                      </p>
                    )}
                    {/* Brand Manager status */}
                    {isPassed && (
                      <div className="flex items-center gap-1.5">
                        {bmStatus === "approved" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : bmStatus === "rejected" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span className="text-[11px] font-medium text-[var(--text-primary)]">
                          Brand Manager: {bmStatus === "approved" ? "Approved" : bmStatus === "rejected" ? "Changes Requested" : "Pending"}
                        </span>
                      </div>
                    )}
                    {d.reviewNote && (
                      <p className="text-[10px] text-[var(--text-secondary)] pl-5 italic">
                        {d.reviewNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Save button — shown on Main view, when editing the parent in-place,
            and in legacy drill-into-child mode. The create-new flow has its
            own dedicated "Create team task" button. */}
        {isEditable && !creatingNew && (viewingMain || editingParent || isViewingLinkedChild) && (
          <Button
            variant="primary"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}

        {/* Files section — Copy tab */}
        {(isViewingLinkedChild || editingTaskMode) && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide">
              Files ({attachments?.length ?? 0})
            </h4>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-admin)] hover:underline disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="h-3 w-3" />
              )}
              {isUploading ? "Uploading..." : "Attach file"}
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {attachments?.map((att: any) => (
              <div
                key={att._id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] group"
              >
                <Paperclip className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                    {att.fileName}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {att.uploaderName}
                    {att.uploaderDesignation
                      ? ` - ${att.uploaderDesignation}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {att.url && (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-admin)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {(att.uploadedBy === user?._id ||
                    user?.role === "admin") && (
                    <button
                      onClick={() =>
                        deleteAttachment({ attachmentId: att._id })
                      }
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {attachments?.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">
                No files attached.
              </p>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline "Request Changes" control for a done calendar task.
 *
 * Surfaced wherever a content-calendar task (parent entry or a Copy/Design
 * child) is shown as completed. Clicking the button expands a small panel
 * that captures a required note and an optional new deadline (required if
 * the existing deadline is already past), then calls `requestTaskRedo` —
 * which reopens the task to in-progress, increments `changesCount`, and
 * rejects the latest deliverable so it re-flows through approvals.
 *
 * Visibility is server-gated by `canRequestRedo`; the button is hidden
 * outright for viewers who can't actually request a redo (avoids the
 * silent-failure case).
 */
function RequestChangesControl({
  taskId,
  currentDeadlineMs,
}: {
  taskId: Id<"tasks">;
  currentDeadlineMs: number | null | undefined;
}) {
  const { toast } = useToast();
  const canRedo = useQuery(api.tasks.canRequestRedo, { taskId });
  const requestTaskRedo = useMutation(api.tasks.requestTaskRedo);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!canRedo) return null;

  const deadlinePast =
    currentDeadlineMs != null && currentDeadlineMs < Date.now();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
        title="Reopen this task and send it back for changes"
      >
        <RotateCcw className="h-3 w-3" />
        Request Changes
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
        <p className="text-[12px] font-semibold text-amber-800">
          Request changes
        </p>
      </div>
      <p className="text-[11px] text-amber-700">
        Reopens this task (status returns to In Progress), pushes the latest
        deliverable back through approvals, and counts as one more iteration.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why does this need to be redone? (required)"
        rows={2}
        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-amber-500"
        autoFocus
      />
      <div>
        <label className="text-[11px] font-medium text-amber-800 block mb-1">
          New deadline
          {deadlinePast ? " (required, old deadline has passed)" : " (optional)"}
        </label>
        <input
          type="date"
          value={newDeadline}
          onChange={(e) => setNewDeadline(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        {deadlinePast && !newDeadline && (
          <p className="text-[10px] text-amber-700 mt-1">
            The old deadline already passed. Set a new one so the assignee
            isn't flagged overdue immediately.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={
            submitting ||
            !note.trim() ||
            (deadlinePast && !newDeadline)
          }
          onClick={async () => {
            if (!note.trim()) return;
            if (deadlinePast && !newDeadline) {
              toast("error", "Set a new deadline. The old one has passed.");
              return;
            }
            setSubmitting(true);
            try {
              await requestTaskRedo({
                taskId,
                note: note.trim(),
                ...(newDeadline
                  ? {
                      newDeadline: new Date(
                        newDeadline + "T23:59:59"
                      ).getTime(),
                    }
                  : {}),
              });
              setOpen(false);
              setNote("");
              setNewDeadline("");
              toast("success", "Changes requested");
            } catch (err) {
              toast(
                "error",
                err instanceof Error
                  ? err.message
                  : "Could not request changes"
              );
            } finally {
              setSubmitting(false);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Send Back for Changes
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNote("");
            setNewDeadline("");
          }}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
