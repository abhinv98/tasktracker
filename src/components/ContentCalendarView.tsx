"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, useRef } from "react";
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
  { value: "done", label: "Published", color: "#10b981" },
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
}

export function ContentCalendarView({
  briefId,
  isEditable,
  brandId,
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

  const currentSheetMonth =
    activeSheet ??
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
    selectedTaskId && tasks
      ? tasks.find((t: any) => t._id === selectedTaskId)
      : null;

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
            {monthLabel(currentSheetMonth)} — break days (red)
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
            const incomplete = (tasks ?? []).filter((t: any) => !t.assigneeId || !t.deadline);
            const noAssignee = incomplete.filter((t: any) => !t.assigneeId).length;
            const noDeadline = incomplete.filter((t: any) => !t.deadline).length;
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
          <table className="w-full min-w-[900px]">
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
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide w-[150px]">
                  Assignee
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
                          : (!task.assigneeId || !task.deadline)
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
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-[var(--text-primary)]">
                        {task.platform ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-[var(--text-primary)]">
                        {task.contentType ?? "—"}
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
                      {task.assigneeId ? (
                        <div>
                          <span className="text-[12px] text-[var(--text-primary)]">
                            {task.assigneeName}
                          </span>
                          {task.assigneeDesignation && (
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {task.assigneeDesignation}
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
                      {task.deadline ? (
                        <span
                          className={`text-[11px] font-medium ${
                            task.status !== "done" &&
                            task.deadline < Date.now()
                              ? "text-[var(--danger)]"
                              : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {new Date(task.deadline).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" }
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-700 bg-amber-100">
                          No Deadline
                        </span>
                      )}
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
                    colSpan={isEditable ? 8 : 7}
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

        {/* Detail Sidebar */}
        {selectedTask && (
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
            updateTask={updateTask}
            updateTaskStatus={updateTaskStatus}
            deleteTask={deleteTask}
            toast={toast}
          />
        )}
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
                  placeholder="e.g. Instagram Post — Product Launch"
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
              {/* Team → Assignee flow */}
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Team
                </label>
                <select
                  value={newTeamFilter}
                  onChange={(e) => {
                    setNewTeamFilter(e.target.value);
                    setNewAssignee(""); // Reset assignee when team changes
                  }}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">All Teams</option>
                  {(allTeams ?? []).map((team: any) => (
                    <option key={team._id} value={team._id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                    Assignor
                  </label>
                  <select
                    value={newAssignor || (defaultAssignor as string) || ""}
                    onChange={(e) => setNewAssignor(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">Select assignor</option>
                    {admins.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name ?? u.email}
                        {u.designation ? ` — ${u.designation}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                    Assignee
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
                        {emp.designation ? ` — ${emp.designation}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
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
  const [saving, setSaving] = useState(false);
  const [sidebarTeamFilter, setSidebarTeamFilter] = useState<string>("");
  const [submittingTo, setSubmittingTo] = useState<"tl" | "bm" | null>(null);

  // Query team members for sidebar team filter
  const sidebarTeamMembers = useQuery(
    api.teams.getTeamMembers,
    sidebarTeamFilter ? { teamId: sidebarTeamFilter as Id<"teams"> } : "skip"
  );

  // Query deliverables for this task
  const deliverables = useQuery(api.approvals.listDeliverables, { taskId: task._id });
  const submitDeliverable = useMutation(api.approvals.submitDeliverable);
  const submitDirectToManager = useMutation(api.approvals.submitDeliverableDirectToManager);
  const createLinkedCalendarTask = useMutation(api.contentCalendar.createLinkedCalendarTask);

  const calendarEntryTaskId = (task.parentTaskId ?? task._id) as Id<"tasks">;
  const linkedTasks = useQuery(api.contentCalendar.listLinkedTasksForEntry, {
    parentTaskId: calendarEntryTaskId,
  });

  const [showAssignTask, setShowAssignTask] = useState(false);
  const [assignTaskTitle, setAssignTaskTitle] = useState("");
  const [assignTaskTeam, setAssignTaskTeam] = useState("");
  const [assignTaskAssignee, setAssignTaskAssignee] = useState("");
  const [assignTaskDeadline, setAssignTaskDeadline] = useState("");
  const assignTaskMembers = useQuery(
    api.teams.getTeamMembers,
    assignTaskTeam ? { teamId: assignTaskTeam as Id<"teams"> } : "skip"
  );
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [deletingLinkedId, setDeletingLinkedId] = useState<string | null>(null);

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
      if (editAssignee && editAssignee !== task.assigneeId)
        updates.assigneeId = editAssignee;
      if (editAssignor && editAssignor !== task.assignedBy)
        updates.assignedBy = editAssignor;
      if (editDeadline) {
        const ts = new Date(editDeadline + "T23:59:59").getTime();
        if (ts !== task.deadline) updates.deadline = ts;
      } else if (task.deadline) {
        updates.clearDeadline = true;
      }

      if (Object.keys(updates).length > 0) {
        await updateTask({ taskId: task._id, ...updates });
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

  return (
    <div className="w-[360px] shrink-0 bg-white flex flex-col overflow-hidden">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: si.color }} />
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)] truncate">
            Entry Details
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
        {/* Title */}
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

        {/* Description */}
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

        {/* Creative Copy */}
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Creative Copy
          </label>
          {isEditable ? (
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
          )}
        </div>

        {/* Caption */}
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Caption
          </label>
          {isEditable ? (
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
          )}
        </div>

        {/* Reference Links */}
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

        {/* Platform + Content Type */}
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
                <option value="">—</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-[var(--text-primary)]">
                {task.platform ?? "—"}
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
                <option value="">—</option>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-[var(--text-primary)]">
                {task.contentType ?? "—"}
              </p>
            )}
          </div>
        </div>

        {/* Go Live Date */}
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Go Live Date
          </label>
          {isEditable ? (
            <input
              type="date"
              value={editPostDate}
              min={currentSheetMonth ? monthDateBounds(currentSheetMonth).min : undefined}
              max={currentSheetMonth ? monthDateBounds(currentSheetMonth).max : undefined}
              onChange={(e) => setEditPostDate(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            />
          ) : (
            <p className="text-[13px] text-[var(--text-primary)]">
              {task.postDate
                ? formatPostDate(task.postDate).display
                : "—"}
            </p>
          )}
        </div>

        {/* Assignor */}
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Assignor
          </label>
          {isEditable ? (
            <select
              value={editAssignor}
              onChange={(e) => setEditAssignor(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">Select assignor</option>
              {admins.map((u: any) => (
                <option key={u._id} value={u._id}>
                  {u.name ?? u.email}
                  {u.designation ? ` — ${u.designation}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[13px] text-[var(--text-primary)]">
              {task.assignorName ?? "—"}
            </p>
          )}
        </div>

        {/* Team filter → Assignee */}
        {isEditable && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Team
            </label>
            <select
              value={sidebarTeamFilter}
              onChange={(e) => {
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
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Assignee
          </label>
          {isEditable ? (
            <select
              value={editAssignee}
              onChange={(e) => setEditAssignee(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">Unassigned</option>
              {(sidebarTeamFilter && sidebarTeamMembers
                ? sidebarTeamMembers
                : employees
              ).map((emp: any) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name ?? emp.email}
                  {emp.designation ? ` — ${emp.designation}` : ""}
                </option>
              ))}
            </select>
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

        {/* Assign another task (Copy / Design) linked to this calendar entry */}
        {isEditable && (
          <div className="pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setShowAssignTask((v) => !v)}
              className="flex items-center gap-2 text-[12px] font-semibold text-[var(--accent-admin)] hover:underline"
            >
              <Users className="h-3.5 w-3.5" />
              {showAssignTask ? "Hide" : "Assign task to another team"}
            </button>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              e.g. Copy or Design — creates a linked task with Content Calendar + brand context; assignee submits copy from their dashboard.
            </p>
            {linkedTasks && linkedTasks.filter((lt: any) => lt._id !== task._id).length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase">Linked tasks</p>
                {linkedTasks
                  .filter((lt: any) => lt._id !== task._id)
                  .map((lt: any) => (
                    <div
                      key={lt._id}
                      className="flex items-center gap-1.5 min-w-0 group/row"
                    >
                      <p className="text-[11px] text-[var(--text-secondary)] truncate flex-1 min-w-0">
                        · {lt.title}
                      </p>
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
                            await deleteTask({ taskId: lt._id });
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
            {showAssignTask && (
              <div className="mt-3 space-y-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                <div>
                  <label className="text-[10px] font-medium text-[var(--text-muted)] block mb-0.5">Task title</label>
                  <input
                    value={assignTaskTitle}
                    onChange={(e) => setAssignTaskTitle(e.target.value)}
                    placeholder="e.g. Copy review"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--text-muted)] block mb-0.5">Team</label>
                  <select
                    value={assignTaskTeam}
                    onChange={(e) => {
                      setAssignTaskTeam(e.target.value);
                      setAssignTaskAssignee("");
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px]"
                  >
                    <option value="">Select team</option>
                    {teams.map((team: any) => (
                      <option key={team._id} value={team._id}>{team.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--text-muted)] block mb-0.5">Assignee</label>
                  <select
                    value={assignTaskAssignee}
                    onChange={(e) => setAssignTaskAssignee(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px]"
                  >
                    <option value="">Select member</option>
                    {(assignTaskTeam && assignTaskMembers
                      ? assignTaskMembers
                      : employees
                    ).map((emp: any) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.name ?? emp.email}
                        {emp.designation ? ` — ${emp.designation}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--text-muted)] block mb-0.5">Deadline (optional)</label>
                  <input
                    type="date"
                    value={assignTaskDeadline}
                    onChange={(e) => setAssignTaskDeadline(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px]"
                  />
                </div>
                <button
                  type="button"
                  disabled={assignSubmitting || !assignTaskTitle.trim() || !assignTaskAssignee}
                  onClick={async () => {
                    if (!assignTaskTitle.trim() || !assignTaskAssignee) return;
                    setAssignSubmitting(true);
                    try {
                      await createLinkedCalendarTask({
                        briefId,
                        parentTaskId: calendarEntryTaskId,
                        assigneeId: assignTaskAssignee as Id<"users">,
                        title: assignTaskTitle.trim(),
                        ...(assignTaskDeadline
                          ? { deadline: new Date(assignTaskDeadline + "T23:59:59").getTime() }
                          : {}),
                      });
                      toast("success", "Linked task created");
                      setAssignTaskTitle("");
                      setAssignTaskTeam("");
                      setAssignTaskAssignee("");
                      setAssignTaskDeadline("");
                      setShowAssignTask(false);
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Failed");
                    } finally {
                      setAssignSubmitting(false);
                    }
                  }}
                  className="w-full py-2 rounded-lg bg-[var(--accent-admin)] text-white text-[12px] font-medium disabled:opacity-50"
                >
                  {assignSubmitting ? "Creating…" : "Create linked task"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Assigned At */}
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

        {/* Deadline */}
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
              {task.deadline
                ? new Date(task.deadline).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "No deadline"}
            </p>
          )}
        </div>

        {/* Status — both admins and assignees can change */}
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

        {/* Handoff target team (for auto-handoff after approval) */}
        {isEditable && (
          <div>
            <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Auto-Handoff to Team
            </label>
            <select
              value={task.handoffTargetTeamId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                updateTask({
                  taskId: task._id,
                  ...(val ? { handoffTargetTeamId: val } : { clearHandoffTarget: true }),
                }).catch((err: any) =>
                  toast("error", err instanceof Error ? err.message : "Failed to update")
                );
              }}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            >
              <option value="">None (no auto-handoff)</option>
              {teams.map((team: any) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </select>
            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">
              When approved, creative copy auto-sends to this team.
            </p>
          </div>
        )}

        {/* ── Deliverable Submission (Copy Team flow) ──────── */}
        {task.assigneeId && (task.status === "in-progress" || task.status === "pending") && (
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
                  onClick={async () => {
                    setSubmittingTo("tl");
                    try {
                      // Save first if there are changes
                      await handleSave();
                      const msg = [
                        editCreativeCopy?.trim() ? `**Creative Copy:**\n${editCreativeCopy.trim()}` : "",
                        editCaption?.trim() ? `**Caption:**\n${editCaption.trim()}` : "",
                      ].filter(Boolean).join("\n\n");
                      await submitDeliverable({
                        taskId: task._id,
                        message: msg,
                      });
                      toast("success", "Sent to Team Lead for review");
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Failed to submit");
                    } finally {
                      setSubmittingTo(null);
                    }
                  }}
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
                  onClick={async () => {
                    setSubmittingTo("bm");
                    try {
                      await handleSave();
                      const msg = [
                        editCreativeCopy?.trim() ? `**Creative Copy:**\n${editCreativeCopy.trim()}` : "",
                        editCaption?.trim() ? `**Caption:**\n${editCaption.trim()}` : "",
                      ].filter(Boolean).join("\n\n");
                      await submitDirectToManager({
                        taskId: task._id,
                        message: msg,
                      });
                      toast("success", "Sent directly to Brand Manager");
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Failed to submit");
                    } finally {
                      setSubmittingTo(null);
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  {submittingTo === "bm" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send to Brand Manager
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Approval Status ──────────────────────────────── */}
        {deliverables && deliverables.length > 0 && (
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

        {/* Save button */}
        {isEditable && (
          <Button
            variant="primary"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}

        {/* Files section */}
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
                      ? ` — ${att.uploaderDesignation}`
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
      </div>
    </div>
  );
}
