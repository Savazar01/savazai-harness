"use client";

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Bot,
  Wrench,
  Sparkles,
  Clock,
  Users,
  Trash2,
  Settings,
  FileCode,
  Check,
  Upload,
  Download,
  RefreshCw,
  Play,
  CalendarClock,
  Plus,
  X,
  ArrowRight,
  CornerDownRight,
  Save,
  FlaskConical,
  ArrowLeft,
  Pencil,
  ChevronLeft,
  LayoutGrid,
} from "lucide-react";
import { AgentDrawer } from "./agent-drawer";
import { TestSandbox } from "./test-sandbox";
import { TeamNode } from "./nodes/team-node";
import { getTeamDimensions, migrateLegacyCanvasDefinition, RawNode, RawEdge } from "@/lib/agentflow-utils";

export interface ToolReference {
  id: string;
  name: string;
  category: "native" | "mcp" | "custom" | "open";
  mcpServerId?: string;
  config?: Record<string, unknown>;
}

export interface ModelConfig {
  provider: string;
  model: string;
  temperature: number;
}

export type AgentRole = "supervisor" | "worker" | "synthesizer" | "scheduled" | "team";

export interface CanvasNode {
  id: string;
  label: string;
  roleTemplate: AgentRole;
  systemPrompt: string;
  modelConfig: ModelConfig;
  tools: ToolReference[];
  ragNamespace?: string;
  embedModel?: string;
  hitlPolicy?: "always" | "on_delete" | "on_mutate" | "never";
  memoryCheckpoint?: boolean;
  kvPersistence?: boolean;
  piiMaskingOverride?: string;
  x: number;
  y: number;
  parentId?: string;
  collapsed?: boolean;
  customColor?: string;
  width?: number;
  height?: number;
  data?: {
    executionMode?: "plan_first" | "direct";
    customColor?: string;
    [key: string]: unknown;
  };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  conditionExpression?: string;
}

export interface CanvasEditorHandle {
  getSnapshot: () => { nodes: CanvasNode[]; edges: CanvasEdge[] };
}

type NodeExecStatus = "idle" | "running" | "success" | "failed";

interface CanvasEditorProps {
  initialNodes?: CanvasNode[];
  initialEdges?: CanvasEdge[];
  globalSystemPrompt?: string;
  workflowName?: string;
  workflowStatus?: "draft" | "published";
  onSave?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  onSaveDraft?: (nodes: CanvasNode[], edges: CanvasEdge[]) => Promise<boolean> | void;
  onPublish?: (canvasJson: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  onRename?: () => void;
  workflowId?: string;
  canvasLoadKey?: number;
}

const ROLE_CONFIGS: Record<AgentRole, { icon: typeof Bot; label: string; border: string; bg: string; accent: string }> = {
  supervisor: { icon: Bot, label: "Supervisor Agent", border: "border-indigo-500/30", bg: "bg-indigo-500/10", accent: "indigo" },
  team: { icon: Users, label: "Agent Team", border: "border-indigo-500/40", bg: "bg-indigo-950/20", accent: "indigo" },
  worker: { icon: Wrench, label: "Worker / Specialist Agent", border: "border-cyan-500/30", bg: "bg-cyan-500/10", accent: "cyan" },
  synthesizer: { icon: Sparkles, label: "Synthesizer Agent", border: "border-fuchsia-500/50", bg: "bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-slate-950/60", accent: "fuchsia" },
  scheduled: { icon: Clock, label: "Scheduled Autonomous Worker", border: "border-amber-500/30", bg: "bg-amber-500/10", accent: "amber" },
};

const NODE_CUSTOM_COLORS: Record<string, { bg: string; border: string; accent: string; dot: string; ring: string }> = {
  emerald: { bg: "bg-gradient-to-br from-emerald-950/60 via-slate-950/70 to-emerald-950/40", border: "border-emerald-500/60", accent: "emerald", dot: "#10b981", ring: "ring-emerald-500/40" },
  cyan: { bg: "bg-gradient-to-br from-cyan-950/60 via-slate-950/70 to-cyan-950/40", border: "border-cyan-500/60", accent: "cyan", dot: "#06b6d4", ring: "ring-cyan-500/40" },
  indigo: { bg: "bg-gradient-to-br from-indigo-950/60 via-slate-950/70 to-indigo-950/40", border: "border-indigo-500/60", accent: "indigo", dot: "#6366f1", ring: "ring-indigo-500/40" },
  purple: { bg: "bg-gradient-to-br from-purple-950/60 via-slate-950/70 to-purple-950/40", border: "border-purple-500/60", accent: "purple", dot: "#a855f7", ring: "ring-purple-500/40" },
  amber: { bg: "bg-gradient-to-br from-amber-950/60 via-slate-950/70 to-amber-950/40", border: "border-amber-500/60", accent: "amber", dot: "#f59e0b", ring: "ring-amber-500/40" },
  rose: { bg: "bg-gradient-to-br from-rose-950/60 via-slate-950/70 to-rose-950/40", border: "border-rose-500/60", accent: "rose", dot: "#f43f5e", ring: "ring-rose-500/40" },
  slate: { bg: "bg-gradient-to-br from-slate-900/80 via-slate-950/70 to-slate-900/60", border: "border-slate-600/60", accent: "slate", dot: "#94a3b8", ring: "ring-slate-500/40" },
};

const ROLE_DEFAULT_PROMPTS: Record<AgentRole, string> = {
  supervisor: "You are the Supervisor Agent. Coordinate workflow dispatch across specialist teams and worker agents, delegate tasks, and manage overall execution flow.",
  team: "Specialist Team Container. Formulate collective sub-plans and execute grouped specialist tasks.",
  worker: "You are a Worker / Specialist Agent. Execute bound MCP and native tools to complete assigned sub-tasks. Report results back to the supervisor.",
  synthesizer: "You are the Synthesizer Agent. Aggregate outputs from all sub-agents and format them into a cohesive, well-structured response.",
  scheduled: "You are a Scheduled Autonomous Worker. Execute recurring tasks autonomously on a defined cron schedule. Report execution results.",
};

const DEFAULT_NODES: CanvasNode[] = [
  {
    id: "node-supervisor-1",
    label: "Primary Supervisor",
    roleTemplate: "supervisor",
    systemPrompt: ROLE_DEFAULT_PROMPTS.supervisor,
    modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.2 },
    tools: [],
    memoryCheckpoint: true,
    kvPersistence: false,
    x: 80,
    y: 150,
  },
  {
    id: "node-team-1",
    label: "Operations & Logistics Team",
    roleTemplate: "team",
    systemPrompt: ROLE_DEFAULT_PROMPTS.team,
    modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.2 },
    tools: [],
    memoryCheckpoint: true,
    kvPersistence: false,
    x: 440,
    y: 80,
    collapsed: false,
    width: 620,
    height: 340,
  },
  {
    id: "node-worker-1",
    label: "Data Specialist",
    roleTemplate: "worker",
    systemPrompt: ROLE_DEFAULT_PROMPTS.worker,
    modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
    tools: [
      { id: "tool-1", name: "list_guests", category: "mcp", mcpServerId: "wedplanai" },
    ],
    memoryCheckpoint: true,
    kvPersistence: false,
    parentId: "node-team-1",
    x: 472,
    y: 160,
  },
  {
    id: "node-synthesizer-1",
    label: "Response Synthesizer",
    roleTemplate: "synthesizer",
    systemPrompt: ROLE_DEFAULT_PROMPTS.synthesizer,
    modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
    tools: [],
    memoryCheckpoint: true,
    kvPersistence: false,
    x: 1150,
    y: 150,
  },
];

const DEFAULT_EDGES: CanvasEdge[] = [
  { id: "edge-1", source: "node-supervisor-1", target: "node-team-1" },
  { id: "edge-2", source: "node-team-1", target: "node-synthesizer-1" },
];

function getNodePortPosition(node: CanvasNode, type: "input" | "output"): { x: number; y: number } {
  if (node.roleTemplate === "team") {
    const isCollapsed = node.collapsed ?? false;
    const dims = getTeamDimensions(4, isCollapsed, node.width, node.height);
    const width = isCollapsed ? 280 : dims.width;
    return {
      x: type === "input" ? node.x : node.x + width,
      y: node.y + 32,
    };
  }
  return {
    x: type === "input" ? node.x : node.x + 180,
    y: node.y + 28,
  };
}

function generateSmoothStepPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  borderRadius = 14,
  offset = 24,
): { path: string; mx: number; my: number } {
  if (endX >= startX + offset * 2) {
    const midX = (startX + endX) / 2;
    const r = Math.min(borderRadius, Math.abs(endY - startY) / 2, Math.abs(endX - startX) / 4);
    const signY = endY >= startY ? 1 : -1;

    if (Math.abs(endY - startY) < 2) {
      return {
        path: `M ${startX} ${startY} L ${endX} ${endY}`,
        mx: (startX + endX) / 2,
        my: (startY + endY) / 2,
      };
    }

    const path = [
      `M ${startX} ${startY}`,
      `L ${midX - r} ${startY}`,
      `Q ${midX} ${startY}, ${midX} ${startY + signY * r}`,
      `L ${midX} ${endY - signY * r}`,
      `Q ${midX} ${endY}, ${midX + r} ${endY}`,
      `L ${endX} ${endY}`,
    ].join(" ");

    return {
      path,
      mx: midX,
      my: (startY + endY) / 2,
    };
  } else {
    const r = Math.min(borderRadius, 8);
    const midY = (startY + endY) / 2;
    const signY = endY >= startY ? 1 : -1;
    const path = [
      `M ${startX} ${startY}`,
      `L ${startX + offset - r} ${startY}`,
      `Q ${startX + offset} ${startY}, ${startX + offset} ${startY + signY * r}`,
      `L ${startX + offset} ${midY - signY * r}`,
      `Q ${startX + offset} ${midY}, ${startX + offset - r} ${midY}`,
      `L ${endX - offset + r} ${midY}`,
      `Q ${endX - offset} ${midY}, ${endX - offset} ${midY + signY * r}`,
      `L ${endX - offset} ${endY - signY * r}`,
      `Q ${endX - offset} ${endY}, ${endX - offset + r} ${endY}`,
      `L ${endX} ${endY}`,
    ].join(" ");

    return {
      path,
      mx: (startX + endX) / 2,
      my: midY,
    };
  }
}

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(function CanvasEditor({
  initialNodes = DEFAULT_NODES,
  initialEdges = DEFAULT_EDGES,
  globalSystemPrompt = "",
  workflowName = "Untitled Agentflow",
  workflowStatus = "draft",
  onSave,
  onSaveDraft,
  onPublish,
  onRename,
  workflowId,
  canvasLoadKey = 0,
}: CanvasEditorProps, ref) {
  // Run initial legacy migration on mount
  const migratedInitial = React.useMemo(() => {
    const res = migrateLegacyCanvasDefinition(
      { nodes: initialNodes as unknown as RawNode[], edges: initialEdges as unknown as RawEdge[] },
      workflowName
    );
    return {
      nodes: (res.nodes || []) as unknown as CanvasNode[],
      edges: (res.edges || []) as unknown as CanvasEdge[],
    };
  }, [initialNodes, initialEdges, workflowName]);

  const [nodes, setNodes] = useState<CanvasNode[]>(migratedInitial.nodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(migratedInitial.edges);
  const [importAlert, setImportAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (importAlert) {
      const t = setTimeout(() => setImportAlert(null), 4000);
      return () => clearTimeout(t);
    }
  }, [importAlert]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowType, setWorkflowType] = useState<"interactive" | "scheduled">("interactive");
  const [cronSchedule, setCronSchedule] = useState("0 8 * * *");
  const [scheduledPrompt, setScheduledPrompt] = useState("");
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  const [linkMousePos, setLinkMousePos] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [edgePopover, setEdgePopover] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [conditionInput, setConditionInput] = useState("");
  const [showConditionEditor, setShowConditionEditor] = useState(false);
  const [retargetEdgeId, setRetargetEdgeId] = useState<string | null>(null);
  const [showTestSandbox, setShowTestSandbox] = useState(false);
  const [canvasNodeStatus, setCanvasNodeStatus] = useState<Record<string, NodeExecStatus>>({});
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("savazai_palette_collapsed") === "true";
    }
    return false;
  });

  // Studio Infinite Canvas & Multi-selection
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });
  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>({});
  const dragStartMouse = useRef({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({ nodes: nodesRef.current, edges: edgesRef.current }),
  }));

  // Restore canvas from localStorage on mount or when canvasLoadKey/workflowId changes
  useEffect(() => {
    if (!workflowId) return;
    const saved = localStorage.getItem(`savazai_canvas_${workflowId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.nodes && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          const migrated = migrateLegacyCanvasDefinition(parsed, workflowName);
          setNodes((migrated.nodes || []) as unknown as CanvasNode[]);
          setEdges((migrated.edges || []) as unknown as CanvasEdge[]);
          return;
        }
      } catch { /* ignore corrupt data */ }
    }
    const migrated = migrateLegacyCanvasDefinition(
      { nodes: initialNodes as unknown as RawNode[], edges: initialEdges as unknown as RawEdge[] },
      workflowName
    );
    setNodes((migrated.nodes || []) as unknown as CanvasNode[]);
    setEdges((migrated.edges || []) as unknown as CanvasEdge[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasLoadKey, workflowId]);

  // Immediate localStorage write on canvas mutation
  useEffect(() => {
    if (!workflowId) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`savazai_canvas_${workflowId}`, JSON.stringify({ nodes, edges }));
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges, workflowId]);

  // Visibility change: sync to localStorage when tab goes hidden
  useEffect(() => {
    if (!workflowId) return;
    const onHidden = () => {
      const { nodes: nn, edges: ee } = { nodes: nodesRef.current, edges: edgesRef.current };
      if (nn.length > 0) {
        localStorage.setItem(`savazai_canvas_${workflowId}`, JSON.stringify({ nodes: nn, edges: ee }));
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [workflowId]);

  useEffect(() => {
    const spec = {
      id: "canvas-1",
      name: workflowName,
      version: "1.0.0",
      workflowType,
      ...(workflowType === "scheduled" ? { cronSchedule, scheduledPrompt: scheduledPrompt || globalSystemPrompt } : {}),
      globalSystemPrompt,
      nodes: nodes.map((n) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { x, y, ...rest } = n;
        return rest;
      }),
      edges,
    };
    setJsonText(JSON.stringify(spec, null, 2));
  }, [nodes, edges, globalSystemPrompt, workflowType, cronSchedule, scheduledPrompt, workflowName]);

  // ── Add Node with Mandatory Team Membership Enforcement ──
  const handleAddNode = useCallback((roleTemplate: AgentRole) => {
    const id = `node-${roleTemplate}-${crypto.randomUUID()}`;
    const config = ROLE_CONFIGS[roleTemplate];
    const isTeam = roleTemplate === "team";
    const isWorker = roleTemplate === "worker" || roleTemplate === "scheduled";

    // 1. If adding a Team Container:
    if (isTeam) {
      const dims = getTeamDimensions(0, false);
      const newTeamNode: CanvasNode = {
        id,
        label: "New Specialist Team",
        roleTemplate: "team",
        systemPrompt: ROLE_DEFAULT_PROMPTS.team,
        modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.2 },
        tools: [],
        memoryCheckpoint: true,
        kvPersistence: false,
        x: 440,
        y: 100,
        collapsed: false,
        width: dims.width,
        height: dims.height,
      };

      const supervisor = nodes.find((n) => n.roleTemplate === "supervisor");
      const synthesizer = nodes.find((n) => n.roleTemplate === "synthesizer");
      const autoEdges: CanvasEdge[] = [];
      if (supervisor) {
        autoEdges.push({
          id: `edge-${crypto.randomUUID()}`,
          source: supervisor.id,
          target: id,
        });
      }
      if (synthesizer) {
        autoEdges.push({
          id: `edge-${crypto.randomUUID()}`,
          source: id,
          target: synthesizer.id,
        });
      }

      setNodes((prev) => [...prev, newTeamNode]);
      if (autoEdges.length > 0) {
        setEdges((prev) => [...prev, ...autoEdges]);
      }
      setSelectedNodeId(id);
      return;
    }

    // 2. If adding a Specialist Worker: MUST reside inside a team!
    if (isWorker) {
      let targetTeam = nodes.find((n) => n.id === selectedNodeId && n.roleTemplate === "team") ||
                         nodes.find((n) => n.roleTemplate === "team");

      const additionalNodes: CanvasNode[] = [];
      const autoEdges: CanvasEdge[] = [];

      // If no team exists on canvas, create one automatically
      if (!targetTeam) {
        const teamId = `node-team-${crypto.randomUUID()}`;
        const dims = getTeamDimensions(1, false);
        targetTeam = {
          id: teamId,
          label: `${workflowName.replace(/\s*\(Draft\)\s*/i, "").trim()} Team`,
          roleTemplate: "team",
          systemPrompt: ROLE_DEFAULT_PROMPTS.team,
          modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.2 },
          tools: [],
          memoryCheckpoint: true,
          kvPersistence: false,
          x: 440,
          y: 80,
          collapsed: false,
          width: dims.width,
          height: dims.height,
        };
        additionalNodes.push(targetTeam);

        const supervisor = nodes.find((n) => n.roleTemplate === "supervisor");
        const synthesizer = nodes.find((n) => n.roleTemplate === "synthesizer");
        if (supervisor) {
          autoEdges.push({ id: `edge-${crypto.randomUUID()}`, source: supervisor.id, target: teamId });
        }
        if (synthesizer) {
          autoEdges.push({ id: `edge-${crypto.randomUUID()}`, source: teamId, target: synthesizer.id });
        }
      }

      const existingWorkers = nodes.filter((n) => n.parentId === targetTeam!.id);
      const count = existingWorkers.length;
      const dims = getTeamDimensions(count + 1, false, targetTeam.width, targetTeam.height);
      const col = count % dims.cols;
      const row = Math.floor(count / dims.cols);

      const CARD_W = 260;
      const CARD_H = 110;
      const GAP_X = 24;
      const GAP_Y = 20;
      const PADDING_TOP = 80;
      const PADDING_X = 32;

      const workerX = targetTeam.x + PADDING_X + col * (CARD_W + GAP_X);
      const workerY = targetTeam.y + PADDING_TOP + row * (CARD_H + GAP_Y);

      const newWorkerNode: CanvasNode = {
        id,
        label: `Specialist ${count + 1}`,
        roleTemplate,
        systemPrompt: ROLE_DEFAULT_PROMPTS[roleTemplate],
        modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
        tools: [],
        memoryCheckpoint: true,
        kvPersistence: false,
        parentId: targetTeam.id,
        x: workerX,
        y: workerY,
      };

      setNodes((prev) => {
        return prev
          .map((n) => (n.id === targetTeam!.id ? { ...n, collapsed: false, width: dims.width, height: dims.height } : n))
          .concat(additionalNodes)
          .concat(newWorkerNode);
      });

      if (autoEdges.length > 0) {
        setEdges((prev) => [...prev, ...autoEdges]);
      }

      setSelectedNodeId(id);
      setDrawerOpen(true);
      return;
    }

    // 3. Supervisor or Synthesizer:
    const newNode: CanvasNode = {
      id,
      label: config.label,
      roleTemplate,
      systemPrompt: ROLE_DEFAULT_PROMPTS[roleTemplate],
      modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
      tools: [],
      memoryCheckpoint: true,
      kvPersistence: false,
      x: roleTemplate === "supervisor" ? 80 : 1200,
      y: 150,
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  }, [nodes, selectedNodeId, workflowName]);

  const handleAddWorkerToTeam = useCallback((teamId: string) => {
    const team = nodes.find((n) => n.id === teamId);
    if (!team) return;

    const existingChildren = nodes.filter((n) => n.parentId === teamId);
    const count = existingChildren.length;
    const dims = getTeamDimensions(count + 1, false, team.width, team.height);
    const col = count % dims.cols;
    const row = Math.floor(count / dims.cols);

    const CARD_W = 260;
    const CARD_H = 110;
    const GAP_X = 24;
    const GAP_Y = 20;
    const PADDING_TOP = 80;
    const PADDING_X = 32;

    const workerX = team.x + PADDING_X + col * (CARD_W + GAP_X);
    const workerY = team.y + PADDING_TOP + row * (CARD_H + GAP_Y);

    const id = `node-worker-${crypto.randomUUID()}`;
    const newNode: CanvasNode = {
      id,
      label: `Specialist ${count + 1}`,
      roleTemplate: "worker",
      systemPrompt: ROLE_DEFAULT_PROMPTS.worker,
      modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
      tools: [],
      memoryCheckpoint: true,
      kvPersistence: false,
      parentId: teamId,
      x: workerX,
      y: workerY,
    };

    setNodes((prev) =>
      prev
        .map((n) => (n.id === teamId ? { ...n, collapsed: false, width: dims.width, height: dims.height } : n))
        .concat(newNode)
    );
    setSelectedNodeId(id);
    setDrawerOpen(true);
  }, [nodes]);

  const handleToggleTeamCollapse = useCallback((teamId: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === teamId ? { ...n, collapsed: !n.collapsed } : n))
    );
  }, []);

  const handleRenameNode = useCallback((nodeId: string, newLabel: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, label: newLabel } : n))
    );
  }, []);

  const handleResizeTeam = useCallback((teamId: string, width: number, height: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === teamId ? { ...n, width, height } : n))
    );
  }, []);

  const handleQuickAddWorker = useCallback((sourceNodeId: string) => {
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;
    const targetTeamId = sourceNode.roleTemplate === "team" ? sourceNode.id : sourceNode.parentId || nodes.find(n => n.roleTemplate === "team")?.id;
    if (targetTeamId) {
      handleAddWorkerToTeam(targetTeamId);
    } else {
      handleAddNode("worker");
    }
  }, [nodes, handleAddWorkerToTeam, handleAddNode]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes((prev) => {
      return prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: undefined } : n));
    });
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
    setDeleteConfirmId(null);
  }, []);

  const connectedEdgeCount = deleteConfirmId
    ? edges.filter((e) => e.source === deleteConfirmId || e.target === deleteConfirmId).length
    : 0;
  const deletingNodeLabel = deleteConfirmId
    ? nodes.find((n) => n.id === deleteConfirmId)?.label || "this agent"
    : "";

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const isSvgOrCanvas = e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "grid-container";
    if (!isSvgOrCanvas) return;

    setSelectedEdgeId(null);
    setEdgePopover(null);
    setRetargetEdgeId(null);
    setLinkingSourceId(null);
    setLinkMousePos(null);

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (e.shiftKey) {
      setSelectionBox({
        startX: mouseX,
        startY: mouseY,
        currentX: mouseX,
        currentY: mouseY
      });
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    } else {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { x: pan.x, y: pan.y };
    }
  }, [pan]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    let newSelected: string[];
    if (e.shiftKey) {
      newSelected = selectedNodeIds.includes(id)
        ? selectedNodeIds.filter(nid => nid !== id)
        : [...selectedNodeIds, id];
    } else {
      newSelected = selectedNodeIds.includes(id) ? selectedNodeIds : [id];
    }

    setSelectedNodeIds(newSelected);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setEdgePopover(null);
    setRetargetEdgeId(null);

    setDraggingNodeId(id);

    if (canvasRef.current) {
      dragStartMouse.current = { x: e.clientX, y: e.clientY };
      const startPositions: Record<string, { x: number; y: number }> = {};
      newSelected.forEach(nid => {
        const n = nodes.find(node => node.id === nid);
        if (n) {
          startPositions[nid] = { x: n.x, y: n.y };
          if (n.roleTemplate === "team") {
            nodes.filter(c => c.parentId === n.id).forEach(c => {
              startPositions[c.id] = { x: c.x, y: c.y };
            });
          }
        }
      });
      if (!startPositions[id]) {
        const n = nodes.find(node => node.id === id);
        if (n) {
          startPositions[id] = { x: n.x, y: n.y };
          if (n.roleTemplate === "team") {
            nodes.filter(c => c.parentId === n.id).forEach(c => {
              startPositions[c.id] = { x: c.x, y: c.y };
            });
          }
        }
      }
      dragStartPositions.current = startPositions;
    }
  }, [nodes, selectedNodeIds]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    if (draggingNodeId) {
      const dx = (e.clientX - dragStartMouse.current.x) / zoom;
      const dy = (e.clientY - dragStartMouse.current.y) / zoom;
      const draggedNode = nodes.find(n => n.id === draggingNodeId);

      setNodes((prev) =>
        prev.map((n) => {
          const start = dragStartPositions.current[n.id];
          if (start) {
            return {
              ...n,
              x: start.x + dx,
              y: start.y + dy
            };
          }
          if (draggedNode?.roleTemplate === "team" && n.parentId === draggingNodeId) {
            const childStart = dragStartPositions.current[n.id];
            if (childStart) {
              return { ...n, x: childStart.x + dx, y: childStart.y + dy };
            }
          }
          return n;
        })
      );

      // Bounding box collision detection for worker reparenting
      if (draggedNode?.roleTemplate === "worker") {
        const localX = (e.clientX - rect.left - pan.x) / zoom;
        const localY = (e.clientY - rect.top - pan.y) / zoom;

        const targetTeam = nodes.find(team => {
          if (team.roleTemplate !== "team") return false;
          const isCollapsed = team.collapsed ?? false;
          const dims = getTeamDimensions(4, isCollapsed, team.width, team.height);
          const w = isCollapsed ? 280 : dims.width;
          const h = isCollapsed ? 90 : dims.height;
          return localX >= team.x - 20 && localX <= team.x + w + 20 &&
                 localY >= team.y - 20 && localY <= team.y + h + 20;
        });

        setHoveredTeamId(targetTeam?.id || null);
      }
    } else if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({
        x: panOffset.current.x + dx,
        y: panOffset.current.y + dy
      });
    } else if (selectionBox) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      setSelectionBox(prev => prev ? {
        ...prev,
        currentX: mouseX,
        currentY: mouseY
      } : null);
    }

    if (linkingSourceId) {
      const localX = (e.clientX - rect.left - pan.x) / zoom;
      const localY = (e.clientY - rect.top - pan.y) / zoom;
      setLinkMousePos({ x: localX, y: localY });
    }
  }, [draggingNodeId, isPanning, selectionBox, linkingSourceId, zoom, nodes, pan.x, pan.y]);

  const handleCanvasMouseUp = useCallback(() => {
    if (linkingSourceId && canvasRef.current && linkMousePos) {
      const SNAP_RADIUS = 50;
      const targetNode = nodes.find((n) => {
        if (n.id === linkingSourceId) return false;
        const parentTeam = n.parentId ? nodes.find(p => p.id === n.parentId) : null;
        if (parentTeam && (parentTeam.collapsed ?? false)) return false;

        const port = getNodePortPosition(n, "input");
        const dist = Math.hypot(linkMousePos.x - port.x, linkMousePos.y - port.y);
        return dist < SNAP_RADIUS;
      });

      if (targetNode) {
        const exists = edges.some((e) => e.source === linkingSourceId && e.target === targetNode.id);
        if (!exists) {
          setEdges((prev) => [...prev, { id: `edge-${crypto.randomUUID()}`, source: linkingSourceId, target: targetNode.id }]);
        }
      }
    } else if (draggingNodeId) {
      // Reparenting drop execution: ensure workers stay inside a team
      const draggedNode = nodes.find(n => n.id === draggingNodeId);
      if (draggedNode?.roleTemplate === "worker") {
        if (hoveredTeamId) {
          setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, parentId: hoveredTeamId } : n));
        } else if (!draggedNode.parentId) {
          // If unparented, attach to first available team
          const firstTeam = nodes.find(n => n.roleTemplate === "team");
          if (firstTeam) {
            setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, parentId: firstTeam.id } : n));
          }
        }
      }
    } else if (selectionBox && canvasRef.current) {
      const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
      const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
      const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
      const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

      const localX1 = (x1 - pan.x) / zoom;
      const localX2 = (x2 - pan.x) / zoom;
      const localY1 = (y1 - pan.y) / zoom;
      const localY2 = (y2 - pan.y) / zoom;

      const newlySelected = nodes.filter(n => {
        const hCenter = n.x + 90;
        const vCenter = n.y + 35;
        return hCenter >= localX1 && hCenter <= localX2 && vCenter >= localY1 && vCenter <= localY2;
      }).map(n => n.id);

      setSelectedNodeIds(newlySelected);
      if (newlySelected.length === 1) {
        setSelectedNodeId(newlySelected[0]);
      }
    }

    setDraggingNodeId(null);
    setHoveredTeamId(null);
    setIsPanning(false);
    setSelectionBox(null);
    setLinkingSourceId(null);
    setLinkMousePos(null);
  }, [linkingSourceId, linkMousePos, draggingNodeId, hoveredTeamId, selectionBox, nodes, edges, pan, zoom]);

  const handleOutputHandleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setLinkingSourceId(nodeId);
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const localX = (e.clientX - rect.left - pan.x) / zoom;
      const localY = (e.clientY - rect.top - pan.y) / zoom;
      setLinkMousePos({ x: localX, y: localY });
    }
  }, [pan, zoom]);

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setRetargetEdgeId(null);
    setDrawerOpen(true);
  }, []);

  const handleUpdateNode = useCallback((updatedNode: CanvasNode) => {
    setNodes((prev) => prev.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
  }, []);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
    setEdgePopover(null);
    setRetargetEdgeId(null);
  }, []);

  const handleEdgeClick = useCallback((e: React.MouseEvent, edgeId: string) => {
    e.stopPropagation();
    setSelectedEdgeId(edgeId === selectedEdgeId ? null : edgeId);
    setRetargetEdgeId(null);
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setEdgePopover({ edgeId, x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [selectedEdgeId]);

  const handleSetCondition = useCallback(() => {
    if (!edgePopover) return;
    setEdges((prev) => prev.map((e) => (e.id === edgePopover.edgeId ? { ...e, conditionExpression: conditionInput || undefined } : e)));
    setShowConditionEditor(false);
    setConditionInput("");
    setEdgePopover(null);
    setSelectedEdgeId(null);
  }, [edgePopover, conditionInput]);

  const handleRetargetEdge = useCallback((edgeId: string, newTargetId: string) => {
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, target: newTargetId } : e)));
    setRetargetEdgeId(null);
    setEdgePopover(null);
    setSelectedEdgeId(null);
  }, []);

  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.05;
    let nextZoom = zoom - e.deltaY * zoomIntensity * 0.01;
    nextZoom = Math.max(0.1, Math.min(2.5, nextZoom));

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const mouseXOnCanvas = (mouseX - pan.x) / zoom;
      const mouseYOnCanvas = (mouseY - pan.y) / zoom;

      const nextPanX = mouseX - mouseXOnCanvas * nextZoom;
      const nextPanY = mouseY - mouseYOnCanvas * nextZoom;

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    }
  }, [zoom, pan.x, pan.y]);

  const handleFitView = useCallback(() => {
    if (nodes.length === 0 || !canvasRef.current) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const isTeam = n.roleTemplate === "team";
      const dims = getTeamDimensions(4, n.collapsed ?? false, n.width, n.height);
      const w = isTeam ? (n.collapsed ? 280 : dims.width) : 180;
      const h = isTeam ? (n.collapsed ? 90 : dims.height) : 70;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + w);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + h);
    });

    const rect = canvasRef.current.getBoundingClientRect();
    const graphW = Math.max(maxX - minX, 100);
    const graphH = Math.max(maxY - minY, 100);

    const zoomW = (rect.width * 0.82) / graphW;
    const zoomH = (rect.height * 0.82) / graphH;
    const nextZoom = Math.max(0.25, Math.min(1.2, Math.min(zoomW, zoomH)));

    const nextPanX = (rect.width - graphW * nextZoom) / 2 - minX * nextZoom;
    const nextPanY = (rect.height - graphH * nextZoom) / 2 - minY * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, [nodes]);

  // ── Auto-Migrating Smart Multi-Team "Auto-Align Flow" Formatter ──
  const handleAutoAlign = useCallback(() => {
    if (nodes.length === 0) return;

    // Migrate any loose workers first
    const migrated = migrateLegacyCanvasDefinition(
      { nodes: nodes as unknown as RawNode[], edges: edges as unknown as RawEdge[] },
      workflowName
    );

    const activeNodes = (migrated.nodes || []) as unknown as CanvasNode[];
    const supervisor = activeNodes.find(n => n.roleTemplate === "supervisor") || activeNodes[0];
    const synthesizer = activeNodes.find(n => n.roleTemplate === "synthesizer");
    const teams = activeNodes.filter(n => n.roleTemplate === "team");

    const updatedNodes = [...activeNodes];
    const newEdges: CanvasEdge[] = [];

    const numTeams = teams.length;
    let teamCols = 1;
    if (numTeams >= 5) teamCols = 3;
    else if (numTeams >= 3) teamCols = 2;
    else teamCols = 1;

    const startMatrixX = 440;
    const hasExpandedTeams = teams.some(t => t.collapsed === false);
    const colSpacing = hasExpandedTeams ? 980 : 340;

    let maxGridY = 80;
    let maxGridX = startMatrixX;

    teams.forEach((team, idx) => {
      const col = idx % teamCols;
      const row = Math.floor(idx / teamCols);
      const teamX = startMatrixX + col * colSpacing;
      const isCollapsed = team.collapsed ?? false;

      const teamWorkers = updatedNodes.filter(n => n.parentId === team.id);
      const dims = getTeamDimensions(teamWorkers.length, isCollapsed, team.width, team.height);
      const rowHeight = isCollapsed ? 120 : (dims.height + 40);

      const teamY = 80 + row * rowHeight;
      maxGridY = Math.max(maxGridY, teamY + dims.height);
      maxGridX = Math.max(maxGridX, teamX + (isCollapsed ? 280 : dims.width));

      const tIdx = updatedNodes.findIndex(n => n.id === team.id);
      if (tIdx !== -1) {
        updatedNodes[tIdx] = {
          ...updatedNodes[tIdx],
          x: teamX,
          y: teamY,
          width: dims.width,
          height: dims.height,
        };
      }

      teamWorkers.forEach((w, wIdx) => {
        const wCol = wIdx % dims.cols;
        const wRow = Math.floor(wIdx / dims.cols);
        const CARD_W = 260;
        const CARD_H = 110;
        const GAP_X = 24;
        const GAP_Y = 20;
        const PADDING_TOP = 80;
        const PADDING_X = 32;

        const workerX = teamX + PADDING_X + wCol * (CARD_W + GAP_X);
        const workerY = teamY + PADDING_TOP + wRow * (CARD_H + GAP_Y);
        const nwIdx = updatedNodes.findIndex(n => n.id === w.id);
        if (nwIdx !== -1) {
          updatedNodes[nwIdx] = {
            ...updatedNodes[nwIdx],
            x: workerX,
            y: workerY,
          };
        }
      });

      if (supervisor && supervisor.id !== team.id) {
        newEdges.push({
          id: `edge-${crypto.randomUUID()}`,
          source: supervisor.id,
          target: team.id,
        });
      }

      if (synthesizer && synthesizer.id !== team.id) {
        newEdges.push({
          id: `edge-${crypto.randomUUID()}`,
          source: team.id,
          target: synthesizer.id,
        });
      }
    });

    const totalCenterY = Math.max(120, (maxGridY - 80) / 2);
    if (supervisor) {
      const supIdx = updatedNodes.findIndex(n => n.id === supervisor.id);
      if (supIdx !== -1) {
        updatedNodes[supIdx] = {
          ...updatedNodes[supIdx],
          x: 80,
          y: totalCenterY,
        };
      }
    }

    const synthX = Math.max(startMatrixX + 600, maxGridX + 180);
    if (synthesizer) {
      const synthIdx = updatedNodes.findIndex(n => n.id === synthesizer.id);
      if (synthIdx !== -1) {
        updatedNodes[synthIdx] = {
          ...updatedNodes[synthIdx],
          x: synthX,
          y: totalCenterY,
        };
      }
    }

    setNodes(updatedNodes);
    setEdges(newEdges);

    setTimeout(() => {
      handleFitView();
    }, 60);
  }, [nodes, edges, workflowName, handleFitView]);

  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    try {
      if (onSaveDraft) {
        const ok = await onSaveDraft(nodes, edges);
        if (ok === false) {
          setPublishStatus({ type: "error", msg: "DB save failed." });
          return;
        }
      }
      setPublishStatus({ type: "success", msg: "Agentflow draft saved successfully!" });
    } catch {
      setPublishStatus({ type: "error", msg: "Failed to save draft." });
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, onSaveDraft]);

  const handleImportJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        setImportAlert({ type: "error", message: "Invalid Canvas JSON: 'nodes' must be an array" });
        return;
      }
      const migrated = migrateLegacyCanvasDefinition(parsed, workflowName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rehydratedNodes = (migrated.nodes || []).map((n: Record<string, any>, idx: number) => ({
        ...n,
        roleTemplate: n.roleTemplate || "worker",
        x: n.x ?? (100 + (idx % 3) * 200),
        y: n.y ?? (100 + Math.floor(idx / 3) * 150),
        tools: n.tools || [],
        memoryCheckpoint: n.memoryCheckpoint ?? true,
        kvPersistence: n.kvPersistence ?? false,
      }));
      setNodes(rehydratedNodes);
      setEdges((migrated.edges || []) as unknown as CanvasEdge[]);
      if (parsed.workflowType) setWorkflowType(parsed.workflowType);
      if (parsed.cronSchedule) setCronSchedule(parsed.cronSchedule);
      if (parsed.scheduledPrompt !== undefined) setScheduledPrompt(parsed.scheduledPrompt);
      setImportAlert({ type: "success", message: "Canvas imported and migrated to Team Architecture!" });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setImportAlert({ type: "error", message: `Failed to parse JSON: ${errMsg}` });
    }
  }, [jsonText, workflowName]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setPublishStatus(null);
    try {
      const spec = {
        id: "canvas-1",
        name: workflowName,
        version: "1.0.0",
        workflowType,
        ...(workflowType === "scheduled" ? { cronSchedule, scheduledPrompt: scheduledPrompt || globalSystemPrompt } : {}),
        globalSystemPrompt,
        nodes: nodes.map((n) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { x, y, ...rest } = n;
          return rest;
        }),
        edges,
      };
      const body = JSON.stringify(spec);

      let res;
      if (onPublish) {
        res = await onPublish(body);
      } else {
        const fetchRes = await fetch("/api/orchestrator/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await fetchRes.json();
        res = fetchRes.ok
          ? { success: true, message: data.message || "Canvas compiled and published successfully!" }
          : { success: false, error: data.error || "Graph compilation failed." };
      }

      setPublishStatus({
        type: res.success ? "success" : "error",
        msg: res.message || res.error || "Unknown result",
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setPublishStatus({ type: "error", msg: errMsg || "Connection error." });
    } finally {
      setPublishing(false);
    }
  }, [nodes, edges, globalSystemPrompt, workflowType, cronSchedule, scheduledPrompt, onPublish, workflowName]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const clickedEdge = edgePopover ? edges.find((e) => e.id === edgePopover.edgeId) : null;

  // Separate team nodes vs non-team nodes
  const teamNodes = nodes.filter((n) => n.roleTemplate === "team");
  const nonTeamNodes = nodes.filter((n) => n.roleTemplate !== "team");

  return (
    <div className="flex flex-col h-[650px] border border-slate-900 rounded-3xl bg-[#07070d]/60 backdrop-blur-md overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-slate-900 bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-4">
          <Bot className="h-5 w-5 text-indigo-400" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">{workflowName}</h4>
              {onRename && (
                <button
                  type="button"
                  onClick={onRename}
                  className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg transition-all"
                  title="Rename Agentflow"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                workflowStatus === "published"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}>
                {workflowStatus === "published" ? "Published" : "Draft"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Agent Team Architecture: Collapsible groups, clean bus routing, drag-to-reparent</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Align Flow Button */}
          <button
            type="button"
            onClick={handleAutoAlign}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:text-white hover:bg-indigo-900/50 shadow-sm transition-all"
            title="Auto-Align Flow: Arrange into clean Supervisor -> Teams -> Synthesizer columns"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-indigo-400" />
            <span>Auto Align</span>
          </button>

          {/* Workflow Type Toggle */}
          <div className="flex items-center bg-slate-900/60 border border-slate-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setWorkflowType("interactive")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                workflowType === "interactive"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Play className="h-3 w-3" /> Interactive
            </button>
            <button
              type="button"
              onClick={() => setWorkflowType("scheduled")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                workflowType === "scheduled"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <CalendarClock className="h-3 w-3" /> Scheduled
            </button>
          </div>

          {/* Save Draft */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40 transition-all disabled:opacity-40"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>

          {/* Test Workflow */}
          <button
            type="button"
            onClick={() => setShowTestSandbox(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-800 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 transition-all"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Test
          </button>

          <button
            type="button"
            onClick={() => setShowJsonPanel(!showJsonPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showJsonPanel
                ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
                : "border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            JSON
          </button>

          {onSave && (
            <button
              type="button"
              onClick={() => onSave(nodes, edges)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40 transition-all"
            >
              Save Progress
            </button>
          )}

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {publishing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {workflowType === "scheduled" ? "Publish Schedule" : "Publish"}
          </button>
        </div>
      </div>

      {/* Scheduled config bar */}
      {workflowType === "scheduled" && (
        <div className="flex items-center gap-4 px-6 py-2 border-b border-slate-900 bg-purple-950/20 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Cron Schedule</span>
          </div>
          <input
            type="text"
            value={cronSchedule}
            onChange={(e) => setCronSchedule(e.target.value)}
            placeholder="0 8 * * *"
            className="w-32 rounded-lg border border-purple-500/20 bg-slate-900/40 py-1 px-2.5 text-[10px] font-mono text-white outline-none focus:border-purple-500"
          />
          <span className="text-[9px] text-slate-300">e.g. 0 8 * * * (daily 8 AM)</span>
          <input
            type="text"
            value={scheduledPrompt}
            onChange={(e) => setScheduledPrompt(e.target.value)}
            placeholder="Optional: Scheduled run instruction..."
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900/40 py-1 px-2.5 text-[10px] text-white outline-none focus:border-purple-500 placeholder-slate-400"
          />
        </div>
      )}

      {/* Main Editor */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left Palette */}
        {!isPaletteCollapsed && (
          <div className="flex flex-col gap-2.5 p-4 border-r border-slate-900 bg-slate-950/20 shrink-0 w-48 relative animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Agent Palette</span>
              <button
                onClick={() => {
                  setIsPaletteCollapsed(true);
                  localStorage.setItem("savazai_palette_collapsed", "true");
                }}
                className="p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-white"
                title="Collapse Palette"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            {(Object.keys(ROLE_CONFIGS) as AgentRole[]).map((role) => {
              const config = ROLE_CONFIGS[role];
              const Icon = config.icon;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleAddNode(role)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 border transition-all text-left ${config.bg} ${config.border} hover:opacity-90 hover:scale-[1.02]`}
                >
                  <Icon className={`h-4 w-4 text-${config.accent}-400 shrink-0`} />
                  <span className="leading-tight truncate">
                    {role === "team" ? "Agent Team" : config.label.replace(" Agent", "").replace(" Autonomous Worker", "").replace("Worker / ", "")}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Canvas */}
        <div
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleCanvasWheel}
          className="flex-1 h-full bg-[#08080f] relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(#141424 1.2px, transparent 1.2px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
        >
          {/* Floating Palette Toggle Button */}
          {isPaletteCollapsed && (
            <button
              onClick={() => {
                setIsPaletteCollapsed(false);
                localStorage.setItem("savazai_palette_collapsed", "false");
              }}
              className="absolute left-4 top-4 z-30 p-2 rounded-xl bg-slate-950/80 backdrop-blur border border-slate-800 text-slate-300 hover:text-white shadow-xl hover:border-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold animate-in zoom-in-90 duration-100"
              title="Open Agent Palette"
            >
              <Bot className="h-4 w-4 text-indigo-400 shrink-0 animate-pulse" />
              <span>Palette</span>
            </button>
          )}

          {/* Zoom/Pan Transform Container (Infinite bounds) */}
          <div
            id="grid-container"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
              overflow: "visible",
            }}
            className="pointer-events-none"
          >
            <div className="w-full h-full relative pointer-events-auto" style={{ overflow: "visible" }}>
              {/* SVG Overlay for Orthogonal Bus Routing (Uncapped overflow) */}
              <svg
                ref={svgRef}
                className="absolute inset-0 pointer-events-none z-0"
                style={{ overflow: "visible", width: "100%", height: "100%" }}
              >
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#2d2d54" />
                  </marker>
                  <marker id="arrow-selected" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
                  </marker>
                </defs>

                {/* Rendered edges */}
                {edges.map((edge) => {
                  const src = nodes.find((n) => n.id === edge.source);
                  const tgt = nodes.find((n) => n.id === edge.target);
                  if (!src || !tgt) return null;

                  // Hide edges connected to child workers inside a collapsed team
                  const srcParent = src.parentId ? nodes.find(p => p.id === src.parentId) : null;
                  const tgtParent = tgt.parentId ? nodes.find(p => p.id === tgt.parentId) : null;
                  if ((srcParent && (srcParent.collapsed ?? false)) || (tgtParent && (tgtParent.collapsed ?? false))) {
                    return null;
                  }

                  const startPos = getNodePortPosition(src, "output");
                  const endPos = getNodePortPosition(tgt, "input");

                  const isSelected = selectedEdgeId === edge.id;
                  const { path, mx, my } = generateSmoothStepPath(startPos.x, startPos.y, endPos.x, endPos.y, 14, 24);

                  return (
                    <g key={edge.id} className="pointer-events-auto">
                      {/* Visible path */}
                      <path
                        d={path}
                        fill="none"
                        stroke={isSelected ? "#6366f1" : "#37376b"}
                        strokeWidth={isSelected ? 2.5 : 1.75}
                        markerEnd={`url(#${isSelected ? "arrow-selected" : "arrow"})`}
                      />
                      {/* Click hit area */}
                      <path
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        onClick={(e) => handleEdgeClick(e, edge.id)}
                      />
                      {/* Edge midpoint badge when selected */}
                      {isSelected && (
                        <g>
                          <rect
                            x={mx - 56}
                            y={my - 22}
                            width={112}
                            height={28}
                            rx={10}
                            fill="#0f0f1a"
                            stroke="#6366f1"
                            strokeWidth={1}
                            strokeOpacity={0.7}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEdgePopover({ edgeId: edge.id, x: mx, y: my });
                            }}
                          />
                          <foreignObject x={mx - 56} y={my - 22} width={112} height={28}>
                            <div className="flex items-center justify-center gap-1 h-full px-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setRetargetEdgeId(edge.id); }}
                                className="px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-300 text-[8px] font-bold hover:bg-indigo-600/40 transition-all whitespace-nowrap"
                              >
                                Re-target
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
                                className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 text-[8px] font-bold hover:bg-red-600/40 transition-all whitespace-nowrap"
                              >
                                Remove
                              </button>
                            </div>
                          </foreignObject>
                        </g>
                      )}
                      {edge.conditionExpression && (
                        <foreignObject x={mx - 60} y={my - 10} width="120" height="20">
                          <div className="bg-slate-900 border border-slate-800 text-[8px] font-mono text-slate-400 px-1 py-0.5 rounded text-center truncate">
                            {edge.conditionExpression}
                          </div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })}

                {/* Active drag link line */}
                {linkingSourceId && linkMousePos && (() => {
                  const src = nodes.find((n) => n.id === linkingSourceId);
                  if (!src) return null;
                  const startPos = getNodePortPosition(src, "output");
                  const { path } = generateSmoothStepPath(startPos.x, startPos.y, linkMousePos.x, linkMousePos.y, 14, 20);
                  return (
                    <path
                      d={path}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth={2}
                      strokeDasharray="5,3"
                      className="pointer-events-auto"
                    />
                  );
                })()}
              </svg>

              {/* 1. Render Team Group Containers First */}
              {teamNodes.map((team) => {
                const childWorkers = nodes.filter((n) => n.parentId === team.id);
                const isSelected = selectedNodeId === team.id || selectedNodeIds.includes(team.id);
                const isHoveredTarget = hoveredTeamId === team.id;

                return (
                  <TeamNode
                    key={team.id}
                    node={team}
                    childWorkers={childWorkers}
                    isSelected={isSelected}
                    isHoveredTarget={isHoveredTarget}
                    zoom={zoom}
                    onSelect={() => {
                      setSelectedNodeId(team.id);
                      setSelectedEdgeId(null);
                    }}
                    onDoubleClick={() => {
                      setSelectedNodeId(team.id);
                      setSelectedNodeIds([team.id]);
                      setRetargetEdgeId(null);
                      setDrawerOpen(true);
                    }}
                    onToggleCollapse={() => handleToggleTeamCollapse(team.id)}
                    onRename={(name) => handleRenameNode(team.id, name)}
                    onResize={(w, h) => handleResizeTeam(team.id, w, h)}
                    onAddWorker={() => handleAddWorkerToTeam(team.id)}
                    onDelete={() => setDeleteConfirmId(team.id)}
                    onOutputHandleMouseDown={(e) => handleOutputHandleMouseDown(e, team.id)}
                    onMouseDown={(e) => handleNodeMouseDown(e, team.id)}
                  />
                );
              })}

              {/* 2. Render Agent Nodes (Worker, Supervisor, Synthesizer, Scheduled) */}
              {nonTeamNodes.map((node) => {
                const parentTeam = node.parentId ? nodes.find((p) => p.id === node.parentId) : null;
                if (parentTeam && (parentTeam.collapsed ?? false)) {
                  return null;
                }

                const isSynth = node.roleTemplate === "synthesizer";
                const isSupervisor = node.roleTemplate === "supervisor";

                const config = ROLE_CONFIGS[node.roleTemplate] || ROLE_CONFIGS.worker;
                const customTheme = node.customColor && NODE_CUSTOM_COLORS[node.customColor] ? NODE_CUSTOM_COLORS[node.customColor] : null;
                const NodeIcon = config.icon;
                const isSelected = selectedNodeId === node.id || selectedNodeIds.includes(node.id);

                return (
                  <div
                    key={node.id}
                    className="absolute group"
                    style={{ left: `${node.x}px`, top: `${node.y}px` }}
                  >
                    {/* Input port (left side) */}
                    <div
                      className={`absolute w-3.5 h-3.5 rounded-full -left-[7px] top-[28px] z-20 cursor-crosshair hover:scale-125 transition-transform border-2 border-slate-950 ${
                        isSynth
                          ? "bg-fuchsia-500 ring-2 ring-fuchsia-400/50 shadow-md shadow-fuchsia-500/40"
                          : customTheme
                          ? `${customTheme.border.replace("border-", "bg-")} ring-2 ${customTheme.ring}`
                          : "bg-indigo-500"
                      }`}
                      title="Input port"
                    />

                    {/* Output port (right side) */}
                    <div
                      onMouseDown={(e) => handleOutputHandleMouseDown(e, node.id)}
                      className={`absolute w-3.5 h-3.5 rounded-full -right-[7px] top-[28px] z-20 cursor-crosshair hover:scale-125 transition-transform border-2 border-slate-950 ${
                        isSynth
                          ? "bg-fuchsia-400 ring-2 ring-fuchsia-400/50 shadow-md shadow-fuchsia-500/40"
                          : customTheme
                          ? `${customTheme.border.replace("border-", "bg-")} ring-2 ${customTheme.ring}`
                          : "bg-emerald-500"
                      }`}
                      title="Output port — drag to connect"
                    />

                    {/* Quick-add Worker button */}
                    {!isSynth && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleQuickAddWorker(node.id); }}
                        className="absolute -right-[14px] bottom-[10px] w-5 h-5 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center z-20 shadow-md shadow-indigo-600/30 transition-all hover:scale-110 hover:shadow-lg opacity-0 group-hover:opacity-100"
                        title="Quick-add connected Worker agent"
                      >
                        <Plus className="h-3 w-3 text-white" />
                      </button>
                    )}

                    {/* Node card */}
                    <div
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      onClick={() => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
                      onDoubleClick={(e) => handleNodeDoubleClick(e, node.id)}
                      className={`w-48 rounded-2xl border px-3.5 py-2.5 flex flex-col gap-1.5 transition-all select-none z-10 cursor-grab active:cursor-grabbing backdrop-blur-md shadow-xl ${
                        customTheme
                          ? `${customTheme.bg} ${customTheme.border} ${isSelected ? `ring-2 ${customTheme.ring} shadow-lg shadow-${customTheme.accent}-500/20` : "hover:border-white/40"}`
                          : isSynth
                          ? `border-2 border-fuchsia-500/50 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-slate-950/60 text-purple-200 shadow-[0_0_20px_rgba(217,70,239,0.18)] ${
                              isSelected ? "ring-2 ring-fuchsia-500 shadow-fuchsia-500/30 border-fuchsia-400" : "hover:border-fuchsia-400/70"
                            }`
                          : `${config.bg} ${config.border} ${
                              isSelected
                                ? isSupervisor ? "ring-2 ring-indigo-500/80 shadow-indigo-500/10" : "ring-2 ring-cyan-500/80 shadow-cyan-500/10"
                                : "hover:bg-slate-900/40"
                            }`
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between w-full">
                        <div className="relative">
                          <div className={`p-1.5 rounded-lg border shrink-0 ${
                            customTheme
                              ? `bg-slate-950/60 ${customTheme.border}`
                              : isSynth
                              ? "bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300"
                              : "bg-slate-950/40 border-slate-900"
                          }`}>
                            <NodeIcon className={`h-3.5 w-3.5 ${
                              customTheme
                                ? `text-${customTheme.accent}-400`
                                : isSynth
                                ? "text-fuchsia-300 animate-pulse"
                                : `text-${config.accent}-400`
                            }`} />
                          </div>
                          {/* Status Ring */}
                          {canvasNodeStatus[node.label] && canvasNodeStatus[node.label] !== "idle" && (
                            <span
                              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-950 ${
                                canvasNodeStatus[node.label] === "running"
                                  ? "bg-amber-400 animate-pulse"
                                  : canvasNodeStatus[node.label] === "success"
                                  ? "bg-emerald-500"
                                  : "bg-red-500"
                              }`}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); setDrawerOpen(true); }}
                            className="p-1 rounded-md bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white transition-all"
                            title="Configure"
                          >
                            <Settings className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(node.id); }}
                            className="p-1 rounded-md bg-red-950/50 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 transition-all"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <span className={`self-start px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                        customTheme
                          ? `bg-${customTheme.accent}-500/20 text-${customTheme.accent}-300 border ${customTheme.border}`
                          : isSupervisor ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/25" :
                          isSynth ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30" :
                          "bg-cyan-500/15 text-cyan-300 border border-cyan-500/25"
                      }`}>
                        {config.label.replace(" Agent", "").replace(" Autonomous Worker", "").replace("Worker / ", "")}
                      </span>

                      <div className="text-xs font-bold text-white truncate max-w-full">
                        {node.label}
                      </div>

                      <div className="flex items-center justify-between w-full mt-1 border-t border-slate-900/60 pt-1 shrink-0">
                        <span className="text-[8px] text-slate-400 truncate max-w-full">
                          {node.modelConfig?.provider}/{node.modelConfig?.model}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selection Box Outline */}
          {selectionBox && (
            <div
              className="absolute border border-indigo-500 bg-indigo-500/10 pointer-events-none z-30 rounded-lg"
              style={{
                left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`
              }}
            />
          )}

          {/* Floating Canvas Controls */}
          <div className="absolute bottom-4 left-4 flex items-center gap-1.5 p-1 bg-slate-950/85 backdrop-blur-md border border-slate-900 rounded-2xl shadow-xl z-30 select-none">
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 transition-all text-xs font-bold border border-transparent hover:border-slate-800"
              title="Zoom In (+)"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 transition-all text-xs font-bold border border-transparent hover:border-slate-800"
              title="Zoom Out (-)"
            >
              -
            </button>
            <span className="text-[9px] text-slate-500 px-1 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
            <div className="w-px h-4 bg-slate-800 mx-0.5" />
            <button
              type="button"
              onClick={handleFitView}
              className="px-2.5 h-7 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-all text-[9px] font-bold border border-transparent hover:border-slate-800"
              title="Focus & Fit View"
            >
              Fit View
            </button>
          </div>

          {/* Interactive Mini-map Overlay */}
          <div className="absolute bottom-4 right-4 w-32 h-20 rounded-2xl border border-slate-900 bg-slate-950/85 backdrop-blur-md overflow-hidden p-1 z-30 flex items-center justify-center pointer-events-none select-none">
            <div className="relative w-full h-full bg-slate-900/30 rounded-xl overflow-hidden">
              {nodes.map(n => {
                const scale = 0.04;
                const x = Math.max(2, Math.min(110, n.x * scale + 15));
                const y = Math.max(2, Math.min(70, n.y * scale + 10));
                const customTheme = n.customColor && NODE_CUSTOM_COLORS[n.customColor];
                const dotColor = customTheme
                  ? customTheme.dot
                  : n.roleTemplate === "supervisor" ? "#6366f1"
                  : n.roleTemplate === "team" ? "#818cf8"
                  : n.roleTemplate === "synthesizer" ? "#d946ef"
                  : "#06b6d4";

                return (
                  <div
                    key={n.id}
                    className="absolute w-2 h-1 rounded-sm"
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      backgroundColor: dotColor
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Re-target panel */}
          {retargetEdgeId && (() => {
            const edge = edges.find((e) => e.id === retargetEdgeId);
            if (!edge) return null;
            const currentTarget = nodes.find((n) => n.id === edge.target);
            return (
              <div className="absolute top-10 left-10 z-40 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-3 w-56 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Re-target Edge</span>
                  <button type="button" onClick={() => setRetargetEdgeId(null)} className="text-slate-500 hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {edge && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-300 mb-2">
                    <span className="font-mono truncate max-w-[70px]">{nodes.find((n) => n.id === edge.source)?.label || "?"}</span>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span className="font-mono truncate max-w-[70px] text-indigo-400">{currentTarget?.label || "?"}</span>
                  </div>
                )}
                <div className="space-y-1 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                  {nodes
                    .filter((n) => n.id !== edge.source)
                    .map((n) => {
                      const isCurrent = n.id === edge.target;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleRetargetEdge(retargetEdgeId, n.id)}
                          disabled={isCurrent}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-left transition-all ${
                            isCurrent
                              ? "bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 cursor-not-allowed"
                              : "bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300"
                          }`}
                        >
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span className="truncate">{n.label}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })()}

          {/* Edge Click Popover */}
          {edgePopover && clickedEdge && !retargetEdgeId && (
            <div
              className="absolute z-40 animate-in fade-in zoom-in-95 duration-100"
              style={{
                left: `${Math.min(edgePopover.x, 300)}px`,
                top: `${Math.max(edgePopover.y - 80, 10)}px`,
              }}
            >
              <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-3 w-56">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Edge Connection</span>
                  <button
                    type="button"
                    onClick={() => { setEdgePopover(null); setSelectedEdgeId(null); }}
                    className="text-slate-500 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {showConditionEditor ? (
                  <div className="space-y-2">
                    <label className="text-[9px] font-semibold text-slate-300 uppercase">Condition Expression</label>
                    <input
                      type="text"
                      value={conditionInput}
                      onChange={(e) => setConditionInput(e.target.value)}
                      placeholder={clickedEdge.conditionExpression || "e.g. result.status === 'ok'"}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/30 py-1.5 px-2.5 text-[10px] font-mono text-white outline-none focus:border-indigo-500"
                      autoFocus
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setShowConditionEditor(false); setConditionInput(""); }}
                        className="flex-1 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-[10px] font-semibold transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSetCondition}
                        className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-all"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] text-slate-300 mb-2">
                      <span className="font-mono truncate max-w-[80px]">
                        {nodes.find((n) => n.id === clickedEdge.source)?.label || clickedEdge.source}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="font-mono truncate max-w-[80px]">
                        {nodes.find((n) => n.id === clickedEdge.target)?.label || clickedEdge.target}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setRetargetEdgeId(clickedEdge.id); setEdgePopover(null); }}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all text-left"
                    >
                      <ArrowLeft className="h-3 w-3 text-indigo-400 shrink-0" />
                      Re-target Edge
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConditionEditor(true)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all text-left"
                    >
                      <CornerDownRight className="h-3 w-3 text-indigo-400 shrink-0" />
                      {clickedEdge.conditionExpression ? `Edit Condition (${clickedEdge.conditionExpression})` : "Set Condition"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEdge(edgePopover.edgeId)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-red-400 bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-all text-left"
                    >
                      <Trash2 className="h-3 w-3 shrink-0" />
                      Delete Connection
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Linking hint */}
          {linkingSourceId && (
            <div className="absolute bottom-4 left-4 bg-indigo-600/10 border border-indigo-500/20 text-[10px] text-indigo-400 rounded-xl px-3 py-1.5 backdrop-blur-sm z-30">
              Release mouse over a node port to connect
            </div>
          )}
        </div>

        {/* JSON Panel */}
        {showJsonPanel && (
          <div className="absolute right-0 top-0 bottom-0 w-80 border-l border-slate-900 bg-slate-950/95 backdrop-blur-md p-4 flex flex-col gap-3 z-30 animate-in slide-in-from-right duration-200">
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Canvas JSON Schema</span>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="flex-1 w-full rounded-xl border border-slate-900 bg-[#040408] p-3 text-[10px] text-slate-300 font-mono focus:border-indigo-500 outline-none resize-none [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800"
            />
            {importAlert && (
              <div className={`text-[10px] font-semibold border rounded-xl p-2.5 leading-relaxed ${
                importAlert.type === "success"
                  ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-400"
                  : "bg-red-950/30 border-red-500/20 text-red-400"
              }`}>
                {importAlert.type === "success" ? "✓" : "⚠️"} {importAlert.message}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImportJson}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <a
                href={`data:text/json;charset=utf-8,${encodeURIComponent(jsonText)}`}
                download="savazai-canvas.json"
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div onClick={() => setDeleteConfirmId(null)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl p-5 w-80 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Delete Node</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">&lsquo;{deletingNodeLabel}&rsquo;</strong>?
              This will unbind <strong className="text-white">{connectedEdgeCount}</strong> connected edge{connectedEdgeCount !== 1 ? "s" : ""}.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (deleteConfirmId) handleDeleteNode(deleteConfirmId); }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish status */}
      {publishStatus && (
        <div className={`absolute bottom-6 right-6 border rounded-2xl p-4 text-xs shadow-xl backdrop-blur-md max-w-sm flex gap-3 items-start z-40 ${
          publishStatus.type === "success"
            ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-300"
            : "border-red-500/30 bg-red-950/90 text-red-300"
        }`}>
          <div className="flex-1">
            <span className="font-bold block mb-1">
              {publishStatus.type === "success" ? "Success" : "Failed"}
            </span>
            <p className="opacity-80 leading-relaxed">{publishStatus.msg}</p>
          </div>
          <button type="button" onClick={() => setPublishStatus(null)} className="opacity-50 hover:opacity-100 font-bold">×</button>
        </div>
      )}

      {/* Agent Drawer */}
      {drawerOpen && selectedNode && (
        <AgentDrawer
          node={selectedNode}
          allNodes={nodes}
          onClose={() => setDrawerOpen(false)}
          onSave={handleUpdateNode}
        />
      )}

      {/* Test Sandbox Drawer */}
      {showTestSandbox && (
        <TestSandbox
          key={workflowId || "sandbox"}
          canvasJson={jsonText}
          onClose={() => setShowTestSandbox(false)}
          onNodeEvent={(label, event) => setCanvasNodeStatus(prev => ({ ...prev, [label]: event }))}
        />
      )}
    </div>
  );
});
