"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Button,
  ConfirmModal,
  EmptyState,
  Panel,
  PanelEmpty,
  StatStrip,
  StatTile,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { taskStatusMeta } from "@/lib/status";
import { BRIEF_STATUS_COLORS, BRIEF_STATUS_LABELS } from "@/lib/statusColors";
import {
  Link2,
  Copy,
  Plus,
  MessageCircle,
  Send,
  X,
  GripVertical,
  Eye,
  EyeOff,
  BarChart3,
  Activity,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fieldClass, iconButtonClass } from "@/components/ui/classes";

const ICON_BTN = iconButtonClass;
// Same frame and title bar as <Panel>, for blocks whose header carries a button.
const BLOCK = "rounded-lg border border-[var(--border)] bg-white overflow-hidden";
const BLOCK_HEAD =
  "flex items-center justify-between gap-3 h-11 px-4 border-b border-[var(--border-subtle)]";
const FIELD = fieldClass;
const SUB_LABEL = "text-[12px] font-medium text-[var(--text-muted)] mb-1.5";

function BlockTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 font-semibold text-[14px] text-[var(--text-primary)]">
      {title}
      {count !== undefined && count > 0 && (
        <span className="font-normal tabular-nums text-[var(--text-muted)]">{count}</span>
      )}
    </h3>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: taskStatusMeta(status).dot }}
    />
  );
}

interface ClientJsrTabProps {
  brandId: Id<"brands">;
  brand: any;
  canManageLinks: boolean;
}

type BlockId = "briefs" | "taskStatus" | "analytics" | "clientTasks" | "messages" | "recentActivity";

interface BlockConfig {
  id: BlockId;
  label: string;
  visible: boolean;
}

const DEFAULT_BLOCKS: BlockConfig[] = [
  { id: "briefs", label: "Briefs Summary", visible: true },
  { id: "taskStatus", label: "Task Status", visible: true },
  { id: "analytics", label: "Analytics", visible: true },
  { id: "clientTasks", label: "Client Tasks", visible: true },
  { id: "messages", label: "Client Messages", visible: true },
  { id: "recentActivity", label: "Recent Activity", visible: true },
];

function getStorageKey(brandId: string) {
  return `jsr-blocks-${brandId}`;
}

function loadBlocks(brandId: string): BlockConfig[] {
  if (typeof window === "undefined") return DEFAULT_BLOCKS;
  try {
    const raw = localStorage.getItem(getStorageKey(brandId));
    if (!raw) return DEFAULT_BLOCKS;
    const saved = JSON.parse(raw) as BlockConfig[];
    const allIds = new Set(DEFAULT_BLOCKS.map((b) => b.id));
    const validSaved = saved.filter((b) => allIds.has(b.id));
    for (const def of DEFAULT_BLOCKS) {
      if (!validSaved.find((b) => b.id === def.id)) {
        validSaved.push(def);
      }
    }
    return validSaved;
  } catch {
    return DEFAULT_BLOCKS;
  }
}

