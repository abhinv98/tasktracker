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
  onCreateTask: (teamId: string) => void;
  onEditTask: (taskId: string) => void;
  onOpenTaskDetail: (taskId: string) => void;
  onDragToCreate?: (sourceTaskId: string, teamId: string, position: { x: number; y: number }) => void;
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
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-slate-300 !border-2 !border-white hover:!bg-blue-500 !transition-colors !-top-1.5"
      />

      {/* Card */}
      <div
        className="bg-white rounded-xl shadow-sm border-2 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer min-w-[180px] max-w-[220px]"
        onClick={() => data.onOpenDetail(data._id)}
      >
        {/* Color top bar */}
        <div
          className="h-1.5 rounded-t-[10px]"
          style={{ backgroundColor: data.teamColor }}
        />

        {/* Content */}
        <div className="px-3 py-2.5">
          <div className="flex items-start justify-between gap-1.5">
            <p className="text-[12px] font-semibold text-slate-800 leading-tight line-clamp-2">
              {data.title}
            </p>
            {data.isAdmin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit(data._id);
                }}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all shrink-0"
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
            <span className="text-[10px] text-slate-500 truncate">
              {data.assigneeName}
            </span>
          </div>

          {data.deadline && (
            <p className="text-[9px] text-slate-400 mt-1">
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

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-slate-300 !border-2 !border-white hover:!bg-blue-500 !transition-colors !-bottom-1.5"
      />
    </div>
  );
}

/* ─── Add Task Node (placeholder) ────────────────── */

function AddTaskNode({ data }: { data: { teamId: string; teamColor: string; onAdd: (teamId: string) => void } }) {
  return (
    <div
      onClick={() => data.onAdd(data.teamId)}
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all min-w-[160px] justify-center"
    >
      <Plus className="h-3.5 w-3.5 text-slate-400" />
      <span className="text-[11px] font-medium text-slate-400">Add Task</span>
    </div>
  );
}

/* ─── Team Label Node ────────────────────────────── */

function TeamLabelNode({ data }: { data: { teamName: string; teamColor: string; taskCount: number } }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm pointer-events-none select-none">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.teamColor }} />
      <span className="text-[12px] font-semibold text-slate-700">{data.teamName}</span>
      <span className="text-[10px] text-slate-400 tabular-nums">{data.taskCount}</span>
    </div>
  );
}

/* ─── Node type registry ─────────────────────────── */

const nodeTypes: NodeTypes = {
  taskNode: TaskNode as any,
  addTaskNode: AddTaskNode as any,
  teamLabel: TeamLabelNode as any,
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
  onCreateTask,
  onEditTask,
  onOpenTaskDetail,
  onDragToCreate,
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
    const TEAM_LABEL_X = 40;
    const TASK_START_X = 60;
    const TASK_START_Y_OFFSET = 50;

    teams.forEach((team, teamIdx) => {
      const teamBaseY = teamIdx * TEAM_GAP_Y + 40;

      // Team label node (non-draggable, non-connectable)
      nodes.push({
        id: `team-${team.teamId}`,
        type: "teamLabel",
        position: { x: TEAM_LABEL_X, y: teamBaseY },
        data: {
          teamName: team.teamName,
          teamColor: team.teamColor,
          taskCount: team.tasks.length,
        },
        draggable: false,
        connectable: false,
        selectable: false,
      });

      // Task nodes
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

      // "Add Task" button node
      if (isAdmin) {
        nodes.push({
          id: `add-${team.teamId}`,
          type: "addTaskNode",
          position: {
            x: TASK_START_X + team.tasks.length * TASK_GAP_X,
            y: teamBaseY + TASK_START_Y_OFFSET,
          },
          data: {
            teamId: team.teamId,
            teamColor: team.teamColor,
            onAdd: onCreateTask,
          },
          draggable: false,
          connectable: false,
          selectable: false,
        });
      }
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

    return { initialNodes: nodes, initialEdges: edges };
  }, [teams, connections, isAdmin, onEditTask, onOpenTaskDetail, onCreateTask]);

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
        if (change.type === "position" && change.position && !change.id.startsWith("team-") && !change.id.startsWith("add-")) {
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
      // Don't allow connecting non-task nodes
      if (connection.source.startsWith("team-") || connection.source.startsWith("add-")) return;
      if (connection.target.startsWith("team-") || connection.target.startsWith("add-")) return;

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

  return (
    <div className="w-full h-full">
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
        connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: { stroke: "#6366f1", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#6366f1",
          },
        }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls
          showInteractive={false}
          className="!bg-white !border-slate-200 !shadow-md !rounded-xl"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "teamLabel") return "transparent";
            if (node.type === "addTaskNode") return "transparent";
            const taskData = node.data as unknown as TaskData;
            return (STATUS_CONFIG[taskData?.status]?.color) ?? "#94a3b8";
          }}
          maskColor="rgba(241, 245, 249, 0.7)"
          className="!bg-white !border-slate-200 !shadow-md !rounded-xl"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
