"use client";

import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeTypes,
  type OnNodesChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Plus, Pencil } from "lucide-react";

/* ─── Types ──────────────────────────────────────── */

interface TaskData {
  _id: string;
  title: string;
  status: string;
  assigneeName: string;
  teamColor: string;
  teamName: string;
  deadline?: number;
  isAdmin: boolean;
  onEdit: (taskId: string) => void;
  onOpenDetail: (taskId: string) => void;
}

interface TeamSection {
  teamId: string;
  teamName: string;
  teamColor: string;
  tasks: {
    _id: string;
    title: string;
    status: string;
    assigneeName: string;
    flowX?: number;
    flowY?: number;
    deadline?: number;
  }[];
}

interface BriefFlowCanvasProps {
  briefId: Id<"briefs">;
  teams: TeamSection[];
  connections: { _id: string; sourceTaskId: string; targetTaskId: string }[];
  isAdmin: boolean;
  /** Optional: canvas no longer shows + nodes; kept for callers that may add tasks elsewhere. */
  onCreateTask?: (teamId: string) => void;
  onEditTask: (taskId: string) => void;
  onOpenTaskDetail: (taskId: string) => void;
  onDragToCreate?: (sourceTaskId: string, teamId: string, position: { x: number; y: number }) => void;
  /** Shows a dashed placeholder where the user dropped a connector (complete task in the side panel). */
  pendingDraft?: {
    x: number;
    y: number;
    teamId: string;
    teamName?: string;
    teamColor?: string;
  } | null;
  /** Opens team picker (e.g. add a team not yet on this brief). */
  onRequestAddTeam?: () => void;
}

/* ─── Status colors ──────────────────────────────── */

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: "#94a3b8", label: "Pending" },
  "in-progress": { color: "#f59e0b", label: "In Progress" },
  review: { color: "#8b5cf6", label: "Review" },
  done: { color: "#10b981", label: "Done" },
};

/* ─── Custom Task Node ───────────────────────────── */

