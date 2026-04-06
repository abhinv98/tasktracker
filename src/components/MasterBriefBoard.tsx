"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Pencil, ArrowRight, Link as LinkIcon, X } from "lucide-react";

/* ─── Types ──────────────────────────────────────── */

interface TaskItem {
  _id: string;
  title: string;
  status: string;
  assigneeName: string;
  deadline?: number;
}

interface TeamSection {
  teamId: string;
  teamName: string;
  teamColor: string;
  tasks: TaskItem[];
}

interface ConnectionItem {
  _id: string;
  sourceTaskId: string;
  targetTaskId: string;
}

interface MasterBriefBoardProps {
  briefId: Id<"briefs">;
  teams: TeamSection[];
  connections: ConnectionItem[];
  isAdmin: boolean;
  onCreateTask: (teamId: string) => void;
  onEditTask: (taskId: string) => void;
  onOpenTaskDetail: (taskId: string) => void;
}

/* ─── Status styling ─────────────────────────────── */

const STATUS: Record<string, { color: string; bg: string; label: string }> = {
  pending:       { color: "#64748b", bg: "#f1f5f9", label: "Pending" },
  "in-progress": { color: "#d97706", bg: "#fef3c7", label: "In Progress" },
  review:        { color: "#7c3aed", bg: "#ede9fe", label: "Review" },
  done:          { color: "#059669", bg: "#d1fae5", label: "Done" },
};

/* ─── SVG connection path builder ────────────────── */

function buildPath(
  sx: number, sy: number,
  tx: number, ty: number,
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  // Adaptive control points: pull toward the direction of connection
  const cx1 = sx + dx * 0.4;
  const cy1 = sy;
  const cx2 = tx - dx * 0.4;
  const cy2 = ty;
  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
}

/* ─── Main Component ─────────────────────────────── */

