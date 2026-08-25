/**
 * Agentflow Canvas Utilities
 * 
 * Provides deterministic UUID regeneration, edge remapping, and runtime state
 * cleansing for Agentflow duplication, JSON importing, and workspace isolation.
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
 * Regenerates unique UUIDs for all nodes in an Agentflow canvas definition,
 * cleanly updates all edge source/target references, and strips legacy runtime
 * execution state (e.g. execution traces, error flags, active statuses).
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

  // 1. Generate clean UUIDs for all nodes
  const regeneratedNodes: RawNode[] = rawNodes.map((oldNode, index) => {
    const role = oldNode.roleTemplate || (oldNode.data?.roleTemplate as string) || "worker";
    const uniqueSuffix = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newId = `node-${role}-${uniqueSuffix}`;

    idMap.set(oldNode.id, newId);

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

  // 2. Remap edge source and target references
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
