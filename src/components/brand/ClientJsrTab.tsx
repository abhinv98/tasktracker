"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, ConfirmModal, useToast } from "@/components/ui";
import {
  ExternalLink,
  Link2,
  Copy,
  Plus,
  MessageCircle,
  Send,
  X,
  GripVertical,
  Eye,
  EyeOff,
  Briefcase,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
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

interface ClientJsrTabProps {
  brandId: Id<"brands">;
  brand: any;
  canManageLinks: boolean;
}

type BlockId = "briefs" | "taskStatus" | "analytics" | "clientTasks" | "messages";

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
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
          <button {...attributes} {...listeners} className="cursor-grab text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="font-medium text-[13px] text-[var(--text-primary)] flex-1">{block.label}</span>
          <button
            onClick={() => onToggle(block.id)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title={block.visible ? "Hide block" : "Show block"}
          >
            {block.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
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
  const deactivateJsrLink = useMutation(api.jsr.deactivateJsrLink);
  const jsrMessages = useQuery(api.jsr.listJsrMessages, { brandId });
  const sendManagerMessage = useMutation(api.jsr.sendManagerMessage);
  const brandClientTasks = useQuery(api.jsr.listBrandTasksForClient, { brandId });

  const [deactivatingJsrId, setDeactivatingJsrId] = useState<Id<"jsrLinks"> | null>(null);
  const [deleteJsrTasks, setDeleteJsrTasks] = useState(false);
  const [jsrMsgContent, setJsrMsgContent] = useState("");
  const [sendingJsrMsg, setSendingJsrMsg] = useState(false);
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

  function toggleBlock(id: BlockId) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)));
  }

  function addBlock(id: BlockId) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, visible: true } : b)));
    setShowAddBlock(false);
  }

  function removeBlock(id: BlockId) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, visible: false } : b)));
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

  const activeLinks = (jsrLinks ?? []).filter((l) => l.isActive);
  const hiddenBlocks = blocks.filter((b) => !b.visible);

  const totalTasks = brand.totalTasks ?? 0;
  const doneCount = brand.taskStatusCounts?.done ?? 0;
  const completionPct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  function renderBlock(block: BlockConfig) {
    switch (block.id) {
      case "briefs":
        return (
          <div className="space-y-2">
            {brand.briefs.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-3">No briefs</p>
            ) : (
              brand.briefs.map((brief: any) => (
                <div key={brief._id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{brief.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)] capitalize">{brief.status}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <div className="w-16 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--accent-employee)]" style={{ width: `${brief.progress}%` }} />
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-[10px] font-medium text-[var(--text-muted)]">Pending</p>
              <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{brand.taskStatusCounts?.pending ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50">
              <p className="text-[10px] font-medium text-amber-600">In Progress</p>
              <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{brand.taskStatusCounts?.["in-progress"] ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50">
              <p className="text-[10px] font-medium text-purple-600">Review</p>
              <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{brand.taskStatusCounts?.review ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-50">
              <p className="text-[10px] font-medium text-green-600">Done</p>
              <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{brand.taskStatusCounts?.done ?? 0}</p>
            </div>
          </div>
        );
      case "analytics":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--text-secondary)]">Completion</span>
              <span className="text-[12px] font-bold text-[var(--text-primary)]">{completionPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--accent-employee)] transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="text-center">
                <p className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">{brand.briefs.length}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Briefs</p>
              </div>
              <div className="text-center">
                <p className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">{totalTasks}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Tasks</p>
              </div>
              <div className="text-center">
                <p className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">{brand.managers.length}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Managers</p>
              </div>
            </div>
          </div>
        );
      case "clientTasks": {
        const tasks = brandClientTasks ?? [];
        return (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-3">No client tasks</p>
            ) : (
              tasks.slice(0, 10).map((task: any) => (
                <div key={task._id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{task.title}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{task.briefTitle}</p>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] capitalize shrink-0 ml-2">{task.status}</span>
                </div>
              ))
            )}
          </div>
        );
      }
      case "messages": {
        const msgs = jsrMessages ?? [];
        const recent = msgs.slice(-5);
        return (
          <div className="space-y-2">
            {recent.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-3">No messages yet</p>
            ) : (
              recent.map((msg: any) => (
                <div key={msg._id} className={`p-2.5 rounded-lg ${msg.senderType === "manager" ? "bg-[var(--accent-admin)]/5 ml-4" : "bg-[var(--bg-hover)] mr-4"}`}>
                  <p className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5">
                    {msg.senderName || (msg.senderType === "client" ? "Client" : "Manager")}
                  </p>
                  <p className="text-[12px] text-[var(--text-primary)] line-clamp-2">{msg.content}</p>
                  <p className="text-[9px] text-[var(--text-muted)] mt-1">
                    {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              ))
            )}
            {msgs.length > 5 && (
              <button
                onClick={() => setChatSidebarOpen(true)}
                className="text-[11px] font-medium text-[var(--accent-admin)] hover:underline w-full text-center py-1"
              >
                View all {msgs.length} messages
              </button>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      {/* Left: JSR Link Management */}
      <div className="space-y-6">
        {/* JSR Links */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-[var(--text-secondary)]" />
              <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">JSR Links</h3>
              <span className="text-[11px] text-[var(--text-muted)]">({activeLinks.length})</span>
            </div>
            {canManageLinks && (
              <button
                onClick={handleGenerateJsr}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="p-4">
            {activeLinks.length === 0 && (
              <div className="text-center py-6">
                <ExternalLink className="h-7 w-7 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                <p className="text-[12px] text-[var(--text-muted)]">No active JSR links. Click + to generate one.</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {activeLinks.map((link) => (
                <div key={link._id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="h-3.5 w-3.5 text-[var(--accent-employee)] shrink-0" />
                    <span className="text-[11px] text-[var(--text-primary)] font-mono truncate flex-1">
                      {typeof window !== "undefined" ? `${window.location.origin}/jsr/${link.token}` : `/jsr/${link.token}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyJsrLink(link.token)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                    <button
                      onClick={() => setChatSidebarOpen(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/10 transition-colors"
                    >
                      <MessageCircle className="h-3 w-3" /> Show Chat
                    </button>
                    <button
                      onClick={() => { setDeactivatingJsrId(link._id); setDeleteJsrTasks(false); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors ml-auto"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Client JSR Content Preview */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
            <Eye className="h-4 w-4 text-[var(--text-secondary)]" />
            <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">What Clients See</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Brand Info</p>
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{brand.name}</p>
              {brand.description && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{brand.description}</p>}
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Task Overview</p>
              <div className="flex items-center gap-4 text-[12px]">
                <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                  <Clock className="h-3 w-3" /> {brand.taskStatusCounts?.pending ?? 0} pending
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-3 w-3" /> {brand.taskStatusCounts?.["in-progress"] ?? 0} in progress
                </span>
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" /> {doneCount} done
                </span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Deliverables Visibility</p>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Clients can view and approve deliverables marked as client-facing. They can also submit task requests and communicate via the chat.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Configurable Sidebar Blocks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[14px] text-[var(--text-primary)]">Dashboard Blocks</h3>
          <div className="relative">
            <button
              onClick={() => setShowAddBlock(!showAddBlock)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--accent-admin)] hover:bg-[var(--accent-admin)]/10 transition-colors border border-[var(--accent-admin)]/20"
            >
              <Plus className="h-3 w-3" />
              {hiddenBlocks.length > 0 ? `Add Block (${hiddenBlocks.length})` : "All Shown"}
            </button>
            {showAddBlock && hiddenBlocks.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-[var(--border)] rounded-lg shadow-lg z-10 py-1">
                {hiddenBlocks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => addBlock(b.id)}
                    className="w-full text-left px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
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
          <div className="text-center py-12 text-[var(--text-muted)]">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-[13px]">No blocks visible. Click "Add Block" to show some.</p>
          </div>
        )}
      </div>

      {/* Chat Sidebar */}
      {chatSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setChatSidebarOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[500px] max-w-[90vw] bg-white border-l border-[var(--border)] shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[var(--accent-admin)]" />
                <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">Client Chat</h3>
              </div>
              <button onClick={() => setChatSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ overscrollBehavior: "contain" }}>
              {(jsrMessages ?? []).length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)] text-center py-8">No messages yet.</p>
              )}
              {(jsrMessages ?? []).map((msg: any) => (
                <div key={msg._id} className={`flex ${msg.senderType === "manager" ? "justify-end" : "justify-start"} mb-1.5`}>
                  <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${msg.senderType === "manager" ? "bg-[var(--accent-admin)] text-white rounded-br-sm" : "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-bl-sm"}`}>
                    <p className={`text-[10px] font-semibold mb-0.5 ${msg.senderType === "manager" ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                      {msg.senderName || (msg.senderType === "client" ? "Client" : "You")}
                    </p>
                    <p className="text-[12px] leading-relaxed">{msg.content}</p>
                    <p className={`text-[9px] mt-1 ${msg.senderType === "manager" ? "text-white/50" : "text-[var(--text-muted)]"}`}>
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
                  if (e.key === "Enter" && !e.shiftKey && jsrMsgContent.trim()) {
                    e.preventDefault();
                    setSendingJsrMsg(true);
                    sendManagerMessage({ brandId, content: jsrMsgContent.trim() })
                      .then(() => setJsrMsgContent(""))
                      .catch(() => toast("error", "Failed to send"))
                      .finally(() => setSendingJsrMsg(false));
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
              />
              <button
                onClick={() => {
                  if (!jsrMsgContent.trim()) return;
                  setSendingJsrMsg(true);
                  sendManagerMessage({ brandId, content: jsrMsgContent.trim() })
                    .then(() => setJsrMsgContent(""))
                    .catch(() => toast("error", "Failed to send"))
                    .finally(() => setSendingJsrMsg(false));
                }}
                disabled={sendingJsrMsg || !jsrMsgContent.trim()}
                className="shrink-0 p-2.5 rounded-lg bg-[var(--accent-admin)] text-white disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
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