export function MasterBriefBoard({
  briefId,
  teams,
  connections,
  isAdmin,
  onCreateTask,
  onEditTask,
  onOpenTaskDetail,
}: MasterBriefBoardProps) {
  const addConnection = useMutation(api.briefs.addTaskConnection);
  const removeConnection = useMutation(api.briefs.removeTaskConnection);

  // Refs for measuring card positions
  const boardRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [pathData, setPathData] = useState<
    { id: string; d: string; sourceId: string; targetId: string }[]
  >([]);

  // Connect mode state
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  /* ─── Compute SVG paths from card positions ───── */
  const computePaths = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const boardRect = board.getBoundingClientRect();
    const scrollLeft = board.scrollLeft;
    const scrollTop = board.scrollTop;

    const paths: typeof pathData = [];
    for (const conn of connections) {
      const srcEl = cardRefs.current.get(conn.sourceTaskId);
      const tgtEl = cardRefs.current.get(conn.targetTaskId);
      if (!srcEl || !tgtEl) continue;

      const srcRect = srcEl.getBoundingClientRect();
      const tgtRect = tgtEl.getBoundingClientRect();

      // Source: center-bottom of card
      const sx = srcRect.left + srcRect.width / 2 - boardRect.left + scrollLeft;
      const sy = srcRect.bottom - boardRect.top + scrollTop;
      // Target: center-top of card
      const tx = tgtRect.left + tgtRect.width / 2 - boardRect.left + scrollLeft;
      const ty = tgtRect.top - boardRect.top + scrollTop;

      paths.push({
        id: conn._id,
        d: buildPath(sx, sy + 4, tx, ty - 4),
        sourceId: conn.sourceTaskId,
        targetId: conn.targetTaskId,
      });
    }
    setPathData(paths);
  }, [connections]);

  // Recompute on mount, resize, scroll, and when data changes
  useLayoutEffect(() => {
    computePaths();
  }, [computePaths, teams]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const ro = new ResizeObserver(() => computePaths());
    ro.observe(board);
    board.addEventListener("scroll", computePaths, { passive: true });
    window.addEventListener("resize", computePaths);

    return () => {
      ro.disconnect();
      board.removeEventListener("scroll", computePaths);
      window.removeEventListener("resize", computePaths);
    };
  }, [computePaths]);

  /* ─── Connect mode handlers ───────────────────── */
  const handleCardClick = useCallback(
    (taskId: string) => {
      if (!connectingFrom) {
        // Normal click → open detail
        onOpenTaskDetail(taskId);
        return;
      }
      if (connectingFrom === taskId) {
        // Clicked same card → cancel
        setConnectingFrom(null);
        return;
      }
      // Create connection
      addConnection({
        briefId,
        sourceTaskId: connectingFrom as Id<"tasks">,
        targetTaskId: taskId as Id<"tasks">,
      }).catch(() => {});
      setConnectingFrom(null);
    },
    [connectingFrom, onOpenTaskDetail, addConnection, briefId]
  );

  const startConnect = useCallback((taskId: string) => {
    setConnectingFrom(taskId);
  }, []);

  const cancelConnect = useCallback(() => {
    setConnectingFrom(null);
  }, []);

  /* ─── Build a lookup: taskId → team color ─────── */
  const taskTeamColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      for (const task of team.tasks) {
        map.set(task._id, team.teamColor);
      }
    }
    return map;
  }, [teams]);

  /* ─── Render ──────────────────────────────────── */
  return (
    <div
      ref={boardRef}
      className="relative w-full h-full overflow-auto"
      onClick={(e) => {
        // Click on board background cancels connect mode
        if (connectingFrom && (e.target as HTMLElement).closest("[data-task-card]") === null) {
          cancelConnect();
        }
      }}
    >
      {/* SVG connection overlay */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, minHeight: "100%", minWidth: "100%" }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill="var(--accent-admin, #c4684d)"
              opacity="0.7"
            />
          </marker>
        </defs>
        {pathData.map((p) => (
          <g key={p.id}>
            {/* Glow layer */}
            <path
              d={p.d}
              fill="none"
              stroke="var(--accent-admin, #c4684d)"
              strokeWidth="4"
              opacity="0.08"
              strokeLinecap="round"
            />
            {/* Main path */}
            <path
              d={p.d}
              fill="none"
              stroke="var(--accent-admin, #c4684d)"
              strokeWidth="1.5"
              opacity="0.55"
              strokeLinecap="round"
              strokeDasharray="6 3"
              markerEnd="url(#arrowhead)"
              style={{
                transition: "d 300ms cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          </g>
        ))}
      </svg>

      {/* Connect mode banner */}
      {connectingFrom && (
        <div
          className="sticky top-0 z-10 flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-medium text-white"
          style={{
            background: "linear-gradient(135deg, var(--accent-admin, #c4684d) 0%, #a855f7 100%)",
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
          Click another task to connect — or
          <button
            onClick={cancelConnect}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-semibold"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}

      {/* Team sections */}
      <div className="relative p-5 space-y-6" style={{ zIndex: 2 }}>
        {teams.map((team, teamIdx) => (
          <section
            key={team.teamId}
            className="animate-[fadeSlideIn_400ms_ease-out_both]"
            style={{ animationDelay: `${teamIdx * 60}ms` }}
          >
            {/* Team header */}
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="w-2.5 h-2.5 rounded-full ring-2 ring-offset-1"
                style={{
                  backgroundColor: team.teamColor,
                  boxShadow: `0 0 0 2px color-mix(in srgb, ${team.teamColor} 30%, transparent)`,
                }}
              />
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] tracking-[-0.01em]">
                {team.teamName}
              </h3>
              <span className="text-[10px] font-medium text-[var(--text-muted)] tabular-nums">
                {team.tasks.length} task{team.tasks.length !== 1 ? "s" : ""}
              </span>
              {isAdmin && (
                <button
                  onClick={() => onCreateTask(team.teamId)}
                  className="ml-auto text-[10px] font-semibold text-[var(--accent-admin)] hover:text-[var(--accent-admin)] hover:underline transition-colors"
                >
                  + Add task
                </button>
              )}
            </div>

            {/* Task cards grid */}
            {team.tasks.length === 0 ? (
              <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-primary)]">
                <p className="text-[11px] text-[var(--text-muted)]">
                  No tasks yet
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {team.tasks.map((task, taskIdx) => {
                  const st = STATUS[task.status] ?? STATUS.pending;
                  const isConnecting = connectingFrom === task._id;
                  const isConnectTarget = !!connectingFrom && connectingFrom !== task._id;
                  // Check if this task has any outgoing connections
                  const hasOutgoing = connections.some((c) => c.sourceTaskId === task._id);
                  const hasIncoming = connections.some((c) => c.targetTaskId === task._id);

                  return (
                    <div
                      key={task._id}
                      data-task-card
                      ref={(el) => {
                        if (el) cardRefs.current.set(task._id, el);
                        else cardRefs.current.delete(task._id);
                      }}
                      onClick={() => handleCardClick(task._id)}
                      className={`
                        relative group w-[200px] rounded-xl border-2 bg-white cursor-pointer
                        transition-all duration-200
                        ${isConnecting
                          ? "border-[var(--accent-admin)] ring-2 ring-[var(--accent-admin)]/20 shadow-lg scale-[1.02]"
                          : isConnectTarget
                            ? "border-[var(--accent-admin)]/40 hover:border-[var(--accent-admin)] hover:shadow-lg hover:scale-[1.02]"
                            : "border-[var(--border)] hover:border-[color-mix(in_srgb,var(--accent-admin)_40%,var(--border))] hover:shadow-md"
                        }
                        animate-[fadeSlideIn_350ms_ease-out_both]
                      `}
                      style={{
                        animationDelay: `${teamIdx * 60 + taskIdx * 40 + 80}ms`,
                      }}
                    >
                      {/* Team color top bar */}
                      <div
                        className="h-1 rounded-t-[10px]"
                        style={{ backgroundColor: team.teamColor }}
                      />

                      {/* Card body */}
                      <div className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 tracking-[-0.005em]">
                            {task.title}
                          </p>
                          {isAdmin && !connectingFrom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTask(task._id);
                              }}
                              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all shrink-0"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Assignee + Deadline row */}
                        <div className="flex items-center gap-1.5 mt-2">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: team.teamColor }}
                          >
                            {task.assigneeName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[10px] text-[var(--text-secondary)] truncate flex-1">
                            {task.assigneeName}
                          </span>
                          {task.deadline && (
                            <span
                              className={`text-[9px] font-medium tabular-nums shrink-0 ${
                                task.status !== "done" && task.deadline < Date.now()
                                  ? "text-red-500"
                                  : "text-[var(--text-muted)]"
                              }`}
                            >
                              {new Date(task.deadline).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        {/* Status + Connect handle row */}
                        <div className="flex items-center justify-between mt-2">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {st.label}
                          </span>

                          {/* Connect handle */}
                          {isAdmin && !connectingFrom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startConnect(task._id);
                              }}
                              title="Connect to another task"
                              className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--accent-admin)] hover:bg-[var(--accent-admin-dim)] transition-all"
                            >
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Connection indicators */}
                        {(hasOutgoing || hasIncoming) && (
                          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                            {connections
                              .filter((c) => c.sourceTaskId === task._id)
                              .map((c) => {
                                // Find target task name
                                let targetName = "";
                                for (const t of teams) {
                                  const found = t.tasks.find((tk) => tk._id === c.targetTaskId);
                                  if (found) { targetName = found.title; break; }
                                }
                                return (
                                  <span
                                    key={c._id}
                                    className="group/conn inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-medium bg-[var(--accent-admin-dim)] text-[var(--accent-admin)] max-w-full"
                                  >
                                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{targetName || "Task"}</span>
                                    {isAdmin && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeConnection({ connectionId: c._id as Id<"taskConnections"> });
                                        }}
                                        className="ml-0.5 opacity-0 group-hover/conn:opacity-100 hover:text-[var(--danger)] transition-opacity"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}

        {teams.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-hover)] flex items-center justify-center mb-3">
              <LinkIcon className="h-5 w-5 text-[var(--text-disabled)]" />
            </div>
            <p className="text-[14px] font-medium text-[var(--text-secondary)]">
              No teams assigned
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              Add teams above to start building tasks.
            </p>
          </div>
        )}
      </div>

      {/* Stagger animation keyframes */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
