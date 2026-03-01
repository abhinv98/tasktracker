"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, useToast } from "@/components/ui";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";

const PLATFORMS = ["Instagram", "Facebook", "Twitter/X", "LinkedIn", "YouTube", "TikTok", "Pinterest", "Other"];
const CONTENT_TYPES = ["Post", "Reel", "Story", "Carousel", "Video", "Blog", "Newsletter", "Other"];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planned: { label: "Planned", color: "#6b7280" },
  in_progress: { label: "In Progress", color: "#f59e0b" },
  review: { label: "Review", color: "#8b5cf6" },
  approved: { label: "Approved", color: "#3b82f6" },
  published: { label: "Published", color: "#10b981" },
};

interface ContentCalendarViewProps {
  briefId: Id<"briefs">;
  isEditable: boolean;
}

export function ContentCalendarView({ briefId, isEditable }: ContentCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const items = useQuery(api.contentCalendar.listForBrief, { briefId, month: currentMonth });
  const createItem = useMutation(api.contentCalendar.createItem);
  const updateItem = useMutation(api.contentCalendar.updateItem);
  const deleteItem = useMutation(api.contentCalendar.deleteItem);
  const graphData = useQuery(api.briefs.getBriefGraphData, { briefId });
  const { toast } = useToast();

  const [showAddRow, setShowAddRow] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newPlatform, setNewPlatform] = useState(PLATFORMS[0]);
  const [newContentType, setNewContentType] = useState(CONTENT_TYPES[0]);
  const [newCaption, setNewCaption] = useState("");
  const [newAssignee, setNewAssignee] = useState("");

  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const employees = graphData?.teams.flatMap((t) => t.members.map((m) => m.user)) ?? [];
  const uniqueEmployees = [...new Map(employees.map((e) => [e._id, e])).values()];

  function navigateMonth(dir: -1 | 1) {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = (() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  })();

  const daysInMonth = (() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  })();

  let filteredItems = items ?? [];
  if (filterPlatform) filteredItems = filteredItems.filter((i) => i.platform === filterPlatform);
  if (filterStatus) filteredItems = filteredItems.filter((i) => i.status === filterStatus);

  const sortedItems = [...filteredItems].sort((a, b) => a.date.localeCompare(b.date));

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createItem({
        briefId,
        date: newDate,
        platform: newPlatform,
        contentType: newContentType,
        caption: newCaption || undefined,
        assigneeId: newAssignee ? (newAssignee as Id<"users">) : undefined,
      });
      setNewDate("");
      setNewCaption("");
      setNewAssignee("");
      setShowAddRow(false);
      toast("success", "Content item added");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to add item");
    }
  }

  return (
    <div>
      {/* Month Navigation and Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
            <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)] min-w-[160px] text-center">
            {monthLabel}
          </h3>
          <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2 py-1 text-[12px]"
          >
            <option value="">All Platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-2 py-1 text-[12px]"
          >
            <option value="">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {isEditable && (
            <Button variant="primary" onClick={() => setShowAddRow(true)} className="text-[12px] px-3 py-1.5 h-auto">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* Gantt-style Header: Days of the Month */}
      <div className="mb-4 overflow-x-auto">
        <div className="flex gap-px min-w-max">
          <div className="w-[200px] shrink-0" />
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${currentMonth}-${String(day).padStart(2, "0")}`;
            const dayOfWeek = new Date(dateStr).toLocaleDateString("en-US", { weekday: "narrow" });
            const isWeekend = ["S"].includes(dayOfWeek) && (new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6);
            return (
              <div
                key={day}
                className={`w-[28px] text-center shrink-0 ${isWeekend ? "bg-[var(--bg-hover)]" : ""}`}
              >
                <span className="text-[9px] text-[var(--text-muted)] block">{dayOfWeek}</span>
                <span className="text-[10px] text-[var(--text-secondary)] font-medium">{day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] w-[100px]">Date</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] w-[110px]">Platform</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] w-[100px]">Type</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)]">Caption</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] w-[110px]">Status</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] w-[120px]">Assignee</th>
              {isEditable && <th className="w-[40px]" />}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item._id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                <td className="px-3 py-2 text-[12px] text-[var(--text-primary)] font-medium">
                  {new Date(item.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </td>
                <td className="px-3 py-2">
                  {isEditable ? (
                    <select
                      value={item.platform}
                      onChange={(e) => updateItem({ itemId: item._id, platform: e.target.value })}
                      className="bg-transparent text-[12px] text-[var(--text-primary)] border-none focus:outline-none cursor-pointer"
                    >
                      {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span className="text-[12px] text-[var(--text-primary)]">{item.platform}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditable ? (
                    <select
                      value={item.contentType}
                      onChange={(e) => updateItem({ itemId: item._id, contentType: e.target.value })}
                      className="bg-transparent text-[12px] text-[var(--text-primary)] border-none focus:outline-none cursor-pointer"
                    >
                      {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <span className="text-[12px] text-[var(--text-primary)]">{item.contentType}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditable ? (
                    <input
                      defaultValue={item.caption ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (item.caption ?? "")) {
                          updateItem({ itemId: item._id, caption: e.target.value });
                        }
                      }}
                      className="w-full bg-transparent text-[12px] text-[var(--text-primary)] border-none focus:outline-none focus:bg-[var(--bg-input)] focus:px-2 focus:py-0.5 focus:rounded focus:border focus:border-[var(--border)] transition-all"
                      placeholder="Add caption..."
                    />
                  ) : (
                    <span className="text-[12px] text-[var(--text-secondary)]">{item.caption || "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditable ? (
                    <select
                      value={item.status}
                      onChange={(e) => updateItem({ itemId: item._id, status: e.target.value as any })}
                      className="bg-transparent text-[11px] font-medium border-none focus:outline-none cursor-pointer"
                      style={{ color: STATUS_CONFIG[item.status]?.color }}
                    >
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                      style={{
                        color: STATUS_CONFIG[item.status]?.color,
                        backgroundColor: `${STATUS_CONFIG[item.status]?.color}15`,
                      }}
                    >
                      {STATUS_CONFIG[item.status]?.label}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditable ? (
                    <select
                      value={item.assigneeId ?? ""}
                      onChange={(e) => {
                        if (e.target.value) updateItem({ itemId: item._id, assigneeId: e.target.value as Id<"users"> });
                      }}
                      className="bg-transparent text-[12px] text-[var(--text-primary)] border-none focus:outline-none cursor-pointer"
                    >
                      <option value="">Unassigned</option>
                      {uniqueEmployees.map((emp) => (
                        <option key={emp._id} value={emp._id}>{emp.name ?? emp.email}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[12px] text-[var(--text-secondary)]">{item.assigneeName ?? "—"}</span>
                  )}
                </td>
                {isEditable && (
                  <td className="px-2 py-2">
                    <button
                      onClick={() => deleteItem({ itemId: item._id })}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {sortedItems.length === 0 && (
              <tr>
                <td colSpan={isEditable ? 7 : 6} className="px-3 py-8 text-center text-[13px] text-[var(--text-muted)]">
                  No content items for {monthLabel}. {isEditable && "Click \"Add Entry\" to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Row Modal */}
      {showAddRow && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">Add Content Entry</h3>
              <button onClick={() => setShowAddRow(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="flex flex-col gap-3">
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
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
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Caption</label>
                <input
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Post caption or description..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                />
              </div>
              <div>
                <label className="font-medium text-[12px] text-[var(--text-secondary)] block mb-1">Assignee</label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">No assignee</option>
                  {uniqueEmployees.map((emp) => (
                    <option key={emp._id} value={emp._id}>{emp.name ?? emp.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary">Add</Button>
                <Button type="button" variant="secondary" onClick={() => setShowAddRow(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
