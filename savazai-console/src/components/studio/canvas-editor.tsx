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
  Copy,
  Maximize2,
  Minimize2,
  MoveDiagonal2,
  BookOpen,
  Waypoints,
} from "lucide-react";
import { AgentDrawer } from "./agent-drawer";
import { TestSandbox } from "./test-sandbox";
import { TeamNode } from "./nodes/team-node";
import { getTeamDimensions, migrateLegacyCanvasDefinition, sanitizeCanvasDefinition, RawNode, RawEdge } from "@/lib/agentflow-utils";
import { usePermissions } from "@/lib/auth/use-permissions";

export interface ToolReference {
  id: string;
  name: string;
  category: "native" | "mcp" | "custom" | "open" | string;
  mcpServerId?: string;
  config?: Record<string, unknown>;
}

export interface ModelConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export type AgentRole = "supervisor" | "worker" | "synthesizer" | "scheduled" | "team";

export interface CanvasNode {
  id: string;
  label: string;
  roleTemplate: AgentRole;
  systemPrompt: string;
  modelConfig?: ModelConfig;
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
  offsetY?: number;
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
  supervisor: { icon: Bot, label: "Supervisor Agent", border: "border-indigo-500/40", bg: "bg-card", accent: "indigo" },
  team: { icon: Users, label: "Agent Team", border: "border-indigo-500/40", bg: "bg-card", accent: "indigo" },
  worker: { icon: Wrench, label: "Worker / Specialist Agent", border: "border-teal-500/40", bg: "bg-card", accent: "teal" },
  synthesizer: { icon: Sparkles, label: "Synthesizer Agent", border: "border-purple-500/50", bg: "bg-card", accent: "purple" },
  scheduled: { icon: Clock, label: "Scheduled Autonomous Worker", border: "border-amber-500/40", bg: "bg-card", accent: "amber" },
};