function TaskNode({ data }: { data: TaskData }) {
  const status = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.pending;

  return (
    <div className="group relative">
      {/* Input handle (top) */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[var(--bg-hover)] !border-2 !border-white hover:!bg-[var(--accent-admin)] !transition-colors !-top-1.5"
      />

      {/* Card */}
      <div
        className="bg-white rounded-xl shadow-md border-2 border-[var(--border)] hover:shadow-lg hover:border-[var(--accent-admin)] transition-all cursor-pointer min-w-[180px] max-w-[220px]"
        onClick={() => data.onOpenDetail(data._id)}
      >
        {/* Color top bar + team name (inside the block) */}
        <div
          className="h-1.5 rounded-t-[10px]"
          style={{ backgroundColor: data.teamColor }}
        />
        <div className="px-3 pt-2 pb-0 flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: data.teamColor }}
          />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide truncate">
            {data.teamName}
          </span>
        </div>

        {/* Content */}
        <div className="px-3 py-2 pt-1">
          <div className="flex items-start justify-between gap-1.5">
            <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-tight line-clamp-2">
              {data.title}
            </p>
            {data.isAdmin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit(data._id);
                }}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all shrink-0"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: status.color }}
            />
            <span className="text-[10px] text-[var(--text-secondary)] truncate">
              {data.assigneeName}
            </span>
          </div>

          {data.deadline && (
            <p className="text-[9px] text-[var(--text-muted)] mt-1">
              {new Date(data.deadline).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>

        {/* Status badge */}
        <div className="px-3 pb-2">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{
              color: status.color,
              backgroundColor: `color-mix(in srgb, ${status.color} 12%, transparent)`,
            }}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Output handles: bottom + right (drag from either to connect) */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[var(--bg-hover)] !border-2 !border-white hover:!bg-[var(--accent-admin)] !transition-colors !-bottom-1.5"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[var(--bg-hover)] !border-2 !border-white hover:!bg-[var(--accent-admin)] !transition-colors !-right-1.5"
      />
    </div>
  );
}

/** Placeholder after drag-to-canvas until the side panel saves the new task. */
function DraftTaskNode({
  data,
}: {
  data: { teamName: string; teamColor: string };
}) {
  return (
    <div
      className="rounded-xl border-2 border-dashed px-4 py-3 min-w-[168px] max-w-[200px] shadow-sm"
      style={{
        borderColor: data.teamColor,
        background: `color-mix(in srgb, ${data.teamColor} 12%, white)`,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">New task</p>
      <p className="text-[11px] font-medium text-[var(--text-primary)] mt-1 line-clamp-2">{data.teamName}</p>
      <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">Finish in the panel on the right →</p>
    </div>
  );
}

/* ─── Node type registry ─────────────────────────── */

const nodeTypes: NodeTypes = {
  taskNode: TaskNode as any,
  draftTaskNode: DraftTaskNode as any,
};

/* ─── Main Component ─────────────────────────────── */

export function BriefFlowCanvas(props: BriefFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <BriefFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function BriefFlowCanvasInner({
  briefId,
  teams,
  connections,
  isAdmin,
  onEditTask,
  onOpenTaskDetail,
  onDragToCreate,
  pendingDraft,
  onRequestAddTeam,
}: BriefFlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const updatePositions = useMutation(api.tasks.updateTaskFlowPositions);
  const addConnection = useMutation(api.briefs.addTaskConnection);
  const removeConnection = useMutation(api.briefs.removeTaskConnection);

  const pendingPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingNodeId = useRef<string | null>(null);

  // Build nodes from teams data
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const TEAM_GAP_Y = 200;
    const TASK_GAP_X = 240;
    const TASK_START_X = 60;
    const TASK_START_Y_OFFSET = 32;

    teams.forEach((team, teamIdx) => {
      const teamBaseY = teamIdx * TEAM_GAP_Y + 40;

      // Task nodes only (team name is shown inside each card; no separate label / no + hash block)
      team.tasks.forEach((task, taskIdx) => {
        const defaultX = TASK_START_X + taskIdx * TASK_GAP_X;
        const defaultY = teamBaseY + TASK_START_Y_OFFSET;

        nodes.push({
          id: task._id,
          type: "taskNode",
          position: {
            x: task.flowX ?? defaultX,
            y: task.flowY ?? defaultY,
          },
          data: {
            _id: task._id,
            title: task.title,
            status: task.status,
            assigneeName: task.assigneeName,
            teamColor: team.teamColor,
            teamName: team.teamName,
            deadline: task.deadline,
            isAdmin,
            onEdit: onEditTask,
            onOpenDetail: onOpenTaskDetail,
          } satisfies TaskData,
        });
      });
    });

    // Build edges from connections
    connections.forEach((conn) => {
      edges.push({
        id: conn._id,
        source: conn.sourceTaskId,
        target: conn.targetTaskId,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#6366f1", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#6366f1",
          width: 16,
          height: 16,
        },
      });
    });

    if (pendingDraft) {
      const t = teams.find((x) => x.teamId === pendingDraft.teamId);
      nodes.push({
        id: "__pending-draft__",
        type: "draftTaskNode",
        position: { x: pendingDraft.x, y: pendingDraft.y },
        data: {
          teamName: pendingDraft.teamName ?? t?.teamName ?? "Selected team",
          teamColor: pendingDraft.teamColor ?? t?.teamColor ?? "var(--accent-admin)",
        },
        draggable: false,
        connectable: false,
        selectable: false,
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [teams, connections, isAdmin, onEditTask, onOpenTaskDetail, pendingDraft]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync external data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Handle node drag — batch position saves
  const handleNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      // Collect position changes for task nodes
      for (const change of changes) {
        if (
          change.type === "position" &&
          change.position &&
          change.id !== "__pending-draft__"
        ) {
          pendingPositions.current.set(change.id, change.position);
        }
      }

      // Debounce save
      if (pendingPositions.current.size > 0) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const positions = Array.from(pendingPositions.current.entries()).map(
            ([taskId, pos]) => ({
              taskId: taskId as Id<"tasks">,
              flowX: Math.round(pos.x),
              flowY: Math.round(pos.y),
            })
          );
          if (positions.length > 0) {
            updatePositions({ positions });
          }
          pendingPositions.current.clear();
        }, 500);
      }
    },
    [onNodesChange, updatePositions]
  );

  // Handle new connections
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      addConnection({
        briefId,
        sourceTaskId: connection.source as Id<"tasks">,
        targetTaskId: connection.target as Id<"tasks">,
      });
    },
    [briefId, addConnection]
  );

  // Handle edge deletion
  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        removeConnection({ connectionId: edge.id as Id<"taskConnections"> });
      }
    },
    [removeConnection]
  );

  // Track connection drag start to know the source node
  const onConnectStart = useCallback(
    (_: any, params: { nodeId: string | null }) => {
      connectingNodeId.current = params.nodeId;
    },
    []
  );

  // When connection is dropped on empty pane, trigger drag-to-create
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!onDragToCreate || !connectingNodeId.current) {
        connectingNodeId.current = null;
        return;
      }

      // Check if dropped on the pane (not on a node handle)
      const target = event.target as HTMLElement;
      const isPane = target.classList.contains("react-flow__pane") ||
        target.closest(".react-flow__pane");

      if (isPane) {
        const clientX = "clientX" in event ? event.clientX : event.touches[0].clientX;
        const clientY = "clientY" in event ? event.clientY : event.touches[0].clientY;
        const position = screenToFlowPosition({ x: clientX, y: clientY });

        // Find the team for the source task
        const sourceId = connectingNodeId.current;
        let sourceTeamId = "";
        for (const team of teams) {
          if (team.tasks.some((t) => t._id === sourceId)) {
            sourceTeamId = team.teamId;
            break;
          }
        }

        if (sourceTeamId) {
          onDragToCreate(sourceId, sourceTeamId, { x: Math.round(position.x), y: Math.round(position.y) });
        }
      }

      connectingNodeId.current = null;
    },
    [onDragToCreate, screenToFlowPosition, teams]
  );

  const accentStroke = "var(--accent-admin, #c4684d)";

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden border border-[var(--border)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--bg-primary)_92%,var(--accent-admin-dim))_0%,var(--bg-primary)_45%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
      {isAdmin && onRequestAddTeam && (
        <button
          type="button"
          onClick={onRequestAddTeam}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/95 border border-[var(--border)] text-[var(--text-primary)] shadow-sm hover:bg-[var(--accent-admin-dim)] hover:border-[var(--accent-admin)] transition-colors"
        >
          <Plus className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
          Add team to brief
        </button>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={handleEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        connectionLineStyle={{ stroke: accentStroke, strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: { stroke: accentStroke, strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: accentStroke,
          },
        }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="color-mix(in srgb, var(--accent-admin) 12%, transparent)" />
        <Controls
          showInteractive={false}
          className="!bg-white/95 !border-[var(--border)] !shadow-md !rounded-xl"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "draftTaskNode") return "var(--accent-admin)";
            const taskData = node.data as unknown as TaskData;
            return (STATUS_CONFIG[taskData?.status]?.color) ?? "#94a3b8";
          }}
          maskColor="rgba(241, 245, 249, 0.7)"
          className="!bg-white/95 !border-[var(--border)] !shadow-md !rounded-xl"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
