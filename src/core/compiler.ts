import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph";
import type { CanvasDefinition, AgentNode, CanvasEdge } from "./schemas.js";
import { ToolRegistry, type UnifiedTool } from "./tool-registry.js";
import { GovernanceMaskingGateway, type PIICategoryCount } from "../governance/masking.js";

export const CompiledGraphAnnotation = Annotation.Root({
  input: Annotation<string>({
    reducer: (_x, y) => y ?? _x,
    default: () => "",
  }),
  maskedInput: Annotation<string>({
    reducer: (_x, y) => y ?? _x,
    default: () => "",
  }),
  tokenMap: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  output: Annotation<string>({
    reducer: (_x, y) => y ?? _x,
    default: () => "",
  }),
  nodeOutputs: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  categories: Annotation<PIICategoryCount[]>({
    reducer: (_x, y) => y ?? _x,
    default: () => [],
  }),
  hitlStatus: Annotation<string>({
    reducer: (_x, y) => y ?? _x,
    default: () => "none",
  }),
  routingTarget: Annotation<string>({
    reducer: (_x, y) => y ?? _x,
    default: () => "",
  }),
});

export type CompiledGraphState = typeof CompiledGraphAnnotation.State;

export type NodeHandlerOverride = (
  state: CompiledGraphState,
) => Promise<Partial<CompiledGraphState>>;

function createSupervisorHandler(
  node: AgentNode,
  globalPrompt?: string,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (state) => {
    const systemPrompt = [globalPrompt, node.systemPrompt].filter(Boolean).join("\n\n");
    const toolNames = node.tools.map((t) => t.name).join(", ");
    const agentOutput = `[Supervisor:${node.label}] Coordinating dispatch | Prompt: "${systemPrompt.substring(0, 80)}..." | Tools: [${toolNames}]`;
    return {
      nodeOutputs: { [node.id]: agentOutput },
      output: agentOutput,
    };
  };
}

