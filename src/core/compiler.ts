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
        results.push(`${toolRef.name}: NOT_FOUND`);
      }
    }
    const output = results.join(" | ");
    return {
      nodeOutputs: { [node.id]: `[Worker:${node.label}] ${output}` },
      output,
    };
  };
}

function createSynthesizerHandler(
  node: AgentNode,
  globalPrompt?: string,
): (state: CompiledGraphState) => Promise<Partial<CompiledGraphState>> {
  return async (state) => {
    const systemPrompt = [globalPrompt, node.systemPrompt].filter(Boolean).join("\n\n");
    const allOutputs = Object.entries(state.nodeOutputs || {})
      .map(([nid, out]) => `[${nid}]: ${out}`)
      .join("\n");
    const synthesized = `[Synthesizer:${node.label}] Aggregated ${Object.keys(state.nodeOutputs || {}).length} sub-agent outputs | Prompt: "${systemPrompt.substring(0, 80)}..."\n${allOutputs.substring(0, 300)}`;
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

  const sourceNodeIds = new Set(canvas.edges.map((e) => e.source));
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
    default:
      return createWorkerHandler(node, registry);
  }
}
