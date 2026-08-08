"use client";

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Bot,
  Wrench,
  Group,
  Clock,
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
} from "lucide-react";
import { AgentDrawer } from "./agent-drawer";
import { TestSandbox } from "./test-sandbox";

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

export type AgentRole = "supervisor" | "worker" | "synthesizer" | "scheduled";

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
  data?: {
    executionMode?: "plan_first" | "direct";
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
  worker: { icon: Wrench, label: "Worker / Specialist Agent", border: "border-cyan-500/30", bg: "bg-cyan-500/10", accent: "cyan" },
  synthesizer: { icon: Group, label: "Synthesizer Agent", border: "border-emerald-500/30", bg: "bg-emerald-500/10", accent: "emerald" },
  scheduled: { icon: Clock, label: "Scheduled Autonomous Worker", border: "border-amber-500/30", bg: "bg-amber-500/10", accent: "amber" },
};

const ROLE_DEFAULT_PROMPTS: Record<AgentRole, string> = {
  supervisor: "You are the Supervisor Agent. Coordinate workflow dispatch across worker agents, delegate tasks, and manage overall execution flow.",
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
    x: 100,
    y: 150,
  },
  {
    id: "node-worker-1",
    label: "Data Worker",
    roleTemplate: "worker",
    systemPrompt: ROLE_DEFAULT_PROMPTS.worker,
    modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
    tools: [
      { id: "tool-1", name: "list_guests", category: "mcp", mcpServerId: "wedplanai" },
    ],
    memoryCheckpoint: true,
    kvPersistence: false,
    x: 400,
    y: 80,
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
    x: 400,
    y: 280,
  },
];

const DEFAULT_EDGES: CanvasEdge[] = [
  { id: "edge-1", source: "node-supervisor-1", target: "node-worker-1" },
  { id: "edge-2", source: "node-worker-1", target: "node-synthesizer-1" },
];