const NODE_CUSTOM_COLORS: Record<string, {
  bg: string;
  border: string;
  accent: string;
  dot: string;
  ring: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconColor: string;
}> = {
  emerald: {
    bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
    border: "border-emerald-500/50 dark:border-emerald-500/60",
    accent: "emerald",
    dot: "#10b981",
    ring: "ring-emerald-500/40",
    badgeBg: "bg-emerald-100 dark:bg-emerald-500/20",
    badgeText: "text-emerald-800 dark:text-emerald-300",
    badgeBorder: "border-emerald-300 dark:border-emerald-500/30",
    iconColor: "text-emerald-600 dark:text-emerald-400"
  },
  cyan: {
    bg: "bg-cyan-50/70 dark:bg-cyan-950/30",
    border: "border-cyan-500/50 dark:border-cyan-500/60",
    accent: "cyan",
    dot: "#06b6d4",
    ring: "ring-cyan-500/40",
    badgeBg: "bg-cyan-100 dark:bg-cyan-500/20",
    badgeText: "text-cyan-800 dark:text-cyan-300",
    badgeBorder: "border-cyan-300 dark:border-cyan-500/30",
    iconColor: "text-cyan-600 dark:text-cyan-400"
  },
  indigo: {
    bg: "bg-indigo-50/70 dark:bg-indigo-950/30",
    border: "border-indigo-500/50 dark:border-indigo-500/60",
    accent: "indigo",
    dot: "#6366f1",
    ring: "ring-indigo-500/40",
    badgeBg: "bg-indigo-100 dark:bg-indigo-500/20",
    badgeText: "text-indigo-800 dark:text-indigo-300",
    badgeBorder: "border-indigo-300 dark:border-indigo-500/30",
    iconColor: "text-indigo-600 dark:text-indigo-400"
  },
  purple: {
    bg: "bg-purple-50/70 dark:bg-purple-950/30",
    border: "border-purple-500/50 dark:border-purple-500/60",
    accent: "purple",
    dot: "#a855f7",
    ring: "ring-purple-500/40",
    badgeBg: "bg-purple-100 dark:bg-purple-500/20",
    badgeText: "text-purple-800 dark:text-purple-300",
    badgeBorder: "border-purple-300 dark:border-purple-500/30",
    iconColor: "text-purple-600 dark:text-purple-400"
  },
  amber: {
    bg: "bg-amber-50/70 dark:bg-amber-950/30",
    border: "border-amber-500/50 dark:border-amber-500/60",
    accent: "amber",
    dot: "#f59e0b",
    ring: "ring-amber-500/40",
    badgeBg: "bg-amber-100 dark:bg-amber-500/20",
    badgeText: "text-amber-800 dark:text-amber-300",
    badgeBorder: "border-amber-300 dark:border-amber-500/30",
    iconColor: "text-amber-600 dark:text-amber-400"
  },
  rose: {
    bg: "bg-rose-50/70 dark:bg-rose-950/30",
    border: "border-rose-500/50 dark:border-rose-500/60",
    accent: "rose",
    dot: "#f43f5e",
    ring: "ring-rose-500/40",
    badgeBg: "bg-rose-100 dark:bg-rose-500/20",
    badgeText: "text-rose-800 dark:text-rose-300",
    badgeBorder: "border-rose-300 dark:border-rose-500/30",
    iconColor: "text-rose-600 dark:text-rose-400"
  },
  slate: {
    bg: "bg-muted/70 dark:bg-muted/40",
    border: "border-border",
    accent: "slate",
    dot: "#64748b",
    ring: "ring-border",
    badgeBg: "bg-muted dark:bg-muted/60",
    badgeText: "text-foreground",
    badgeBorder: "border-border",
    iconColor: "text-muted-foreground"
  },
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
  const cardWidth = node.width || 208;
  return {
    x: type === "input" ? node.x : node.x + cardWidth,
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
  offsetY = 0,
): { path: string; mx: number; my: number } {
  if (endX >= startX + offset * 2) {
    const midX = (startX + endX) / 2;
    const r = Math.min(borderRadius, Math.abs(endY - startY) / 2, Math.abs(endX - startX) / 4);
    const signY = endY >= startY ? 1 : -1;

    if (Math.abs(endY - startY) < 2 && Math.abs(offsetY) < 2) {
      return {
        path: `M ${startX} ${startY} L ${endX} ${endY}`,
        mx: (startX + endX) / 2,
        my: (startY + endY) / 2,
      };
    }

    if (offsetY !== 0) {
      const stepY = (startY + endY) / 2 + offsetY;
      const s1 = stepY >= startY ? 1 : -1;
      const s2 = endY >= stepY ? 1 : -1;
      const rStep = Math.min(borderRadius, Math.abs(stepY - startY) / 2, Math.abs(endY - stepY) / 2, 12);
      const path = [
        `M ${startX} ${startY}`,
        `L ${midX - rStep} ${startY}`,
        `Q ${midX} ${startY}, ${midX} ${startY + s1 * rStep}`,
        `L ${midX} ${stepY - s2 * rStep}`,
        `Q ${midX} ${stepY}, ${midX + (endX > midX ? 1 : -1) * rStep} ${stepY}`,
        `L ${endX - rStep} ${stepY}`,
        `Q ${endX} ${stepY}, ${endX} ${endY}`,
      ].join(" ");
      return {
        path,
        mx: midX,
        my: stepY,
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
    const midY = (startY + endY) / 2 + offsetY;
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
  const { hasPermission } = usePermissions();
  const canEditFlow = hasPermission("capability_studio", "edit_flow");
  const canSaveDraft = hasPermission("capability_studio", "save_draft");
  const canTestRun = hasPermission("capability_studio", "test_run");
  const canPublish = hasPermission("capability_studio", "publish");
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
  const [showConditionGuide, setShowConditionGuide] = useState(false);
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
  const [pan, setPan] = useState(() => {
    if (typeof window !== "undefined" && workflowId) {
      try {
        const savedVp = localStorage.getItem(`savazai_viewport_${workflowId}`);
        if (savedVp) {
          const parsed = JSON.parse(savedVp);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            return { x: parsed.x, y: parsed.y };
          }
        }
      } catch {}
    }
    return { x: 0, y: 0 };
  });

  const [zoom, setZoom] = useState(() => {
    if (typeof window !== "undefined" && workflowId) {
      try {
        const savedVp = localStorage.getItem(`savazai_viewport_${workflowId}`);
        if (savedVp) {
          const parsed = JSON.parse(savedVp);
          if (typeof parsed.zoom === "number" && parsed.zoom > 0) {
            return parsed.zoom;
          }
        }
      } catch {}
    }
    return 1;
  });

  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Ergonomic state: Hover detail magnification & auto-align animation
  const [magnifiedNodeId, setMagnifiedNodeId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoAligning, setIsAutoAligning] = useState(false);

  const handleAgentMouseEnter = useCallback((nodeId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setMagnifiedNodeId(nodeId);
    }, 400);
  }, []);

  const handleAgentMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setMagnifiedNodeId(null);
  }, []);

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

  // Restore canvas & viewport from localStorage on mount or when canvasLoadKey/workflowId changes
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
        }
      } catch { /* ignore corrupt data */ }
    } else {
      const migrated = migrateLegacyCanvasDefinition(
        { nodes: initialNodes as unknown as RawNode[], edges: initialEdges as unknown as RawEdge[] },
        workflowName
      );
      setNodes((migrated.nodes || []) as unknown as CanvasNode[]);
      setEdges((migrated.edges || []) as unknown as CanvasEdge[]);
    }

    const savedVp = localStorage.getItem(`savazai_viewport_${workflowId}`);
    if (savedVp) {
      try {
        const parsedVp = JSON.parse(savedVp);
        if (typeof parsedVp.x === "number" && typeof parsedVp.y === "number") {
          setPan({ x: parsedVp.x, y: parsedVp.y });
        }
        if (typeof parsedVp.zoom === "number" && parsedVp.zoom > 0) {
          setZoom(parsedVp.zoom);
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasLoadKey, workflowId]);

  // Persist Viewport State (Zoom & Pan) to localStorage
  useEffect(() => {
    if (!workflowId) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`savazai_viewport_${workflowId}`, JSON.stringify({ x: pan.x, y: pan.y, zoom }));
    }, 400);
    return () => clearTimeout(timer);
  }, [pan, zoom, workflowId]);

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

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    const newId = `node-${target.roleTemplate}-${Date.now().toString(36)}`;
    const duplicatedNode: CanvasNode = {
      ...target,
      id: newId,
      label: `${target.label} (Copy)`,
      x: target.x + 30,
      y: target.y + 30,
    };
    setNodes((prev) => [...prev, duplicatedNode]);
    setSelectedNodeId(newId);
    setSelectedNodeIds([newId]);
  }, [nodes]);

  const handleAgentResizeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, initialW: number, initialH: number) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;
      const newWidth = Math.max(260, Math.min(520, Math.round(initialW + dx)));
      const newHeight = Math.max(120, Math.min(420, Math.round(initialH + dy)));
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, width: newWidth, height: newHeight } : n))
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [zoom]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
    setEdgePopover(null);
    setRetargetEdgeId(null);
  }, []);

  const handleEdgeWaypointMouseDown = useCallback((e: React.MouseEvent, edgeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const targetEdge = edgesRef.current.find(ed => ed.id === edgeId);
    const initialOffset = targetEdge?.offsetY || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dy = (moveEvent.clientY - startY) / zoom;
      const newOffsetY = Math.round(initialOffset + dy);
      setEdges(prev => prev.map(ed => ed.id === edgeId ? { ...ed, offsetY: newOffsetY } : ed));
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [zoom]);

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
      const w = isTeam ? (n.collapsed ? 280 : (n.width || dims.width)) : (n.width || 208);
      const h = isTeam ? (n.collapsed ? 90 : (n.height || dims.height)) : (n.height || 120);
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

    const startTeamsX = 460;
    const TEAM_GAP_Y = 50;
    let currentTeamY = 80;
    let maxTeamW = 600;

    // 1. Arrange each team vertically stacked in center column
    teams.forEach((team) => {
      const isCollapsed = team.collapsed ?? false;
      const teamWorkers = updatedNodes.filter(n => n.parentId === team.id);
      const N = teamWorkers.length;

      // Calculate balanced grid for specialists inside team
      const cols = N <= 2 ? 2 : Math.min(3, Math.max(2, Math.ceil(Math.sqrt(N))));
      const rows = Math.max(1, Math.ceil(N / cols));

      const CARD_W = 260;
      const CARD_H = 110;
      const GAP_X = 24;
      const GAP_Y = 20;
      const PADDING_X = 32;
      const PADDING_TOP = 80;
      const PADDING_BOTTOM = 36;

      const teamW = isCollapsed ? 280 : (PADDING_X * 2 + cols * CARD_W + (cols - 1) * GAP_X);
      const teamH = isCollapsed ? 90 : (PADDING_TOP + PADDING_BOTTOM + rows * CARD_H + (rows - 1) * GAP_Y);
      maxTeamW = Math.max(maxTeamW, teamW);

      const teamX = startTeamsX;
      const teamY = currentTeamY;
      currentTeamY += teamH + TEAM_GAP_Y;

      const tIdx = updatedNodes.findIndex(n => n.id === team.id);
      if (tIdx !== -1) {
        updatedNodes[tIdx] = {
          ...updatedNodes[tIdx],
          x: teamX,
          y: teamY,
          width: teamW,
          height: teamH,
        };
      }

      // Position specialists inside team in balanced grid
      teamWorkers.forEach((w, wIdx) => {
        const wCol = wIdx % cols;
        const wRow = Math.floor(wIdx / cols);
        const workerX = teamX + PADDING_X + wCol * (CARD_W + GAP_X);
        const workerY = teamY + PADDING_TOP + wRow * (CARD_H + GAP_Y);
        const nwIdx = updatedNodes.findIndex(n => n.id === w.id);
        if (nwIdx !== -1) {
          updatedNodes[nwIdx] = {
            ...updatedNodes[nwIdx],
            x: workerX,
            y: workerY,
            width: CARD_W,
            height: CARD_H,
          };
        }
      });

      // Connect Supervisor -> Team
      if (supervisor && supervisor.id !== team.id) {
        newEdges.push({
          id: `edge-${crypto.randomUUID()}`,
          source: supervisor.id,
          target: team.id,
        });
      }

      // Connect Team -> Synthesizer
      if (synthesizer && synthesizer.id !== team.id) {
        newEdges.push({
          id: `edge-${crypto.randomUUID()}`,
          source: team.id,
          target: synthesizer.id,
        });
      }
    });

    // 2. Vertical span and common centerline
    const minTeamY = 80;
    const maxTeamY = Math.max(minTeamY + 200, currentTeamY - TEAM_GAP_Y);
    const teamCenterY = (minTeamY + maxTeamY) / 2;

    // 3. Position Supervisor (prominent width 320, height 180) in Left Column
    const SUP_W = 320;
    const SUP_H = 180;
    if (supervisor) {
      const supIdx = updatedNodes.findIndex(n => n.id === supervisor.id);
      if (supIdx !== -1) {
        updatedNodes[supIdx] = {
          ...updatedNodes[supIdx],
          x: 80,
          y: Math.max(80, Math.round(teamCenterY - (SUP_H / 2))),
          width: SUP_W,
          height: SUP_H,
        };
      }
    }

    // 4. Position Synthesizer (prominent width 300, height 180) in Right Column
    const SYN_W = 300;
    const SYN_H = 180;
    const synthX = startTeamsX + maxTeamW + 80;
    if (synthesizer) {
      const synthIdx = updatedNodes.findIndex(n => n.id === synthesizer.id);
      if (synthIdx !== -1) {
        updatedNodes[synthIdx] = {
          ...updatedNodes[synthIdx],
          x: synthX,
          y: Math.max(80, Math.round(teamCenterY - (SYN_H / 2))),
          width: SYN_W,
          height: SYN_H,
        };
      }
    }

    setIsAutoAligning(true);
    setNodes(updatedNodes);
    setEdges(newEdges);

    setTimeout(() => {
      setIsAutoAligning(false);
      handleFitView();
    }, 360);
  }, [nodes, edges, workflowName, handleFitView]);

  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    try {
      if (onSaveDraft) {
        const sanitizedNodes: CanvasNode[] = nodes.map((n) => ({
          ...n,
          modelConfig: n.modelConfig || (n.roleTemplate === "team" ? undefined : {
            provider: "openai",
            model: "gpt-4o-mini",
            temperature: 0.2,
          }),
          tools: (n.tools || []).map((t) => ({
            ...t,
            category: typeof t?.category === "string" && t.category ? t.category : "mcp",
          })),
        }));
        const ok = await onSaveDraft(sanitizedNodes, edges);
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
      setNodes(rehydratedNodes as unknown as CanvasNode[]);
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
      const rawSpec = {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sanitizedSpec = sanitizeCanvasDefinition(rawSpec as any);
      const body = JSON.stringify(sanitizedSpec);

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

      let displayError = res.error;
      if (typeof displayError === "string" && displayError.startsWith("{")) {
        try {
          const parsedErr = JSON.parse(displayError);
          if (parsedErr.error) {
            const detailsStr = Array.isArray(parsedErr.details)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? parsedErr.details.map((d: any) => `${d.path?.join(".")}: ${d.message || d.code}`).join("; ")
              : "";
            displayError = detailsStr ? `${parsedErr.error}: ${detailsStr}` : parsedErr.error;
          }
        } catch {}
      }

      setPublishStatus({
        type: res.success ? "success" : "error",
        msg: res.message || displayError || "Unknown result",
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
    <div className="flex flex-col h-[650px] border border-border rounded-3xl bg-card shadow-xs overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-4">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-foreground">{workflowName}</h4>
              {onRename && (
                <button
                  type="button"
                  onClick={onRename}
                  className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg transition-all cursor-pointer"
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
            <p className="text-[10px] text-muted-foreground">Agent Team Architecture: Collapsible groups, clean bus routing, drag-to-reparent</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Align Flow Button */}
          <button
            type="button"
            onClick={handleAutoAlign}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-border bg-muted/60 text-foreground hover:bg-muted shadow-xs transition-all cursor-pointer"
            title="Auto-Align Flow: Arrange into clean Supervisor -> Teams -> Synthesizer columns"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-primary" />
            <span>Auto Align</span>
          </button>

          {/* Workflow Type Toggle */}
          <div className="flex items-center bg-muted border border-border rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setWorkflowType("interactive")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                workflowType === "interactive"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Play className="h-3 w-3" /> Interactive
            </button>
            <button
              type="button"
              onClick={() => setWorkflowType("scheduled")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                workflowType === "scheduled"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarClock className="h-3 w-3" /> Scheduled
            </button>
          </div>

          {/* Save Draft */}
          {canSaveDraft && (
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all disabled:opacity-40"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Draft
            </button>
          )}

          {/* Test Workflow */}
          {canTestRun && (
            <button
              type="button"
              onClick={() => setShowTestSandbox(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all cursor-pointer"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Test
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowJsonPanel(!showJsonPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showJsonPanel
                ? "bg-primary/10 border-primary/40 text-primary font-bold"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            JSON
          </button>

          {onSave && canSaveDraft && (
            <button
              type="button"
              onClick={() => onSave(nodes, edges)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all cursor-pointer"
            >
              Save Progress
            </button>
          )}

          {canPublish && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {publishing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {workflowType === "scheduled" ? "Publish Schedule" : "Publish"}
            </button>
          )}
        </div>
      </div>

      {/* Scheduled config bar */}
      {workflowType === "scheduled" && (
        <div className="flex items-center gap-4 px-6 py-2 border-b border-border bg-purple-500/10 dark:bg-purple-950/20 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Cron Schedule</span>
          </div>
          <input
            type="text"
            value={cronSchedule}
            onChange={(e) => setCronSchedule(e.target.value)}
            placeholder="0 8 * * *"
            className="w-32 rounded-lg border border-purple-500/30 bg-background py-1 px-2.5 text-[10px] font-mono text-foreground outline-none focus:border-purple-500"
          />
          <span className="text-[9px] text-muted-foreground">e.g. 0 8 * * * (daily 8 AM)</span>
          <input
            type="text"
            value={scheduledPrompt}
            onChange={(e) => setScheduledPrompt(e.target.value)}
            placeholder="Optional: Scheduled run instruction..."
            className="flex-1 rounded-lg border border-border bg-background py-1 px-2.5 text-[10px] text-foreground outline-none focus:border-purple-500 placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Main Editor */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left Palette */}
        {!isPaletteCollapsed && (
          <div className="flex flex-col gap-2.5 p-4 border-r border-border bg-muted/40 shrink-0 w-48 relative animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Agent Palette</span>
              <button
                onClick={() => {
                  setIsPaletteCollapsed(true);
                  localStorage.setItem("savazai_palette_collapsed", "true");
                }}
                className="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground"
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
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground border transition-all text-left bg-card hover:bg-muted ${config.border} hover:scale-[1.02] shadow-xs`}
                >
                  <Icon className={`h-4 w-4 text-${config.accent}-600 dark:text-${config.accent}-400 shrink-0`} />
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
          className="flex-1 h-full bg-canvas relative overflow-hidden select-none canvas-cursor-grab active:canvas-cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(var(--canvas-grid) 1.5px, transparent 1.5px)",
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
              className="absolute left-4 top-4 z-30 p-2 rounded-xl bg-card/90 backdrop-blur border border-border text-foreground hover:bg-muted shadow-xl transition-all flex items-center gap-1.5 text-xs font-bold animate-in zoom-in-90 duration-100 cursor-pointer"
              title="Open Agent Palette"
            >
              <Bot className="h-4 w-4 text-primary shrink-0 animate-pulse" />
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
                  const { path, mx, my } = generateSmoothStepPath(startPos.x, startPos.y, endPos.x, endPos.y, 14, 24, edge.offsetY || 0);

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
                      {/* Draggable Waypoint Nudge Handle */}
                      {isSelected && (
                        <g
                          className="cursor-ns-resize pointer-events-auto"
                          onMouseDown={(e) => handleEdgeWaypointMouseDown(e, edge.id)}
                        >
                          <circle
                            cx={mx}
                            cy={my}
                            r={6.5}
                            className="fill-indigo-500 stroke-background stroke-2 shadow-md hover:scale-125 transition-transform"
                          />
                          <circle cx={mx} cy={my} r={2} className="fill-white" />
                        </g>
                      )}
                      {/* Edge midpoint badge when selected */}
                      {isSelected && (
                        <g>
                          <rect
                            x={mx - 56}
                            y={my - 22}
                            width={112}
                            height={28}
                            rx={10}
                            className="fill-card stroke-primary/80 shadow-md"
                            strokeWidth={1}
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
                                className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[8px] font-bold hover:bg-primary/20 transition-all whitespace-nowrap cursor-pointer"
                              >
                                Re-target
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
                                className="px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[8px] font-bold hover:bg-destructive/20 transition-all whitespace-nowrap cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          </foreignObject>
                        </g>
                      )}
                      {edge.conditionExpression && (
                        <foreignObject x={mx - 60} y={my - 10} width="120" height="20">
                          <div className="bg-card border border-border text-[8px] font-mono text-muted-foreground px-1 py-0.5 rounded text-center truncate">
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
                  <div
                    key={team.id}
                    style={{
                      transition: isAutoAligning ? "all 350ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
                    }}
                  >
                    <TeamNode
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
                  </div>
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
                    style={{
                      left: `${node.x}px`,
                      top: `${node.y}px`,
                      transition: isAutoAligning ? "left 350ms cubic-bezier(0.4, 0, 0.2, 1), top 350ms cubic-bezier(0.4, 0, 0.2, 1), width 350ms, height 350ms" : undefined,
                    }}
                    onMouseEnter={() => handleAgentMouseEnter(node.id)}
                    onMouseLeave={handleAgentMouseLeave}
                  >
                    {/* Hover Detail Magnification Card */}
                    {magnifiedNodeId === node.id && !node.collapsed && (
                      <div
                        className="absolute z-50 p-4 w-80 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl backdrop-blur-md pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
                        style={{ left: `${(node.width || 208) + 16}px`, top: "0px" }}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-border mb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <NodeIcon className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-xs font-bold truncate max-w-[170px] text-foreground">{node.label}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 shrink-0">
                            {config.label.replace(" Agent", "").replace(" Autonomous Worker", "").replace("Worker / ", "")}
                          </span>
                        </div>

                        <div className="space-y-2 text-[11px]">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Model Engine</span>
                            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded border border-border/50 text-foreground inline-block">
                              {node.modelConfig?.provider || "openai"} / {node.modelConfig?.model || "gpt-4o-mini"}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                              Bound Tools ({node.tools?.length || 0})
                            </span>
                            {node.tools && node.tools.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                {node.tools.map((t, idx) => (
                                  <span key={idx} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/60">
                                    {typeof t === "string" ? t : (t.name || t.toolId || "tool")}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic text-[10px]">No external tools bound</span>
                            )}
                          </div>

                          {node.systemPrompt && (
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">System Directive</span>
                              <p className="text-[10px] text-muted-foreground line-clamp-3 italic bg-muted/40 p-2 rounded-lg border border-border/40">
                                {node.systemPrompt}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                      style={{
                        width: node.width ? `${node.width}px` : "208px",
                        minHeight: node.collapsed ? "auto" : (node.height ? `${node.height}px` : "120px")
                      }}
                      className={`relative rounded-2xl border px-3.5 py-2.5 flex flex-col gap-1.5 transition-all select-none z-10 canvas-cursor-grab active:canvas-cursor-grabbing backdrop-blur-md shadow-md ${
                        customTheme
                          ? `${customTheme.bg} ${customTheme.border} ${isSelected ? `ring-2 ${customTheme.ring}` : "hover:border-foreground/30"}`
                          : isSynth
                          ? `border-2 border-purple-500/60 bg-card text-foreground shadow-md ${
                              isSelected ? "ring-2 ring-purple-500 shadow-purple-500/30 border-purple-400" : "hover:border-purple-400/70"
                            }`
                          : isSupervisor
                          ? `border-2 border-indigo-500/60 bg-card text-foreground shadow-md ${
                              isSelected ? "ring-2 ring-indigo-500 shadow-indigo-500/30 border-indigo-400" : "hover:border-indigo-400/70"
                            }`
                          : `border border-teal-500/40 bg-card text-foreground shadow-md ${
                              isSelected ? "ring-2 ring-teal-500 shadow-teal-500/30 border-teal-400" : "hover:border-teal-400/70"
                            }`
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="relative flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 rounded-lg border shrink-0 ${
                            customTheme
                              ? `${customTheme.badgeBg} ${customTheme.badgeBorder}`
                              : isSynth
                              ? "bg-purple-100 dark:bg-purple-500/20 border-purple-200 dark:border-purple-500/30"
                              : isSupervisor
                              ? "bg-indigo-100 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30"
                              : "bg-teal-100 dark:bg-teal-500/20 border-teal-200 dark:border-teal-500/30"
                          }`}>
                            <NodeIcon className={`h-3.5 w-3.5 ${
                              customTheme
                                ? customTheme.iconColor
                                : isSynth
                                ? "text-purple-600 dark:text-purple-400 animate-pulse"
                                : isSupervisor
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-teal-600 dark:text-teal-400"
                            }`} />
                          </div>
                          {/* Status Ring */}
                          {canvasNodeStatus[node.label] && canvasNodeStatus[node.label] !== "idle" && (
                            <span
                              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-background ${
                                canvasNodeStatus[node.label] === "running"
                                  ? "bg-amber-400 animate-pulse"
                                  : canvasNodeStatus[node.label] === "success"
                                  ? "bg-emerald-500"
                                  : "bg-red-500"
                              }`}
                            />
                          )}
                          {node.collapsed && (
                            <div className="text-xs font-bold text-foreground truncate min-w-0">
                              {node.label}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNodes((prev) =>
                                prev.map((n) => (n.id === node.id ? { ...n, collapsed: !n.collapsed } : n))
                              );
                            }}
                            className="p-1 rounded-md bg-card border border-border hover:bg-muted text-foreground/70 hover:text-foreground shadow-xs transition-all cursor-pointer"
                            title={node.collapsed ? "Expand agent card" : "Collapse agent card"}
                          >
                            {node.collapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); setDrawerOpen(true); }}
                            className="p-1 rounded-md bg-card border border-border hover:bg-muted text-foreground/70 hover:text-foreground shadow-xs transition-all cursor-pointer"
                            title="Configure Agent"
                          >
                            <Settings className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDuplicateNode(node.id); }}
                            className="p-1 rounded-md bg-card border border-border hover:bg-muted text-foreground/70 hover:text-foreground shadow-xs transition-all cursor-pointer"
                            title="Duplicate Agent"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(node.id); }}
                            className="p-1 rounded-md bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 text-destructive shadow-xs transition-all cursor-pointer"
                            title="Delete Agent"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {!node.collapsed && (
                        <>
                          <span className={`self-start px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
                            customTheme
                              ? `${customTheme.badgeBg} ${customTheme.badgeText} ${customTheme.badgeBorder}`
                              : isSupervisor ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30" :
                              isSynth ? "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30" :
                              "bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30"
                          }`}>
                            {config.label.replace(" Agent", "").replace(" Autonomous Worker", "").replace("Worker / ", "")}
                          </span>

                          <div className="text-xs font-bold text-foreground truncate max-w-full">
                            {node.label}
                          </div>

                          <div className="flex items-center justify-between w-full mt-auto border-t border-border/60 pt-1 shrink-0">
                            <span className="text-[8px] text-muted-foreground truncate max-w-full font-mono">
                              {node.modelConfig?.provider}/{node.modelConfig?.model}
                            </span>
                            {node.tools && node.tools.length > 0 && (
                              <span className="text-[8px] px-1 rounded bg-muted text-muted-foreground font-mono">
                                {node.tools.length} tool{node.tools.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>

                          {/* Resize corner handle */}
                          {isSelected && (
                            <div
                              onMouseDown={(e) => handleAgentResizeMouseDown(e, node.id, node.width || 208, node.height || 120)}
                              className="absolute -right-1.5 -bottom-1.5 w-4 h-4 cursor-nwse-resize z-30 flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground rounded-tl shadow-md transition-all group/resize"
                              title="Drag to resize agent card"
                            >
                              <MoveDiagonal2 className="w-2.5 h-2.5 transition-transform group-hover/resize:scale-110" />
                            </div>
                          )}
                        </>
                      )}
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
          <div className="absolute bottom-4 left-4 flex items-center gap-1.5 p-1 bg-card/90 backdrop-blur-md border border-border rounded-2xl shadow-xl z-30 select-none text-foreground">
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-xs font-bold border border-transparent hover:border-border cursor-pointer"
              title="Zoom In (+)"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-xs font-bold border border-transparent hover:border-border cursor-pointer"
              title="Zoom Out (-)"
            >
              -
            </button>
            <span className="text-[9px] text-muted-foreground px-1 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button
              type="button"
              onClick={handleFitView}
              className="px-2.5 h-7 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-[9px] font-bold border border-transparent hover:border-border cursor-pointer"
              title="Focus & Fit View"
            >
              Fit View
            </button>
          </div>

          {/* Interactive Mini-map Overlay */}
          <div className="absolute bottom-4 right-4 w-32 h-20 rounded-2xl border border-border bg-card/90 backdrop-blur-md overflow-hidden p-1 z-30 flex items-center justify-center pointer-events-none select-none">
            <div className="relative w-full h-full bg-muted/40 rounded-xl overflow-hidden">
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
              <div className="absolute top-10 left-10 z-40 bg-background border border-border rounded-2xl shadow-2xl p-3 w-56 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Re-target Edge</span>
                  <button type="button" onClick={() => setRetargetEdgeId(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {edge && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
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
                              ? "bg-primary/10 border border-primary/30 text-primary cursor-not-allowed font-medium"
                              : "bg-card border border-border hover:border-border text-muted-foreground hover:text-foreground"
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
                left: `${Math.max(16, Math.min(edgePopover.x - 140, (canvasRef.current?.clientWidth || 900) - (showConditionEditor ? 380 : 260)))}px`,
                top: `${Math.max(16, edgePopover.y - 100)}px`,
              }}
            >
              <div className={`bg-card border border-border rounded-2xl shadow-2xl p-4 text-card-foreground ${showConditionEditor ? "w-80 sm:w-96" : "w-64"}`}>
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-border/60">
                  <span className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Waypoints className="h-3.5 w-3.5 text-primary" />
                    Edge Connection
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEdgePopover(null); setSelectedEdgeId(null); setShowConditionEditor(false); }}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {showConditionEditor ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Condition Expression
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowConditionGuide(true)}
                        className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        title="Open syntax and variable reference"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>Syntax Guide</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      value={conditionInput}
                      onChange={(e) => setConditionInput(e.target.value)}
                      placeholder={clickedEdge.conditionExpression || "e.g. context.last_output.requires_manager_approval === true"}
                      className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      autoFocus
                    />

                    {/* Quick Template Chips */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider block">
                        Quick Templates:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { label: "Approval Required", expr: "context.last_output.requires_manager_approval === true" },
                          { label: "Low Confidence", expr: "context.confidence < 0.75" },
                          { label: "Dispute Intent", expr: "context.intent === 'dispute'" },
                          { label: "Approved Flag", expr: "context.is_approved === true" },
                        ].map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => setConditionInput(chip.expr)}
                            className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 border border-border transition-all cursor-pointer truncate max-w-full"
                            title={`Insert: ${chip.expr}`}
                          >
                            + {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => { setShowConditionEditor(false); setConditionInput(""); }}
                        className="flex-1 py-1.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSetCondition}
                        className="flex-1 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        Apply Condition
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1 p-2 rounded-xl bg-muted/40 border border-border/50">
                      <span className="font-mono truncate max-w-[90px] text-foreground font-semibold">
                        {nodes.find((n) => n.id === clickedEdge.source)?.label || clickedEdge.source}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
                      <span className="font-mono truncate max-w-[90px] text-foreground font-semibold">
                        {nodes.find((n) => n.id === clickedEdge.target)?.label || clickedEdge.target}
                      </span>
                    </div>

                    {clickedEdge.conditionExpression && (
                      <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-[10px] font-mono text-primary truncate">
                        <span className="font-semibold block text-[9px] uppercase tracking-wider text-muted-foreground">Condition:</span>
                        {clickedEdge.conditionExpression}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => { setRetargetEdgeId(clickedEdge.id); setEdgePopover(null); }}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-foreground bg-muted/40 hover:bg-muted border border-border transition-all text-left cursor-pointer"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 text-primary shrink-0" />
                      Re-target Edge
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConditionEditor(true)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-foreground bg-muted/40 hover:bg-muted border border-border transition-all text-left cursor-pointer"
                    >
                      <CornerDownRight className="h-3.5 w-3.5 text-primary shrink-0" />
                      {clickedEdge.conditionExpression ? "Edit Condition Expression" : "Set Condition Expression"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEdge(edgePopover.edgeId)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 transition-all text-left cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      Delete Connection
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── EDGE CONDITION SYNTAX & VARIABLES GUIDE MODAL ── */}
          {showConditionGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        Edge Condition Syntax &amp; Variables Guide
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Conditional routing logic evaluated by the LangGraph supervisor router
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConditionGuide(false)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Execution Context */}
                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1.5">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Execution Context &amp; Routing Engine
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Prior to routing execution to a downstream specialist agent or team container, the LangGraph supervisor evaluates the conditional JavaScript expression against the runtime state dictionary (<code>context</code>). If the expression evaluates to truthy, execution proceeds along this edge.
                  </p>
                </div>

                {/* Available State Variables */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Available State Variables (<code>context</code>)
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { varName: "context.last_output", type: "string | object", desc: "Output payload or JSON returned by the source agent in the previous turn." },
                      { varName: "context.intent", type: "string", desc: "Classified user intent (e.g. 'booking', 'inquiry', 'escalation', 'dispute')." },
                      { varName: "context.confidence", type: "number (0.0 - 1.0)", desc: "Confidence score generated by intent detection or validator nodes." },
                      { varName: "context.tool_calls_count", type: "number", desc: "Total number of tools invoked during the active turn." },
                      { varName: "context.is_approved", type: "boolean", desc: "Status flag set by Human-in-the-Loop review nodes or operators." },
                    ].map((item) => (
                      <div key={item.varName} className="rounded-xl border border-border bg-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                              {item.varName}
                            </code>
                            <span className="text-[10px] font-mono text-muted-foreground">{item.type}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Operators */}
                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1.5">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Expression Syntax &amp; Comparison Operators
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Expressions use standard JavaScript comparison operators: equality (<code>===</code>, <code>!==</code>), numeric boundaries (<code>&gt;</code>, <code>&gt;=</code>, <code>&lt;</code>, <code>&lt;=</code>), boolean combinations (<code>&amp;&amp;</code>, <code>||</code>, <code>!</code>), and string helpers like <code>.includes(&quot;keyword&quot;)</code>.
                  </p>
                </div>

                {/* Enterprise Expression Examples with Insert Buttons */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Sample Enterprise Expressions
                  </h4>
                  <div className="space-y-2">
                    {[
                      { title: "Escalate Manager Approval", expr: "context.last_output.requires_manager_approval === true" },
                      { title: "Low Confidence or Dispute", expr: "context.confidence < 0.75 || context.intent === 'dispute'" },
                      { title: "Order Exceeds Threshold", expr: "context.last_output.order_total >= 10000" },
                      { title: "Human Review Approved", expr: "context.is_approved === true" },
                      { title: "Excessive Tool Invocations", expr: "context.tool_calls_count > 4" },
                    ].map((eg) => (
                      <div key={eg.expr} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-foreground block">{eg.title}</span>
                          <code className="text-[11px] font-mono text-muted-foreground truncate block">{eg.expr}</code>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConditionInput(eg.expr);
                            setShowConditionGuide(false);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shrink-0 cursor-pointer transition-all shadow-xs"
                        >
                          Insert Template
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowConditionGuide(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer"
                  >
                    Close Guide
                  </button>
                </div>
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
          <div className="absolute right-0 top-0 bottom-0 w-80 border-l border-border bg-muted/40 backdrop-blur-md p-4 flex flex-col gap-3 z-30 animate-in slide-in-from-right duration-200">
            <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Canvas JSON Schema</span>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="flex-1 w-full rounded-xl border border-border bg-background p-3 text-[10px] text-muted-foreground font-mono focus:border-indigo-500 outline-none resize-none [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800"
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
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground bg-card border border-border hover:border-border transition-all"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <a
                href={`data:text/json;charset=utf-8,${encodeURIComponent(jsonText)}`}
                download="savazai-canvas.json"
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground bg-card border border-border hover:border-border transition-all"
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
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl p-5 w-80 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Delete Node</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">&lsquo;{deletingNodeLabel}&rsquo;</strong>?
              This will unbind <strong className="text-white">{connectedEdgeCount}</strong> connected edge{connectedEdgeCount !== 1 ? "s" : ""}.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all"
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
            ? "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500/30 text-emerald-900 dark:text-emerald-100 font-semibold shadow-md"
            : "bg-rose-50 dark:bg-rose-950/80 border-rose-500/30 text-rose-900 dark:text-rose-100 font-semibold shadow-md"
        }`}>
          <div className="flex-1">
            <span className="font-bold block mb-1">
              {publishStatus.type === "success" ? "Success" : "Failed"}
            </span>
            <p className="leading-relaxed">{publishStatus.msg}</p>
          </div>
          <button type="button" onClick={() => setPublishStatus(null)} className="opacity-70 hover:opacity-100 font-bold cursor-pointer text-base leading-none">×</button>
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
