/**
 * Agentflow Canvas Utilities
 * 
 * Provides deterministic UUID regeneration, edge remapping, legacy canvas migration,
 * and runtime state cleansing for Agentflow duplication, JSON importing, and workspace isolation.
 */

export interface RawNode {
  id: string;
  label?: string;
  roleTemplate?: string;
  systemPrompt?: string;
  modelConfig?: Record<string, unknown>;
  tools?: unknown[];
  skills?: unknown[];
  okfConcepts?: unknown[];
  ragNamespace?: string;
  embedModel?: string;
  hitlPolicy?: string;
  memoryCheckpoint?: boolean;
  kvPersistence?: boolean;
  piiMaskingOverride?: string;
  parentId?: string;
  collapsed?: boolean;
  customColor?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RawEdge {
  id: string;
  source: string;
  target: string;
  conditionExpression?: string;
  [key: string]: unknown;
}

export interface CanvasDefinition {
  workflowType?: "interactive" | "scheduled";
  cronSchedule?: string;
  scheduledPrompt?: string;
  globalSystemPrompt?: string;
  nodes?: RawNode[];
  edges?: RawEdge[];
  [key: string]: unknown;
}

/**
 * Calculates generous team dimensions and grid layout parameters
 */
export function getTeamDimensions(
  childCount: number,
  isCollapsed: boolean,
  customWidth?: number,
  customHeight?: number
): { width: number; height: number; cols: number; rows: number } {
  if (isCollapsed) return { width: 280, height: 90, cols: 1, rows: 1 };
  const cols = childCount > 4 ? 3 : 2;
  const rows = Math.ceil(Math.max(1, childCount) / cols);
  const CARD_W = 260;
  const CARD_H = 110;
  const GAP_X = 24;
  const GAP_Y = 20;
  const PADDING_TOP = 80;
  const PADDING_BOTTOM = 32;
  const PADDING_X = 32;

  const calculatedW = (cols * CARD_W) + ((cols - 1) * GAP_X) + (PADDING_X * 2);
  const calculatedH = PADDING_TOP + (rows * CARD_H) + ((rows - 1) * GAP_Y) + PADDING_BOTTOM;

  const width = customWidth ? Math.max(customWidth, calculatedW) : Math.max(620, calculatedW);
  const height = customHeight ? Math.max(customHeight, calculatedH) : Math.max(340, calculatedH);

  return { width, height, cols, rows };
}

/**
 * Migrates legacy flat canvases (where specialist workers are unparented)
 * into the modern Agent Team Architecture with mandatory team membership.
 */
export function migrateLegacyCanvasDefinition(
  canvasDefinition: unknown,
  workflowName = "Specialist"
): CanvasDefinition {
  if (!canvasDefinition || typeof canvasDefinition !== "object") {
    return { workflowType: "interactive", nodes: [], edges: [] };
  }

  const cd = canvasDefinition as CanvasDefinition;
  const rawNodes: RawNode[] = Array.isArray(cd.nodes) ? cd.nodes : [];
  const rawEdges: RawEdge[] = Array.isArray(cd.edges) ? cd.edges : [];

  if (rawNodes.length === 0) return cd;

  const teams = rawNodes.filter(n => n.roleTemplate === "team");
  const unparentedWorkers = rawNodes.filter(n => (n.roleTemplate === "worker" || !n.roleTemplate) && !n.parentId);

  // If no unparented workers exist and at least one team exists, already modern!
  if (unparentedWorkers.length === 0 && teams.length > 0) {
    return cd;
  }

  // If unparented workers exist:
  let primaryTeam = teams[0];
  let newNodes = [...rawNodes];

  if (!primaryTeam && unparentedWorkers.length > 0) {
    const teamId = `node-team-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    const dimensions = getTeamDimensions(unparentedWorkers.length, false);
    primaryTeam = {
      id: teamId,
      label: `${workflowName.replace(/\s*\(Draft\)\s*/i, "").trim()} Team`,
      roleTemplate: "team",
      collapsed: false,
      width: dimensions.width,
      height: dimensions.height,
      x: 440,
      y: 80,
      memoryCheckpoint: true,
      kvPersistence: false,
    };
    newNodes.push(primaryTeam);
  }

  if (primaryTeam) {
    const teamId = primaryTeam.id;
    const allTeamWorkers = newNodes.filter(n => (n.roleTemplate === "worker" || !n.roleTemplate));
    const dimensions = getTeamDimensions(allTeamWorkers.length, false);

    // Update primary team dimensions
    primaryTeam.width = dimensions.width;
    primaryTeam.height = dimensions.height;
    primaryTeam.collapsed = false;

    // Reparent and position all workers in an internal multi-column grid
    let workerIndex = 0;
    newNodes = newNodes.map(node => {
      if (node.id === teamId) return primaryTeam;
      if (node.roleTemplate === "worker" || (!node.roleTemplate && node.id !== "supervisor" && node.id !== "synthesizer")) {
        const col = workerIndex % dimensions.cols;
        const row = Math.floor(workerIndex / dimensions.cols);
        const CARD_W = 260;
        const CARD_H = 110;
        const GAP_X = 24;
        const GAP_Y = 20;
        const PADDING_TOP = 80;
        const PADDING_X = 32;

        const workerX = (primaryTeam.x || 440) + PADDING_X + col * (CARD_W + GAP_X);
        const workerY = (primaryTeam.y || 80) + PADDING_TOP + row * (CARD_H + GAP_Y);
        workerIndex++;

        return {
          ...node,
          roleTemplate: "worker",
          parentId: teamId,
          x: workerX,
          y: workerY,
        };
      }
      return node;
    });

    // Clean bus edge rewiring: Supervisor -> Team -> Synthesizer
    const supervisor = newNodes.find(n => n.roleTemplate === "supervisor");
    const synthesizer = newNodes.find(n => n.roleTemplate === "synthesizer");
    const newEdges: RawEdge[] = [];

    if (supervisor) {
      newEdges.push({
        id: `edge-${supervisor.id}-${teamId}`,
        source: supervisor.id,
        target: teamId,
      });
    }

    if (synthesizer) {
      newEdges.push({
        id: `edge-${teamId}-${synthesizer.id}`,
        source: teamId,
        target: synthesizer.id,
      });
    }

    // Preserve any custom inter-node non-bus edges if present
    rawEdges.forEach(e => {
      const srcNode = newNodes.find(n => n.id === e.source);
      const tgtNode = newNodes.find(n => n.id === e.target);
      if (srcNode && tgtNode && srcNode.roleTemplate !== "supervisor" && tgtNode.roleTemplate !== "synthesizer") {
        newEdges.push(e);
      }
    });

    return {
      ...cd,
      nodes: newNodes,
      edges: newEdges,
    };
  }

  return cd;
}

/**
 * Regenerates unique UUIDs for all nodes in an Agentflow canvas definition,
 * cleanly updates all edge source/target and node parentId references, and strips
 * legacy runtime execution state.
 */
export function regenerateAgentflowCanvas(canvasDefinition: unknown): CanvasDefinition {
  if (!canvasDefinition || typeof canvasDefinition !== "object") {
    return { workflowType: "interactive", nodes: [], edges: [] };
  }

  const cd = canvasDefinition as CanvasDefinition;
  const rawNodes: RawNode[] = Array.isArray(cd.nodes) ? cd.nodes : [];
  const rawEdges: RawEdge[] = Array.isArray(cd.edges) ? cd.edges : [];

  // Translation map: oldNodeId -> newNodeId
  const idMap = new Map<string, string>();

  // 1. Pre-populate UUID translation map for all nodes
  for (const oldNode of rawNodes) {
    const role = oldNode.roleTemplate || (oldNode.data?.roleTemplate as string) || "worker";
    const uniqueSuffix = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    idMap.set(oldNode.id, `node-${role}-${uniqueSuffix}`);
  }

  // 2. Generate cleanly rehydrated nodes with remapped parentId references
  const regeneratedNodes: RawNode[] = rawNodes.map((oldNode, index) => {
    const role = oldNode.roleTemplate || (oldNode.data?.roleTemplate as string) || "worker";
    const newId = idMap.get(oldNode.id) || `node-${role}-${index}`;
    const newParentId = oldNode.parentId ? idMap.get(oldNode.parentId) : undefined;

    // Clean node clone stripping any transient runtime execution states
    const { 
      status: _status, 
      error: _error, 
      running: _running, 
      executionState: _execState,
      receipts: _receipts,
      ...cleanData 
    } = (oldNode.data || {}) as Record<string, unknown>;

    return {
      ...oldNode,
      id: newId,
      parentId: newParentId,
      collapsed: oldNode.collapsed,
      customColor: oldNode.customColor || (cleanData?.customColor as string) || undefined,
      width: oldNode.width,
      height: oldNode.height,
      x: typeof oldNode.x === "number" ? oldNode.x : 100 + (index % 3) * 220,
      y: typeof oldNode.y === "number" ? oldNode.y : 100 + Math.floor(index / 3) * 160,
      roleTemplate: role as any,
      label: oldNode.label || (cleanData?.label as string) || `Agent ${index + 1}`,
      systemPrompt: oldNode.systemPrompt || (cleanData?.systemPrompt as string) || "",
      modelConfig: oldNode.modelConfig || (cleanData?.modelConfig as any) || { provider: "openai", model: "gpt-4o", temperature: 0.3 },
      tools: oldNode.tools || (cleanData?.tools as any[]) || [],
      skills: oldNode.skills || (cleanData?.skills as any[]) || [],
      okfConcepts: oldNode.okfConcepts || (cleanData?.okfConcepts as any[]) || [],
      data: cleanData,
      memoryCheckpoint: oldNode.memoryCheckpoint !== false,
      kvPersistence: oldNode.kvPersistence === true,
    };
  });

  // 3. Remap edge source and target references
  const regeneratedEdges: RawEdge[] = [];
  for (const oldEdge of rawEdges) {
    const newSource = idMap.get(oldEdge.source);
    const newTarget = idMap.get(oldEdge.target);

    // Only preserve edges where both source and target exist in the new node registry
    if (newSource && newTarget) {
      const edgeSuffix = typeof crypto !== "undefined" && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      regeneratedEdges.push({
        id: `edge-${edgeSuffix}`,
        source: newSource,
        target: newTarget,
        conditionExpression: oldEdge.conditionExpression || undefined,
      });
    }
  }

  return {
    ...cd,
    workflowType: cd.workflowType || "interactive",
    globalSystemPrompt: cd.globalSystemPrompt || "",
    nodes: regeneratedNodes,
    edges: regeneratedEdges,
  };
}