function SortableBlock({
  block,
  children,
  onToggle,
}: {
  block: BlockConfig;
  children: React.ReactNode;
  onToggle: (id: BlockId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-4">
      <div className={BLOCK}>
        <div className={`flex items-center gap-1 h-11 pl-2 pr-2 ${block.visible ? "border-b border-[var(--border-subtle)]" : ""}`}>
          <button
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${block.label}`}
            className={`${ICON_BTN} cursor-grab`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="font-semibold text-[14px] text-[var(--text-primary)] flex-1">{block.label}</span>
          <button
            onClick={() => onToggle(block.id)}
            className={ICON_BTN}
            title={block.visible ? "Hide block" : "Show block"}
            aria-label={block.visible ? "Hide block" : "Show block"}
          >
            {block.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        {block.visible && <div className="p-4">{children}</div>}
      </div>
    </div>
  );
}

export default function ClientJsrTab({ brandId, brand, canManageLinks }: ClientJsrTabProps) {
  const { toast } = useToast();

  const jsrLinks = useQuery(api.jsr.listJsrLinks, { brandId });
  const generateJsrLink = useMutation(api.jsr.generateJsrLink);
  const generateIntakeLink = useMutation(api.jsr.generateIntakeLink);
  const deactivateJsrLink = useMutation(api.jsr.deactivateJsrLink);
  const jsrMessages = useQuery(api.jsr.listJsrMessages, { brandId });
  const sendManagerMessage = useMutation(api.jsr.sendManagerMessage);
  const brandClientTasks = useQuery(api.jsr.listBrandTasksForClient, { brandId });
  const updateJsrHiddenSections = useMutation(api.jsr.updateJsrHiddenSections);
  const updateJsrCalendarMonth = useMutation(api.jsr.updateJsrCalendarMonth);

  const [deactivatingJsrId, setDeactivatingJsrId] = useState<Id<"jsrLinks"> | null>(null);
  const [deleteJsrTasks, setDeleteJsrTasks] = useState(false);
  const [jsrMsgContent, setJsrMsgContent] = useState("");
  const [sendingJsrMsg, setSendingJsrMsg] = useState(false);
  // Enter and the Send button share this. The ref, not the state, is the
  // guard: a second Enter can arrive before the state has re-rendered, and
  // the client would get the message twice.
  const sendingJsrRef = useRef(false);
  function sendJsrMessage() {
    const content = jsrMsgContent.trim();
    if (!content || sendingJsrRef.current) return;
    sendingJsrRef.current = true;
    setSendingJsrMsg(true);
    sendManagerMessage({ brandId, content })
      .then(() => setJsrMsgContent(""))
      .catch(() => toast("error", "Failed to send"))
      .finally(() => {
        sendingJsrRef.current = false;
        setSendingJsrMsg(false);
      });
  }
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);

  const [blocks, setBlocks] = useState<BlockConfig[]>(() => loadBlocks(brandId));
  const [showAddBlock, setShowAddBlock] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(getStorageKey(brandId), JSON.stringify(blocks));
    }
  }, [blocks, brandId]);

  useEffect(() => {
    if (chatSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [chatSidebarOpen]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id);
      const newIndex = prev.findIndex((b) => b.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function syncHiddenSections(updatedBlocks: BlockConfig[]) {
    const hidden = updatedBlocks.filter((b) => !b.visible).map((b) => b.id);
    updateJsrHiddenSections({ brandId, hiddenSections: hidden }).catch(() => {});
  }

  function toggleBlock(id: BlockId) {
    setBlocks((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b));
      syncHiddenSections(updated);
      return updated;
    });
  }

  function addBlock(id: BlockId) {
    setBlocks((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, visible: true } : b));
      syncHiddenSections(updated);
      return updated;
    });
    setShowAddBlock(false);
  }

  function removeBlock(id: BlockId) {
    setBlocks((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, visible: false } : b));
      syncHiddenSections(updated);
      return updated;
    });
  }

  async function handleGenerateJsr() {
    try {
      await generateJsrLink({ brandId });
      toast("success", "JSR link generated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to generate link");
    }
  }

  function copyJsrLink(token: string) {
    const url = `${window.location.origin}/jsr/${token}`;
    navigator.clipboard.writeText(url);
    toast("success", "Link copied to clipboard");
  }

  async function handleGenerateIntake() {
    try {
      await generateIntakeLink({ brandId });
      toast("success", "Intake link generated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to generate link");
    }
  }

  function copyIntakeLink(token: string) {
    const url = `${window.location.origin}/intake/${token}`;
    navigator.clipboard.writeText(url);
    toast("success", "Intake link copied to clipboard");
  }

  const activeLinks = (jsrLinks ?? []).filter((l) => l.isActive && l.linkType !== "intake");
  const activeIntakeLinks = (jsrLinks ?? []).filter((l) => l.isActive && l.linkType === "intake");
  const hiddenBlocks = blocks.filter((b) => !b.visible);

  const totalTasks = brand.totalTasks ?? 0;
  const doneCount = brand.taskStatusCounts?.done ?? 0;
  const completionPct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  function renderBlock(block: BlockConfig) {
    switch (block.id) {
      case "briefs":
        return (
          <div className="-my-2 divide-y divide-[var(--border-subtle)]">
            {brand.briefs.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)] py-2">No briefs</p>
            ) : (
              brand.briefs.map((brief: any) => (
                <div key={brief._id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{brief.title}</p>
                    <StatusBadge
                      color={BRIEF_STATUS_COLORS[brief.status] ?? BRIEF_STATUS_COLORS.draft}
                      label={BRIEF_STATUS_LABELS[brief.status] ?? brief.status}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--accent-employee)]" style={{ width: `${brief.progress}%` }} />
                    </div>
                    <span className="text-[12px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                      {brief.doneCount}/{brief.taskCount}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      case "taskStatus":
        return (
          <StatStrip>
            <StatTile label="Pending" value={brand.taskStatusCounts?.pending ?? 0} />
            <StatTile label="In Progress" value={brand.taskStatusCounts?.["in-progress"] ?? 0} />
            <StatTile label="Review" value={brand.taskStatusCounts?.review ?? 0} />
            <StatTile label="Done" value={brand.taskStatusCounts?.done ?? 0} />
          </StatStrip>
        );
      case "analytics":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--text-secondary)]">Completion</span>
              <span className="text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{completionPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--accent-employee)] transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <StatStrip>
              <StatTile label="Briefs" value={brand.briefs.length} />
              <StatTile label="Tasks" value={totalTasks} />
              <StatTile label="Managers" value={brand.managers.length} />
            </StatStrip>
          </div>
        );
      case "clientTasks": {
        const tasks = brandClientTasks ?? [];
        return (
          <div className="-my-2 divide-y divide-[var(--border-subtle)]">
            {tasks.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)] py-2">No client tasks</p>
            ) : (
              tasks.slice(0, 10).map((task: any) => (
                <div key={task._id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{task.title}</p>
                    <p className="text-[12px] text-[var(--text-muted)] truncate">{task.briefTitle}</p>
                  </div>
                  <StatusBadge
                    className="w-[88px] shrink-0"
                    color={taskStatusMeta(task.status).dot}
                    label={taskStatusMeta(task.status).label}
                  />
                </div>
              ))
            )}
          </div>
        );
      }
      case "recentActivity":
        return (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            <span>Shows recent task activity to the client (status changes, task updates, etc.)</span>
          </div>
        );
      case "messages": {
        const msgs = jsrMessages ?? [];
        const recent = msgs.slice(-5);
        return (
          <div className="space-y-2">
            {recent.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">No messages yet</p>
            ) : (
              recent.map((msg: any) => (
                <div key={msg._id} className={`px-3 py-2 rounded-md ${msg.senderType === "manager" ? "bg-[var(--bg-primary)] border border-[var(--border-subtle)] ml-4" : "bg-[var(--bg-hover)] mr-4"}`}>
                  <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">
                    {msg.senderName || (msg.senderType === "client" ? "Client" : "Manager")}
                  </p>
                  <p className="text-[13px] text-[var(--text-primary)] line-clamp-2">{msg.content}</p>
                  <p className="text-[11px] tabular-nums text-[var(--text-muted)] mt-1">
                    {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              ))
            )}
            {msgs.length > 5 && (
              <Button variant="ghost" className="w-full" onClick={() => setChatSidebarOpen(true)}>
                View all {msgs.length} messages
              </Button>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
      {/* Left: JSR Link Management */}
      <div className="space-y-4 min-w-0">
        {/* JSR Links */}
        <div className={BLOCK}>
          <div className={BLOCK_HEAD}>
            <BlockTitle title="JSR Links" count={activeLinks.length} />
            {canManageLinks && (
              <button
                onClick={handleGenerateJsr}
                className={ICON_BTN}
                aria-label="Generate JSR link"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          {activeLinks.length === 0 && (
            <PanelEmpty>No active JSR links. Click + to generate one.</PanelEmpty>
          )}
          <div className="divide-y divide-[var(--border-subtle)]">
            {activeLinks.map((link) => (
              <div key={link._id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  <span className="text-[12px] text-[var(--text-primary)] font-mono truncate flex-1">
                    {typeof window !== "undefined" ? `${window.location.origin}/jsr/${link.token}` : `/jsr/${link.token}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => copyJsrLink(link.token)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button variant="secondary" onClick={() => setChatSidebarOpen(true)}>
                    <MessageCircle className="h-3.5 w-3.5" /> Show Chat
                  </Button>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => { setDeactivatingJsrId(link._id); setDeleteJsrTasks(false); }}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Client Intake Links */}
        <div className={BLOCK}>
          <div className={BLOCK_HEAD}>
            <BlockTitle title="Client Intake Links" count={activeIntakeLinks.length} />
            {canManageLinks && (
              <button
                onClick={handleGenerateIntake}
                className={ICON_BTN}
                aria-label="Generate intake link"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="px-4 pt-3 text-[12px] text-[var(--text-muted)]">
            Share this link with the client so they can submit task requests. Requests land in{" "}
            <span className="font-medium text-[var(--text-secondary)]">Client Requests</span> for review.
          </p>
          {activeIntakeLinks.length === 0 && (
            <PanelEmpty>No active intake links. Click + to generate one.</PanelEmpty>
          )}
          <div className="divide-y divide-[var(--border-subtle)]">
            {activeIntakeLinks.map((link) => (
              <div key={link._id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  <span className="text-[12px] text-[var(--text-primary)] font-mono truncate flex-1">
                    {typeof window !== "undefined" ? `${window.location.origin}/intake/${link.token}` : `/intake/${link.token}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => copyIntakeLink(link.token)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => { setDeactivatingJsrId(link._id); setDeleteJsrTasks(false); }}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Client JSR Content Preview */}
        <Panel title="What Clients See">
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-md bg-[var(--bg-primary)]">
              <p className={SUB_LABEL}>Brand Info</p>
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{brand.name}</p>
              {brand.description && <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">{brand.description}</p>}
            </div>
            <div className="p-3 rounded-md bg-[var(--bg-primary)]">
              <p className={SUB_LABEL}>Task Overview</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <StatusDot status="pending" /> {brand.taskStatusCounts?.pending ?? 0} pending
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status="in-progress" /> {brand.taskStatusCounts?.["in-progress"] ?? 0} in progress
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status="done" /> {doneCount} done
                </span>
              </div>
            </div>
            <div className="p-3 rounded-md bg-[var(--bg-primary)]">
              <p className={SUB_LABEL}>Deliverables Visibility</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Clients can view and approve deliverables marked as client-facing. They can also submit task requests and communicate via the chat.
              </p>
            </div>
            {/* Content Calendar month control */}
            {brand.briefs?.some((b: any) => b.briefType === "content_calendar") && (
              <div className="p-3 rounded-md bg-[var(--bg-primary)]">
                <p className={SUB_LABEL}>Content Calendar Month</p>
                <p className="text-[12px] text-[var(--text-secondary)] mb-2">
                  Choose which month the client sees on the JSR. Leave on &quot;All Months&quot; to show everything.
                </p>
                <select
                  value={(() => {
                    const active = (jsrLinks ?? []).find((l) => l.isActive);
                    return (active as any)?.calendarMonth ?? "";
                  })()}
                  onChange={(e) => {
                    updateJsrCalendarMonth({ brandId, calendarMonth: e.target.value }).catch(() => {});
                  }}
                  aria-label="Content Calendar Month"
                  className={`${FIELD} w-full`}
                >
                  <option value="">All Months</option>
                  {(() => {
                    const months: { value: string; label: string }[] = [];
                    const now = new Date();
                    for (let i = -3; i < 12; i++) {
                      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                      months.push({ value: val, label });
                    }
                    return months;
                  })().map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Right: Configurable Sidebar Blocks */}
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">Dashboard Blocks</h3>
          <div className="relative">
            <Button variant="secondary" onClick={() => setShowAddBlock(!showAddBlock)}>
              <Plus className="h-3.5 w-3.5" />
              {hiddenBlocks.length > 0 ? `Add Block (${hiddenBlocks.length})` : "All Shown"}
            </Button>
            {showAddBlock && hiddenBlocks.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-[var(--border)] rounded-lg shadow-lg z-20 py-1">
                {hiddenBlocks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => addBlock(b.id)}
                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.filter((b) => b.visible).map((block) => (
              <SortableBlock key={block.id} block={block} onToggle={toggleBlock}>
                {renderBlock(block)}
              </SortableBlock>
            ))}
          </SortableContext>
        </DndContext>

        {blocks.every((b) => !b.visible) && (
          <EmptyState
            icon={BarChart3}
            title={'No blocks visible. Click "Add Block" to show some.'}
          />
        )}
      </div>

      {/* Chat Sidebar */}
      {chatSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setChatSidebarOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[500px] max-w-[90vw] bg-white border-l border-[var(--border)] shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-[15px] text-[var(--text-primary)]">Client Chat</h3>
              <button onClick={() => setChatSidebarOpen(false)} className={ICON_BTN} aria-label="Close chat">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ overscrollBehavior: "contain" }}>
              {(jsrMessages ?? []).length === 0 && (
                <p className="text-[13px] text-[var(--text-muted)] text-center py-8">No messages yet.</p>
              )}
              {(jsrMessages ?? []).map((msg: any) => (
                <div key={msg._id} className={`flex ${msg.senderType === "manager" ? "justify-end" : "justify-start"} mb-1.5`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${msg.senderType === "manager" ? "bg-[var(--text-primary)] text-white rounded-br-sm" : "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-bl-sm"}`}>
                    <p className={`text-[11px] font-medium mb-0.5 ${msg.senderType === "manager" ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                      {msg.senderName || (msg.senderType === "client" ? "Client" : "You")}
                    </p>
                    <p className="text-[13px] leading-relaxed">{msg.content}</p>
                    <p className={`text-[11px] mt-1 ${msg.senderType === "manager" ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                      {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--border)] p-3 flex items-center gap-2">
              <input
                value={jsrMsgContent}
                onChange={(e) => setJsrMsgContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendJsrMessage();
                  }
                }}
                placeholder="Type a message..."
                className={`${FIELD} flex-1 min-w-0`}
              />
              <Button
                variant="primary"
                aria-label="Send message"
                onClick={sendJsrMessage}
                disabled={sendingJsrMsg || !jsrMsgContent.trim()}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Deactivate Confirmation */}
      <ConfirmModal
        open={!!deactivatingJsrId}
        title="Deactivate JSR Link"
        message="This will deactivate the link so clients can no longer access it."
        confirmLabel="Deactivate"
        confirmingLabel="Deactivating..."
        variant="danger"
        onConfirm={async () => {
          if (deactivatingJsrId) {
            await deactivateJsrLink({ jsrLinkId: deactivatingJsrId, deleteTasks: deleteJsrTasks });
            toast("success", deleteJsrTasks ? "Link deactivated and tasks deleted" : "Link deactivated");
          }
          setDeactivatingJsrId(null);
          setDeleteJsrTasks(false);
        }}
        onCancel={() => { setDeactivatingJsrId(null); setDeleteJsrTasks(false); }}
      >
        <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteJsrTasks}
            onChange={(e) => setDeleteJsrTasks(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] accent-[var(--danger)]"
          />
          <span className="text-[13px] text-[var(--text-primary)]">
            Also delete all client request tasks created from this link
          </span>
        </label>
      </ConfirmModal>
    </div>
  );
}
