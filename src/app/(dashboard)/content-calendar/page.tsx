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
  done: { bg: "#d1fae5", dot: "#10b981", label: "Published" },
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
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
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

  const { toast } = useToast();

  const user = useQuery(api.users.getCurrentUser);
  const brands = useQuery(api.brands.listBrands);
  const allUsers = useQuery(api.users.listAllUsers);
  const allTeams = useQuery(api.teams.listTeams, {});
  const createBrand = useMutation(api.brands.createBrand);
  const createEntry = useMutation(api.contentCalendar.createEntryForBrand);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const toggleBreakDayMut = useMutation(api.contentCalendar.toggleBreakDay);

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
      const targetDate = over.id as string;
      if (!task || targetDate === task.postDate) return;
      try {
        await updateTask({ taskId: task._id as Id<"tasks">, postDate: targetDate });
        toast("success", "Entry moved");
      } catch (err: any) {
        toast("error", err.message ?? "Failed to move entry");
      }
    },
    [updateTask, toast]
  );

  const selectedTask = selectedTaskId && tasks
    ? tasks.find((t: any) => t._id === selectedTaskId)
    : null;

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
        </div>

        {/* Month Nav + break days (same brief as list view) */}
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Main Content */}
      {!selectedBrandId ? (
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
              <div className="mb-3 px-3 py-3 rounded-lg border border-red-200 bg-red-50/50">
                <p className="text-[11px] text-red-800 mb-2">
                  Click a day to toggle a break. This is the same brand calendar as Briefs → Content Calendar.
                </p>
                {(() => {
                  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                  const cells: (number | null)[] = [];
                  for (let i = 0; i < firstDay; i++) cells.push(null);
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
            {calendarBriefId && (
              <div className="mb-3 px-2 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                <p className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">
                  {MONTHS[month]} {year} — break days (red)
                </p>
                <div className="flex flex-wrap gap-1 max-w-full">
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const d = i + 1;
                    const dateStr = `${monthStr}-${String(d).padStart(2, "0")}`;
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
                  })}
                </div>
              </div>
            )}
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-px mb-px sticky top-0 z-10 bg-white">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center py-2 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide bg-white">
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
                          isDragEnabled={!!isEditable}
                          onClick={() => {
                            setSelectedTaskId(task._id);
                            setPopoverDate(null);
                          }}
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

          {/* Detail Sidebar */}
          {selectedTask && (
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
              updateTask={updateTask}
              updateTaskStatus={updateTaskStatus}
              deleteTask={deleteTask}
              toast={toast}
            />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
        </DragOverlay>
        </DndContext>
      )}

      {/* Add Entry Modal */}
      {addingDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
                Add Entry — Go Live: {new Date(addingDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
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
                  placeholder="e.g. Instagram Post — Product Launch"
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
                      {u.name ?? u.email}{u.designation ? ` — ${u.designation}` : ""}
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
                      {emp.name ?? emp.email}{emp.designation ? ` — ${emp.designation}` : ""}
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
      className={`bg-white min-h-[120px] p-2 flex flex-col transition-colors group relative ${
        isWeekend ? "bg-[#fafafa]" : ""
      } ${isBreakDay ? "ring-2 ring-inset ring-red-400/80 bg-red-50/40" : ""} ${
        isToday ? "ring-2 ring-inset ring-[var(--accent-admin)]" : ""
      } ${isOver ? "!bg-[var(--accent-admin-dim)] ring-2 ring-inset ring-[var(--accent-admin)]" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[12px] font-medium ${
            isToday
              ? "bg-[var(--accent-admin)] text-white w-6 h-6 rounded-full flex items-center justify-center"
              : isBreakDay
                ? "bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center"
                : "text-[var(--text-secondary)]"
          }`}
        >
          {day}
        </span>
        {isEditable && (
          <button
            onClick={onAddClick}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--bg-hover)] transition-all"
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
  onClick,
}: {
  task: any;
  isSelected: boolean;
  isDragEnabled: boolean;
  onClick: () => void;
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
        onClick();
      }}
      className={`w-full text-left px-1.5 py-1 rounded-md text-[10px] leading-tight transition-all hover:shadow-sm ${
        isSelected ? "outline outline-2 outline-[var(--accent-admin)] shadow-sm" : ""
      } ${isDragging ? "opacity-30" : ""} ${isDragEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
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