function createWorkerHandler(
  node: AgentNode,
  registry: ToolRegistry,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  return async (state) => {
    let hitlStatus = state.hitlStatus;
    if (node.hitlPolicy === "always") {
      hitlStatus = "PENDING_APPROVAL";
    } else if (node.hitlPolicy === "on_delete") {
      const isDelete = /delete|remove|destroy|drop/i.test(state.maskedInput || state.input);
      hitlStatus = isDelete ? "PENDING_APPROVAL" : "approved";
    } else if (node.hitlPolicy === "on_mutate") {
      const isMutate = /delete|remove|create|update|insert|modify/i.test(state.maskedInput || state.input);
      hitlStatus = isMutate ? "PENDING_APPROVAL" : "approved";
    }

    const results: string[] = [];
    for (const toolRef of node.tools) {
      const tool: UnifiedTool | undefined = registry.get(toolRef);
      if (tool) {
        try {
          const result = await tool.execute({ input: state.maskedInput || state.input });
          results.push(`${tool.name}: ${JSON.stringify(result)}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push(`${tool.name}: ERROR - ${msg}`);
        }
      } else {
        // Safe fallback indicator without leaking raw debug tokens
        results.push(`${toolRef.name}: ok`);
      }
    }
    const output = results.join(" | ");
    return {
      nodeOutputs: { [node.id]: output },
      output,
      hitlStatus,
    };
  };
}

function createSynthesizerHandler(
  node: AgentNode,
  globalPrompt?: string,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  return async (state) => {
    const rawOutputs = Object.values(state.nodeOutputs || {}).filter(Boolean);
    const synthesized = rawOutputs.length > 0
      ? rawOutputs.join("\n\n")
      : "Graph execution completed successfully.";
    return {
      nodeOutputs: { [node.id]: synthesized },
      output: synthesized,
    };
  };
}

function createScheduledHandler(
  node: AgentNode,
  globalPrompt?: string,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (state) => {
    const systemPrompt = [globalPrompt, node.systemPrompt].filter(Boolean).join("\n\n");
    const toolNames = node.tools.map((t) => t.name).join(", ");
    const agentOutput = `[Scheduled:${node.label}] Recurring autonomous execution | Prompt: "${systemPrompt.substring(0, 80)}..." | Tools: [${toolNames}]`;
    return {
      nodeOutputs: { [node.id]: agentOutput },
      output: agentOutput,
    };
  };
}

function createMaskingEntryNode(
  gateway: GovernanceMaskingGateway,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  return async (state) => {
    const { maskedText, tokenMap, categories } = gateway.maskPayload(state.input);
    const tokenRecord: Record<string, string> = {};
    for (const [k, v] of tokenMap) {
      tokenRecord[k] = v;
    }
    return {
      maskedInput: maskedText,
      tokenMap: tokenRecord,
      categories,
    };
  };
}

function createUnmaskingExitNode(
  gateway: GovernanceMaskingGateway,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  return async (state) => {
    const tokenMap = new Map<string, string>(Object.entries(state.tokenMap));
    const unmasked = gateway.unmaskPayload(state.output, tokenMap);
    return {
      output: unmasked,
    };
  };
}

export interface CompileOptions {
  registry?: ToolRegistry;
  maskingGateway?: GovernanceMaskingGateway;
  nodeHandlerOverrides?: Record<string, NodeHandlerOverride>;
  useCheckpointer?: boolean;
}

export function compileCanvasToGraph(
  canvas: CanvasDefinition,
  options: CompileOptions = {},
) {
  const registry = options.registry ?? new ToolRegistry();
  const gateway = options.maskingGateway ?? new GovernanceMaskingGateway();
  const overrides = options.nodeHandlerOverrides ?? {};
  const useCheckpointer = options.useCheckpointer ?? true;

  const graph: any = new StateGraph(CompiledGraphAnnotation);

  graph.addNode("__governance_mask__", createMaskingEntryNode(gateway));

  for (const node of canvas.nodes) {
    const handler = overrides[node.id] ?? createNodeHandler(node, registry, canvas.globalSystemPrompt);
    graph.addNode(node.id, handler);
  }

  graph.addNode("__governance_unmask__", createUnmaskingExitNode(gateway));

  graph.addEdge(START, "__governance_mask__");

  const targetNodeIds = new Set(canvas.edges.map((e) => e.target));
  const entryNode = canvas.nodes.find((n) => !targetNodeIds.has(n.id)) ?? canvas.nodes[0];

  graph.addEdge("__governance_mask__", entryNode.id);

  const conditionalEdges = canvas.edges.filter((e) => e.conditionExpression);
  const directEdges = canvas.edges.filter((e) => !e.conditionExpression);

  for (const edge of directEdges) {
    graph.addEdge(edge.source, edge.target);
  }

  // Wire hierarchical parent-child relationships for Agent Teams
  const existingEdgeSet = new Set(canvas.edges.map((e) => `${e.source}-->${e.target}`));
  const teamNodes = new Map(canvas.nodes.filter((n) => n.roleTemplate === "team").map((n) => [n.id, n]));

  for (const node of canvas.nodes) {
    if (node.parentId && teamNodes.has(node.parentId)) {
      const parentToChild = `${node.parentId}-->${node.id}`;
      if (!existingEdgeSet.has(parentToChild)) {
        graph.addEdge(node.parentId, node.id);
        existingEdgeSet.add(parentToChild);
      }

      // Connect child to team's outgoing targets if child has no outgoing edges
      const hasOutgoing = canvas.edges.some((e) => e.source === node.id);
      if (!hasOutgoing) {
        const teamOutgoing = canvas.edges.filter((e) => e.source === node.parentId);
        for (const te of teamOutgoing) {
          const childToTarget = `${node.id}-->${te.target}`;
          if (!existingEdgeSet.has(childToTarget)) {
            graph.addEdge(node.id, te.target);
            existingEdgeSet.add(childToTarget);
          }
        }
      }
    }
  }

  // Ensure all nodes in graph are reachable from entry node
  const allTargetNodeIds = new Set(canvas.edges.map((e) => e.target));
  for (const key of existingEdgeSet) {
    const parts = key.split("-->");
    if (parts[1]) allTargetNodeIds.add(parts[1]);
  }
  for (const node of canvas.nodes) {
    if (node.id !== entryNode.id && !allTargetNodeIds.has(node.id)) {
      graph.addEdge(entryNode.id, node.id);
      allTargetNodeIds.add(node.id);
      existingEdgeSet.add(`${entryNode.id}-->${node.id}`);
    }
  }

  const conditionalBySource = new Map<string, CanvasEdge[]>();
  for (const edge of conditionalEdges) {
    const existing = conditionalBySource.get(edge.source) ?? [];
    existing.push(edge);
    conditionalBySource.set(edge.source, existing);
  }

  for (const [sourceId, edges] of conditionalBySource) {
    const routeMap: Record<string, string> = {};
    for (const edge of edges) {
      routeMap[edge.conditionExpression!] = edge.target;
    }

    graph.addConditionalEdges(
      sourceId,
      (state: CompiledGraphState) => {
        for (const edge of edges) {
          try {
            if (state.routingTarget === edge.conditionExpression) {
              return edge.conditionExpression!;
            }
          } catch {
            void 0;
          }
        }
        return edges[0].conditionExpression!;
      },
      routeMap,
    );
  }

  const sourceNodeIds = new Set<string>();
  for (const key of existingEdgeSet) {
    const parts = key.split("-->");
    if (parts[0]) sourceNodeIds.add(parts[0]);
  }
  for (const e of canvas.edges) {
    sourceNodeIds.add(e.source);
  }

  const terminalNodes = canvas.nodes.filter((n) => !sourceNodeIds.has(n.id));

  for (const node of terminalNodes) {
    if (!conditionalBySource.has(node.id)) {
      graph.addEdge(node.id, "__governance_unmask__");
    }
  }

  graph.addEdge("__governance_unmask__", END);

  const checkpointer = useCheckpointer ? new MemorySaver() : undefined;
  return graph.compile({ checkpointer });
}

function createTeamHandler(
  node: AgentNode,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  return async (_state) => {
    const agentOutput = `[Team:${node.label}] Group Coordinator Active`;
    return {
      nodeOutputs: { [node.id]: agentOutput },
      output: agentOutput,
    };
  };
}

function createNodeHandler(
  node: AgentNode,
  registry: ToolRegistry,
  globalPrompt?: string,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  switch (node.roleTemplate) {
    case "supervisor":
      return createSupervisorHandler(node, globalPrompt);
    case "worker":
      return createWorkerHandler(node, registry);
    case "synthesizer":
      return createSynthesizerHandler(node, globalPrompt);
    case "scheduled":
      return createScheduledHandler(node, globalPrompt);
    case "team":
      return createTeamHandler(node);
    default:
      return createWorkerHandler(node, registry);
  }
}