function cubicMidpoint(
  startX: number, startY: number,
  cpx: number, endX: number, endY: number,
): { mx: number; my: number } {
  const t = 0.5;
  const u = 1 - t;
  const mx = u * u * u * startX + 3 * u * u * t * cpx + 3 * u * t * t * cpx + t * t * t * endX;
  const my = u * u * u * startY + 3 * u * u * t * startY + 3 * u * t * t * endY + t * t * t * endY;
  return { mx, my };
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
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges);
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

  // Studio Infinite Canvas & Multi-selection extensions
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
          setNodes(parsed.nodes);
          setEdges(parsed.edges || []);
          return;
        }
      } catch { /* ignore corrupt data */ }
    }
    // Fall back to props
    setNodes(initialNodes);
    setEdges(initialEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasLoadKey, workflowId]);

  // Immediate localStorage write on every canvas mutation
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

  // Unmount fallback: sync to localStorage (synchronous, always works)
  useEffect(() => {
    return () => {
      const currNodes = nodesRef.current;
      const currEdges = edgesRef.current;
      if (workflowId && currNodes.length > 0) {
        localStorage.setItem(`savazai_canvas_${workflowId}`, JSON.stringify({ nodes: currNodes, edges: currEdges }));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleAddNode = useCallback((roleTemplate: AgentRole) => {
    const id = `node-${roleTemplate}-${crypto.randomUUID()}`;
    const config = ROLE_CONFIGS[roleTemplate];
    const newNode: CanvasNode = {
      id,
      label: config.label,
      roleTemplate,
      systemPrompt: ROLE_DEFAULT_PROMPTS[roleTemplate],
      modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.7 },
      tools: [],
      memoryCheckpoint: true,
      kvPersistence: false,
      x: 150 + Math.random() * 100,
      y: 150 + Math.random() * 100,
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  }, []);

  const handleQuickAddWorker = useCallback((sourceNodeId: string) => {
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;
    const id = `node-worker-${crypto.randomUUID()}`;
    const newNode: CanvasNode = {
      id,
      label: "New Worker Agent",
      roleTemplate: "worker",
      systemPrompt: ROLE_DEFAULT_PROMPTS.worker,
      modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
      tools: [],
      memoryCheckpoint: true,
      kvPersistence: false,
      x: sourceNode.x + 260,
      y: sourceNode.y,
    };
    setNodes((prev) => [...prev, newNode]);
    setEdges((prev) => [...prev, { id: `edge-${crypto.randomUUID()}`, source: sourceNodeId, target: id }]);
    setSelectedNodeId(id);
    setDrawerOpen(true);
  }, [nodes]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
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
      // Start Shift + Drag Box Selection
      setSelectionBox({
        startX: mouseX,
        startY: mouseY,
        currentX: mouseX,
        currentY: mouseY
      });
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    } else {
      // Start Canvas Panning
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { x: pan.x, y: pan.y };
    }
  }, [pan]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // Multi-select management
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
        }
      });
      // Ensure the dragged node is always included in the initial start positions
      if (!startPositions[id]) {
        const n = nodes.find(node => node.id === id);
        if (n) startPositions[id] = { x: n.x, y: n.y };
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
          return n;
        })
      );
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
  }, [draggingNodeId, isPanning, selectionBox, linkingSourceId, zoom]);

  const handleCanvasMouseUp = useCallback(() => {
    if (linkingSourceId && canvasRef.current && linkMousePos) {
      const SNAP_RADIUS = 50;
      const targetNode = nodes.find((n) => {
        // Snap to target input handle which is at (n.x, n.y + 28)
        const targetX = n.x;
        const targetY = n.y + 28;
        const dist = Math.hypot(linkMousePos.x - targetX, linkMousePos.y - targetY);
        return dist < SNAP_RADIUS && n.id !== linkingSourceId;
      });
      if (targetNode) {
        const exists = edges.some((e) => e.source === linkingSourceId && e.target === targetNode.id);
        if (!exists) {
          setEdges((prev) => [...prev, { id: `edge-${crypto.randomUUID()}`, source: linkingSourceId, target: targetNode.id }]);
        }
      }
    } else if (selectionBox && canvasRef.current) {
      // Resolve box selection coordinates to local space
      const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
      const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
      const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
      const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

      const localX1 = (x1 - pan.x) / zoom;
      const localX2 = (x2 - pan.x) / zoom;
      const localY1 = (y1 - pan.y) / zoom;
      const localY2 = (y2 - pan.y) / zoom;

      const newlySelected = nodes.filter(n => {
        // Check if node center lies inside local bounding box
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
    setIsPanning(false);
    setSelectionBox(null);
    setLinkingSourceId(null);
    setLinkMousePos(null);
  }, [linkingSourceId, linkMousePos, selectionBox, nodes, edges, pan, zoom]);

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
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + 180);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + 70);
    });

    const rect = canvasRef.current.getBoundingClientRect();
    const graphW = maxX - minX;
    const graphH = maxY - minY;

    const zoomW = (rect.width * 0.85) / graphW;
    const zoomH = (rect.height * 0.85) / graphH;
    const nextZoom = Math.max(0.2, Math.min(1.5, Math.min(zoomW, zoomH)));

    const nextPanX = (rect.width - graphW * nextZoom) / 2 - minX * nextZoom;
    const nextPanY = (rect.height - graphH * nextZoom) / 2 - minY * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, [nodes]);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rehydratedNodes = parsed.nodes.map((n: Record<string, any>, idx: number) => ({
        ...n,
        roleTemplate: n.roleTemplate || "worker",
        x: n.x ?? (100 + (idx % 3) * 200),
        y: n.y ?? (100 + Math.floor(idx / 3) * 150),
        tools: n.tools || [],
        memoryCheckpoint: n.memoryCheckpoint ?? true,
        kvPersistence: n.kvPersistence ?? false,
      }));
      setNodes(rehydratedNodes);
      setEdges(parsed.edges || []);
      if (parsed.workflowType) setWorkflowType(parsed.workflowType);
      if (parsed.cronSchedule) setCronSchedule(parsed.cronSchedule);
      if (parsed.scheduledPrompt !== undefined) setScheduledPrompt(parsed.scheduledPrompt);
      setImportAlert({ type: "success", message: "Canvas imported successfully!" });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setImportAlert({ type: "error", message: `Failed to parse JSON: ${errMsg}` });
    }
  }, [jsonText]);

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
                  className="text-slate-505 hover:text-white p-1 hover:bg-slate-900 rounded-lg transition-all"
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
            <p className="text-[10px] text-slate-300">Drag nodes, draw connections between ports, double-click to configure</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-col gap-3 p-4 border-r border-slate-900 bg-slate-950/20 shrink-0 w-44 relative animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-slate-355 uppercase tracking-wider">Agent Palette</span>
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
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 border transition-all text-left ${config.bg} ${config.border} hover:opacity-80`}
                >
                  <Icon className={`h-4 w-4 text-${config.accent}-400 shrink-0`} />
                  <span className="leading-tight">{config.label.replace(" Agent", "").replace(" Autonomous Worker", "").replace("Worker / ", "")}</span>
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
          {/* Zoom/Pan Transform Container */}
          <div
            id="grid-container"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0
            }}
            className="pointer-events-none"
          >
            <div className="w-full h-full relative pointer-events-auto">
              {/* SVG Overlay */}
          <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f1f3a" />
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

              const startX = src.x + 180;
              const startY = src.y + 35;
              const endX = tgt.x;
              const endY = tgt.y + 35;
              const cpx = (startX + endX) / 2;
              const isSelected = selectedEdgeId === edge.id;
              const { mx, my } = cubicMidpoint(startX, startY, cpx, endX, endY);

              return (
                <g key={edge.id} className="pointer-events-auto">
                  {/* Visible path */}
                  <path
                    d={`M ${startX} ${startY} C ${cpx} ${startY}, ${cpx} ${endY}, ${endX} ${endY}`}
                    fill="none"
                    stroke={isSelected ? "#6366f1" : "#1f1f3a"}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    markerEnd={`url(#${isSelected ? "arrow-selected" : "arrow"})`}
                  />
                  {/* Click hit area (12px) */}
                  <path
                    d={`M ${startX} ${startY} C ${cpx} ${startY}, ${cpx} ${endY}, ${endX} ${endY}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
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
                        strokeOpacity={0.5}
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
                    <foreignObject x={cpx - 60} y={(startY + endY) / 2 - 10} width="120" height="20">
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
              const sx = src.x + 180;
              const sy = src.y + 35;
              const cpx = (sx + linkMousePos.x) / 2;
              return (
                <path
                  d={`M ${sx} ${sy} C ${cpx} ${sy}, ${cpx} ${linkMousePos.y}, ${linkMousePos.x} ${linkMousePos.y}`}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="5,3"
                  className="pointer-events-auto"
                />
              );
            })()}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const config = ROLE_CONFIGS[node.roleTemplate];
            const NodeIcon = config.icon;
            const isSelected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                className="absolute group"
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
              >
                {/* Input port (left side) */}
                <div
                  className="absolute w-3 h-3 bg-indigo-500 border-2 border-slate-950 rounded-full -left-[6px] top-[28px] z-20 cursor-crosshair hover:scale-125 transition-transform"
                  title="Input port"
                />

                {/* Output port (right side) */}
                <div
                  onMouseDown={(e) => handleOutputHandleMouseDown(e, node.id)}
                  className="absolute w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full -right-[6px] top-[28px] z-20 cursor-crosshair hover:scale-125 transition-transform"
                  title="Output port — drag to connect"
                />

                {/* Quick-add Worker button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleQuickAddWorker(node.id); }}
                  className="absolute -right-[14px] bottom-[10px] w-5 h-5 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center z-20 shadow-md shadow-indigo-600/30 transition-all hover:scale-110 hover:shadow-lg opacity-0 group-hover:opacity-100"
                  title="Quick-add connected Worker agent"
                >
                  <Plus className="h-3 w-3 text-white" />
                </button>

                {/* Node card */}
                <div
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onClick={() => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
                  onDoubleClick={(e) => handleNodeDoubleClick(e, node.id)}
                  className={`w-44 rounded-2xl border px-3 py-2.5 flex flex-col gap-1.5 transition-all select-none z-10 cursor-grab active:cursor-grabbing backdrop-blur-sm shadow-xl ${config.bg} ${config.border} ${
                    isSelected
                      ? node.roleTemplate === "supervisor" ? "ring-2 ring-indigo-500/80 shadow-indigo-500/10" :
                        node.roleTemplate === "worker" ? "ring-2 ring-cyan-500/80 shadow-cyan-500/10" :
                        node.roleTemplate === "synthesizer" ? "ring-2 ring-emerald-500/80 shadow-emerald-500/10" :
                        "ring-2 ring-amber-500/80 shadow-amber-500/10"
                      : "hover:bg-slate-900/40"
                  }`}
                >
                  {/* Toolbar inside card header */}
                  <div className="flex items-center justify-between w-full">
                    <div className="relative">
                      <div className={`p-1 rounded-lg bg-slate-950/40 border border-slate-900 shrink-0`}>
                        <NodeIcon className={`h-3.5 w-3.5 text-${config.accent}-400`} />
                      </div>
                      {/* Execution status indicator ring */}
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
                    node.roleTemplate === "supervisor" ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/25" :
                    node.roleTemplate === "worker" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" :
                    node.roleTemplate === "synthesizer" ? "bg-amber-500/15 text-amber-300 border border-amber-500/25" :
                    "bg-purple-500/15 text-purple-300 border border-purple-500/25"
                  }`}>
                    {config.label.replace(" Agent", "").replace(" Autonomous Worker", "").replace("Worker / ", "")}
                  </span>

                  <div className="text-xs font-bold text-white truncate max-w-full">
                    {node.label}
                  </div>

                  <div className="flex items-center justify-between w-full mt-1.5 border-t border-slate-900 pt-1.5 shrink-0">
                    <span className="text-[8px] text-slate-350 truncate max-w-full">
                      {node.modelConfig.provider}/{node.modelConfig.model}
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
            <div className="w-px h-4 bg-slate-850 mx-0.5" />
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
                const scale = 0.05;
                const x = Math.max(2, Math.min(110, n.x * scale + 15));
                const y = Math.max(2, Math.min(70, n.y * scale + 10));
                return (
                  <div
                    key={n.id}
                    className="absolute w-2 h-1 rounded-sm"
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      backgroundColor: n.roleTemplate === "supervisor" ? "#6366f1" : n.roleTemplate === "worker" ? "#10b981" : n.roleTemplate === "synthesizer" ? "#f59e0b" : "#a855f7"
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
              Release mouse over a node input port to connect
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
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-850 hover:border-slate-750 transition-all"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <a
                href={`data:text/json;charset=utf-8,${encodeURIComponent(jsonText)}`}
                download="savazai-canvas.json"
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-850 hover:border-slate-750 transition-all"
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
                <h4 className="text-sm font-bold text-white">Delete Agent Node</h4>
                <p className="text-[10px] text-slate-300 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-slate-200 mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-200">&lsquo;{deletingNodeLabel}&rsquo;</strong>?
              This will unbind <strong className="text-slate-100">{connectedEdgeCount}</strong> connected edge{connectedEdgeCount !== 1 ? "s" : ""}.
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
          onClose={() => setDrawerOpen(false)}
          onSave={handleUpdateNode}
        />
      )}

      {/* Test Sandbox Drawer */}
      {showTestSandbox && (
        <TestSandbox
          canvasJson={jsonText}
          onClose={() => setShowTestSandbox(false)}
          onNodeEvent={(label, event) => setCanvasNodeStatus(prev => ({ ...prev, [label]: event }))}
        />
      )}
    </div>
  );
});
