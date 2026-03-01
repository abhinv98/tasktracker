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

interface ContentCalendarViewProps {
  briefId: Id<"briefs">;
  isEditable: boolean;
}

export function ContentCalendarView({
  briefId,
  isEditable,
}: ContentCalendarViewProps) {
  const sheets = useQuery(api.contentCalendar.listSheets, { briefId });
  const allUsers = useQuery(api.users.listAllUsers, {});
  const user = useQuery(api.users.getCurrentUser);
  const createSheet = useMutation(api.contentCalendar.createSheet);
  const deleteSheetMut = useMutation(api.contentCalendar.deleteSheet);
  const createEntry = useMutation(api.contentCalendar.createCalendarEntry);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const deleteTask = useMutation(api.tasks.deleteTask);

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
  const [newDeadline, setNewDeadline] = useState("");

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const currentSheetMonth =
    activeSheet ??
    (sheets && sheets.length > 0 ? sheets[0].month : null);

  const tasks = useQuery(
    api.contentCalendar.listTasksForSheet,
    currentSheetMonth ? { briefId, month: currentSheetMonth } : "skip"
  );

  const employees = (allUsers ?? []).filter(
    (u: any) => u.role === "employee" || u.role === "manager"
  );

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
    if (!newAssignee || !currentSheetMonth) return;
    try {
      await createEntry({
        briefId,
        title: newTitle,
        assigneeId: newAssignee as Id<"users">,
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
          )}
        </div>
      </div>

      {/* Spreadsheet + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Spreadsheet */}
        <div
          className={`flex-1 overflow-auto bg-[var(--bg-primary)] ${selectedTask ? "border-r border-[var(--border)]" : ""}`}
        >
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
                return (
                  <tr
                    key={task._id}
                    onClick={() => setSelectedTaskId(task._id)}
                    className={`border-b border-[var(--border-subtle)] cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--accent-admin-dim)]"
                        : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {pd ? (
                        <div>
                          <span className="text-[12px] font-medium text-[var(--text-primary)]">
                            {pd.display}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] ml-1">
                            {pd.weekday}
                          </span>
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
                        <span className="text-[11px] text-[var(--text-muted)]">
                          —
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
          <DetailSidebar
            task={selectedTask}
            isEditable={isEditable}
            employees={employees}
            onClose={() => setSelectedTaskId(null)}
            updateTask={updateTask}
            updateTaskStatus={updateTaskStatus}
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
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">
                  Assignee
                </label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  required
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Select assignee</option>
                  {employees.map((emp: any) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name ?? emp.email}
                      {emp.designation ? ` — ${emp.designation}` : ""}
                    </option>
                  ))}
                </select>
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

/* ────── Detail Sidebar ────── */
function DetailSidebar({
  task,
  isEditable,
  employees,
  onClose,
  updateTask,
  updateTaskStatus,
  toast,
}: {
  task: any;
  isEditable: boolean;
  employees: any[];
  onClose: () => void;
  updateTask: any;
  updateTaskStatus: any;
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
  const [editDescription, setEditDescription] = useState(
    task.description ?? ""
  );
  const [saving, setSaving] = useState(false);

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
      if (editAssignee && editAssignee !== task.assigneeId)
        updates.assigneeId = editAssignee;
      if (editDeadline) {
        const ts = new Date(editDeadline + "T23:59:59").getTime();
        if (ts !== task.deadline) updates.deadline = ts;
      } else if (task.deadline) {
        updates.clearDeadline = true;
      }

      if (Object.keys(updates).length > 0) {
        await updateTask({ taskId: task._id, ...updates });
        toast("success", "Entry updated");
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
        <h3 className="font-semibold text-[14px] text-[var(--text-primary)] truncate">
          Entry Details
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <X className="h-4 w-4" />
        </button>
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

        {/* Post Date */}
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Post Date
          </label>
          {isEditable ? (
            <input
              type="date"
              value={editPostDate}
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

        {/* Status */}
        <div>
          <label className="font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Status
          </label>
          {isEditable ? (
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

        {/* Assignee */}
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
              {employees.map((emp: any) => (
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
