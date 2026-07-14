import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph";
import { z } from "zod";
import { PrivacyGateway } from "../utils/privacy-gateway.js";
import { skillTools } from "../utils/skills-loader.js";
import { llmSwitchboard } from "../services/llm-switchboard.js";
import { okfVerifier } from "./okf-verifier.js";
import { db } from "../db/index.js";
import { autonomousAgents, connectedApps, systemConfigurations, type ModelConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { TelemetryGateway } from "../utils/telemetry.js";

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().optional(),
});

export const GraphStateSchema = z.object({
  messages: z.array(MessageSchema),
  currentApp: z.string(),
  activeSubAgent: z.string(),
  tokenMap: z.record(z.string(), z.string()),
  maskedInput: z.string().optional(),
  relevantSkills: z.array(z.string()),
  verificationFailures: z.array(z.string()),
  correctAttempts: z.number(),
  routingDecision: z.enum(["sub_agent", "mcp_action", "respond", "correct", "end"]).optional(),
  modelConfig: z.object({
    providerType: z.string(),
    modelName: z.string().optional(),
  }).optional(),
  activeTools: z.array(z.string()).optional(),
  decidedToolName: z.string().nullable().optional(),
  decidedToolArgs: z.record(z.string(), z.any()).optional(),
  executedTools: z.array(z.string()).optional(),
  executedToolSignatures: z.array(z.string()),
  lastUserMessageContent: z.string(),
  piiCategories: z.array(z.object({
    type: z.string(),
    count: z.number(),
    label: z.string(),
  })),
  parallelToolQueue: z.array(z.object({
    name: z.string(),
    args: z.record(z.string(), z.any()),
  })).optional(),
  pendingToolCalls: z.array(z.object({
    name: z.string(),
    args: z.record(z.string(), z.any()),
  })).optional(),
  target_action: z.enum(["sub_agent", "mcp_action", "respond", "correct", "end"]).optional(),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

const StateAnnotation = Annotation.Root({
  messages: Annotation<GraphState["messages"]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentApp: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  activeSubAgent: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  tokenMap: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  maskedInput: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  relevantSkills: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  verificationFailures: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  correctAttempts: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  routingDecision: Annotation<"sub_agent" | "mcp_action" | "respond" | "correct" | "end" | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  modelConfig: Annotation<{ providerType: string; modelName?: string } | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  activeTools: Annotation<string[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  decidedToolName: Annotation<string | null | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  decidedToolArgs: Annotation<Record<string, any> | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  executedTools: Annotation<string[] | undefined>({
    reducer: (x, y) => y !== undefined ? y : (x ?? []),
    default: () => [],
  }),
  toolExecutedInCurrentNode: Annotation<boolean>({
    reducer: (x, y) => y ?? false,
    default: () => false,
  }),
  executedToolSignatures: Annotation<string[]>({
    reducer: (x, y) => y !== undefined ? y : (x ?? []),
    default: () => [],
  }),
  lastUserMessageContent: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  piiCategories: Annotation<Array<{ type: string; count: number; label: string }>>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  parallelToolQueue: Annotation<Array<{ name: string; args: Record<string, any> }> | undefined>({
    reducer: (x, y) => y !== undefined ? y : (x ?? []),
    default: () => [],
  }),
  pendingToolCalls: Annotation<Array<{ name: string; args: Record<string, any> }> | undefined>({
    reducer: (x, y) => y !== undefined ? y : (x ?? []),
    default: () => [],
  }),
  target_action: Annotation<"sub_agent" | "mcp_action" | "respond" | "correct" | "end" | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});

interface CachedTools {
  tools: any[];
  timestamp: number;
}

const mcpToolCache = new Map<string, CachedTools>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

async function resolveAmbientParameter(paramName: string): Promise<string | undefined> {
  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    if (configs.length > 0 && configs[0].designTokens) {
      const dt = configs[0].designTokens as any;
      if (dt[paramName]) return String(dt[paramName]);
      const snake = paramName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      if (dt[snake]) return String(dt[snake]);

      // Check defaultAmbientParameters from Capability Studio
      const defaultParams = dt.defaultAmbientParameters;
      if (defaultParams) {
        let paramsObj: any = {};
        if (typeof defaultParams === "string") {
          try {
            paramsObj = JSON.parse(defaultParams);
          } catch {
            defaultParams.split("\n").forEach((line: string) => {
              const parts = line.split(":");
              if (parts.length >= 2) {
                paramsObj[parts[0].trim()] = parts.slice(1).join(":").trim();
              }
            });
          }
        } else {
          paramsObj = defaultParams;
        }
        if (paramsObj[paramName]) return String(paramsObj[paramName]);
        if (paramsObj[snake]) return String(paramsObj[snake]);
      }
    }
  } catch (err) {
    console.error(`[resolveAmbientParameter] designTokens search failed for ${paramName}:`, err);
  }

  const envKey = paramName.toUpperCase();
  const envVal = process.env[envKey] || process.env[paramName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).toUpperCase()];
  if (envVal) return envVal;

  return undefined;
}

function standardizeDateToISO(dateStr: string): string {
  try {
    // Remove ordinal suffixes from days (e.g. "August 25th 2026" -> "August 25 2026")
    const cleanDateStr = dateStr.replace(/(\d+)(st|nd|rd|th)\b/i, "$1").trim();
    const d = new Date(cleanDateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch (e) {
    console.error(`[standardizeDateToISO] Failed to parse date string "${dateStr}":`, e);
  }
  return dateStr;
}

async function registerAppProvider(appName: string, modelOverride?: { providerType: string; modelName?: string }): Promise<void> {
  try {
    const apps = await db
      .select()
      .from(connectedApps)
      .where(eq(connectedApps.appName, appName))
      .limit(1);
    if (apps.length === 0) return;
    const mc = apps[0].modelConfig as ModelConfig;

    const providerType = modelOverride?.providerType || mc?.providerType;
    let modelName = modelOverride?.modelName || mc?.modelName || process.env.LLM_MODEL_NAME || "gpt-4o-mini";

    const configs = await db.select().from(systemConfigurations).limit(1);
    let baseUrl = mc?.baseUrl || process.env.LLM_BASE_URL || "http://localhost:11434/v1";
    let apiKey = mc?.apiKey || process.env.LLM_API_KEY || "";

    if (configs.length > 0 && providerType) {
      const tokens = configs[0].designTokens as any || {};
      const providers = tokens.llmProviders || {};
      const prov = providers[providerType];
      if (prov) {
        baseUrl = prov.endpoint || baseUrl;
        apiKey = prov.apiKey || apiKey;
        if (!modelOverride?.modelName) {
          modelName = prov.defaultModel || modelName;
        }
      }
    }

    if (!providerType) return;

    llmSwitchboard.registerProvider({
      providerId: appName,
      type: providerType,
      baseUrl,
      modelName,
      apiKey,
    });
  } catch (err) {
    console.error("[registerAppProvider] failed:", err);
  }
}

async function fetchMcpTools(serverUrl: string, headers: Record<string, string>): Promise<any[]> {
  const cacheKey = `${serverUrl}:${JSON.stringify(headers)}`;
  const cached = mcpToolCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.tools;
  }

  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[fetchMcpTools] Failed to fetch tools from ${serverUrl}: HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as any;
    let tools: any[] = [];
    if (data.result && Array.isArray(data.result.tools)) {
      tools = data.result.tools;
    } else if (Array.isArray(data.tools)) {
      tools = data.tools;
    } else if (Array.isArray(data)) {
      tools = data;
    }
    mcpToolCache.set(cacheKey, { tools, timestamp: Date.now() });
    return tools;
  } catch (err) {
    console.error(`[fetchMcpTools] Error fetching tools from ${serverUrl}:`, err);
    return [];
  }
}

function buildTimestamp(): string {
  return new Date().toISOString();
}

class StructuredModelWrapper {
  private providerId: string;
  private modelConfig: any;

  constructor(providerId: string, modelConfig: any) {
    this.providerId = providerId;
    this.modelConfig = modelConfig;
  }

  withStructuredOutput(schema: any) {
    return {
      invoke: async (messages: any[], options?: any) => {
        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages,
          providerId: this.providerId,
          options: {
            ...options,
            response_format: { type: "json_object" },
          },
        });

        const rawText = completion.text;
        console.log("[StructuredModelWrapper] Raw output:", rawText);

        let cleanText = rawText.trim();
        const startBrace = cleanText.indexOf("{");
        const endBrace = cleanText.lastIndexOf("}");
        if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
          cleanText = cleanText.substring(startBrace, endBrace + 1);
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        try {
          const parsed = JSON.parse(cleanText);
          return schema.parse(parsed);
        } catch (e) {
          console.error("[StructuredModelWrapper] JSON parse or Zod validation failed. Raw Text:", rawText, "Error:", e);
          throw e;
        }
      }
    };
  }
}

function unwrapAllParallelTools(decidedName: string, decidedArgs: any): { name: string; args: any }[] {
  if (decidedName !== "multi_tool_use.parallel" && decidedName !== "parallel") {
    return [];
  }

  let subCalls: any[] = [];
  if (Array.isArray(decidedArgs)) {
    subCalls = decidedArgs;
  } else if (decidedArgs && typeof decidedArgs === "object") {
    const keys = ["tool_uses", "tasks", "calls", "queries", "actions", "instances", "commands"];
    for (const key of keys) {
      if (Array.isArray(decidedArgs[key])) {
        subCalls = decidedArgs[key];
        break;
      }
    }
    if (subCalls.length === 0) {
      for (const val of Object.values(decidedArgs)) {
        if (Array.isArray(val)) {
          subCalls = val;
          break;
        }
      }
    }
  }

  const results: { name: string; args: any }[] = [];
  for (const first of subCalls) {
    if (first && typeof first === "object") {
      let name = first.name || first.tool || first.tool_name || first.recipient_name || first.action;
      if (typeof name === "string") {
        name = name.replace(/^(functions\.|tools\.|mcp\.)/, "");
        const args = first.arguments || first.args || first.parameters || first.params || first;
        results.push({ name, args: typeof args === "object" ? args : {} });
      }
    }
  }

  return results;
}

async function supervisorNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();

  telemetry.startTrace(requestId, "langgraph-run");
  const span = telemetry.startSpan(requestId, "supervisorNode");

  try {
    const userMessage = [...state.messages].reverse().find((m) => m.role === "user");
    const latestUserMsgContent = userMessage?.content ?? "";
    const isNewTurn = latestUserMsgContent !== state.lastUserMessageContent;

    const gateway = new PrivacyGateway();
    const { maskedText, tokenMap } = gateway.maskPayload(latestUserMsgContent);

    const piiCategories: Array<{ type: string; count: number; label: string }> = [];
    const piiCounts: Record<string, number> = {};
    for (const key of Object.keys(Object.fromEntries(tokenMap))) {
      const match = key.match(/MASK_(\w+)_(\d+)/);
      if (match) {
        const cat = match[1].toLowerCase();
        piiCounts[cat] = (piiCounts[cat] || 0) + 1;
      }
    }
    const piiLabelMap: Record<string, string> = {
      email: "Email", phone: "Phone", ssn: "SSN",
      card: "Card", currency: "Currency", ip: "IP Address",
      token: "Token", id: "Identifier",
    };
    for (const [type, count] of Object.entries(piiCounts)) {
      piiCategories.push({ type, count, label: piiLabelMap[type] || type });
    }

    span.attributes.maskedText = maskedText;

    let currentApp = state.currentApp;
    if (!currentApp) {
      const apps = await db.select().from(connectedApps).limit(1);
      if (apps.length > 0) {
        currentApp = apps[0].appName;
      }
    }

    // 0. PRIORITY CHECK: If pendingToolCalls or parallelToolQueue contains items, shift the next tool dynamically and bypass LLM/Keyword override.
    const hasPending = !isNewTurn && state.pendingToolCalls && state.pendingToolCalls.length > 0;
    const hasParallel = !isNewTurn && state.parallelToolQueue && state.parallelToolQueue.length > 0;

    if (hasPending || hasParallel) {
      let nextCall: { name: string; args: Record<string, any> };
      const newPending = state.pendingToolCalls ? [...state.pendingToolCalls] : [];
      const newParallel = state.parallelToolQueue ? [...state.parallelToolQueue] : [];

      if (hasPending) {
        nextCall = newPending.shift()!;
        console.log(`[supervisorNode] Dequeuing next tool from pendingToolCalls: ${nextCall.name}`);
      } else {
        nextCall = newParallel.shift()!;
        console.log(`[supervisorNode] Dequeuing next tool from parallelToolQueue: ${nextCall.name}`);
      }

      // Force parameter and date bindings on priority tool execution
      const weddingIdVal = await resolveAmbientParameter("weddingId");
      if (weddingIdVal) {
        const isMutation = nextCall.name.startsWith("update_") || 
                           nextCall.name.startsWith("create_") || 
                           nextCall.name.startsWith("delete_") ||
                           nextCall.name.startsWith("list_") ||
                           nextCall.name.startsWith("get_");
        if (isMutation) {
          nextCall.args = nextCall.args || {};
          if (!nextCall.args.weddingId) {
            nextCall.args.weddingId = weddingIdVal;
            console.log(`[supervisorNode] Dequeuing: Force-bound weddingId "${weddingIdVal}" into tool ${nextCall.name}`);
          }
        }
      }

      // Map "date" to "weddingDate"
      if (nextCall.name === "update_wedding" || nextCall.name === "create_wedding") {
        if (nextCall.args && nextCall.args.date !== undefined && nextCall.args.weddingDate === undefined) {
          nextCall.args.weddingDate = nextCall.args.date;
          delete nextCall.args.date;
        }
      }

      // Standardize dates
      if (nextCall.args) {
        for (const key of Object.keys(nextCall.args)) {
          if (key.toLowerCase().includes("date") && typeof nextCall.args[key] === "string") {
            nextCall.args[key] = standardizeDateToISO(nextCall.args[key]);
          }
        }
      }

      telemetry.endSpan(requestId, span, {
        routingDecision: "mcp_action",
        decidedToolName: nextCall.name,
      });

      return {
        maskedInput: maskedText,
        tokenMap: Object.fromEntries(tokenMap),
        piiCategories,
        relevantSkills: [nextCall.name],
        toolExecutedInCurrentNode: false,
        lastUserMessageContent: latestUserMsgContent,
        executedTools: state.executedTools,
        executedToolSignatures: state.executedToolSignatures,
        messages: [],
        routingDecision: "mcp_action" as const,
        target_action: "mcp_action" as const,
        activeSubAgent: state.activeSubAgent,
        decidedToolName: nextCall.name,
        decidedToolArgs: nextCall.args,
        pendingToolCalls: newPending,
        parallelToolQueue: newParallel,
        currentApp,
      };
    }

    let customGlobalPrompt = "";
    let customOrchestrationRules = "";
    let customAgentRules = "";
    let customSkills: any[] = [];
    let keywordOverrides: any[] = [];

    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const tokens = configs[0].designTokens as any;
        customGlobalPrompt = tokens.globalSystemPrompt || "";
        customOrchestrationRules = tokens.orchestrationRules || "";
        customAgentRules = tokens.agentRules || "";
        if (tokens.customSkills) {
          customSkills = typeof tokens.customSkills === "string"
            ? JSON.parse(tokens.customSkills)
            : tokens.customSkills;
        }
        if (tokens.keywordOverrides) {
          keywordOverrides = typeof tokens.keywordOverrides === "string"
            ? JSON.parse(tokens.keywordOverrides)
            : tokens.keywordOverrides;
        }
      }
    } catch (e) {
      console.error("[supervisorNode] Failed to load custom configurations:", e);
    }

    const openAiTools: any[] = [];
    let mcpServersObj: any = {};
    if (currentApp) {
      await registerAppProvider(currentApp, state.modelConfig);

      try {
        const configs = await db.select().from(systemConfigurations).limit(1);
        const mcpServersValue = configs[0]?.designTokens?.mcpServers;
        if (mcpServersValue) {
          if (typeof mcpServersValue === "string") {
            try {
              const parsed = JSON.parse(mcpServersValue);
              mcpServersObj = parsed.mcpServers || parsed;
            } catch (e) {
              console.error("Failed to parse mcpServers string:", e);
            }
          } else {
            mcpServersObj = mcpServersValue.mcpServers || mcpServersValue;
          }
        }

        let serversToFetch = Object.keys(mcpServersObj);
        const isFirstTurn = state.messages.filter((m) => m.role === "assistant").length === 0;
        if (!isFirstTurn && state.activeTools && state.activeTools.length > 0) {
          serversToFetch = serversToFetch.filter((s) => state.activeTools!.includes(s));
        }

        for (const serverKey of serversToFetch) {
          const serverConfig = mcpServersObj[serverKey];
          if (!serverConfig || !serverConfig.serverUrl) continue;
          const tools = await fetchMcpTools(serverConfig.serverUrl, serverConfig.headers || {});
          for (const t of tools) {
            if (!t.name) continue;
            openAiTools.push({
              type: "function",
              function: {
                name: t.name,
                description: t.description || "",
                parameters: t.inputSchema || t.parameters || { type: "object", properties: {} },
              },
            });
          }
        }

        for (const c of customSkills) {
          if (!c.name) continue;
          const schema = typeof c.inputSchema === "string" ? JSON.parse(c.inputSchema) : c.inputSchema;
          openAiTools.push({
            type: "function",
            function: {
              name: c.name,
              description: c.description || "",
              parameters: schema || { type: "object", properties: {} },
            },
          });
        }

        if (openAiTools.length > 0) {
          llmSwitchboard.bindToolsToProvider(currentApp, openAiTools);
        }
      } catch (err) {
        console.error("[supervisorNode] Failed to load/bind MCP/custom tools:", err);
      }
    }

    let agents: any[] = [];
    try {
      agents = await db.select().from(autonomousAgents);
    } catch (err) {
      console.error("[supervisorNode] Failed to load database agents:", err);
    }

    const activeAgentsList = agents.map((a) => ({
      name: a.agentName,
      prompt: a.systemPrompt ?? "",
    }));

    // Load ambient context parameters from system configurations
    let ambientContextParams: Record<string, string> = {};
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const dt = configs[0].designTokens as any;
        const defaultParams = dt.defaultAmbientParameters;
        if (defaultParams) {
          if (typeof defaultParams === "string") {
            try {
              ambientContextParams = JSON.parse(defaultParams);
            } catch {
              defaultParams.split("\n").forEach((line: string) => {
                const parts = line.split(":");
                if (parts.length >= 2) {
                  ambientContextParams[parts[0].trim()] = parts.slice(1).join(":").trim();
                }
              });
            }
          } else {
            ambientContextParams = defaultParams;
          }
        }
      }
    } catch (e) {
      console.error("[supervisorNode] Failed to load ambient context params:", e);
    }

    const activeToolsList = [
      ...skillTools.map((s) => ({
        name: s.name,
        description: s.description,
        parameters: s.parameters,
      })),
      ...openAiTools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    ];

    const plannerSystemPrompt = `You are the Autonomous Planner & Supervisor for SavazAI.
${customGlobalPrompt ? `Global System Instructions:\n${customGlobalPrompt}\n` : ""}
${customOrchestrationRules ? `Orchestration Rules (Plan-Act Loop):\n${customOrchestrationRules}\n` : `Strict Plan-Act Loop Instructions:
1. Determine the plan and identify all necessary tool calls to fulfill the user's request.
2. If tool results are needed, you can plan one or multiple sequential tool calls in the 'toolCalls' array.
3. Provide any conversational text, explanations, or intermediate updates to the user in the 'conversationalText' field.
4. Set 'target_action' to 'mcp_action' if tool calls are planned. Set it to 'respond' when you have all the required information to formulate the final answer or if no tools are needed.`}
${customAgentRules ? `Agent Rules:\n${customAgentRules}\n` : ""}

## IRONCLAD TOOL GATING — NEVER HALLUCINATE DATA
- You are an orchestration layer. You do NOT generate or fabricate data.
- The Available Tools & Skills section below contains the ONLY tools you may use. Never call a tool not listed there.

## Context Parameters (available for use in tool arguments):
${JSON.stringify(ambientContextParams, null, 2)}

Available Sub-Agents:
${JSON.stringify(activeAgentsList, null, 2)}

Available Tools & Skills:
${JSON.stringify(activeToolsList, null, 2)}

You MUST respond with a JSON object strictly matching this schema:
{
  "target_action": "sub_agent" | "mcp_action" | "respond",
  "toolCalls": [
    { "name": "tool_name", "args": { "arg_name": "arg_value" } }
  ],
  "conversationalText": "conversational text, narration, or check-in here",
  "targetName": "agent_name_if_sub_agent_or_null",
  "targetArgs": {}
}

Do not include any other text or formatting. Return only the raw JSON.`;

    let routingDecision: "sub_agent" | "mcp_action" | "respond" | "end" = "respond";
    let target_action: "sub_agent" | "mcp_action" | "respond" | "end" = "respond";
    let selectedAgent = state.activeSubAgent;
    let decidedToolName: string | undefined;
    let decidedToolArgs: Record<string, any> | undefined;
    let rawResponse = "";
    let newlyQueuedTools: { name: string; args: any }[] = [];
    const pending: Array<{ name: string; args: Record<string, any> }> = [];
    const messagesToReturn: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp?: string }> = [];

    // 1. Programmatic Keyword Override Check with Multi-Turn Guardrail
    const latestUserMsgLower = latestUserMsgContent.toLowerCase();
    let forceTool: string | undefined;
    let forceArgs: Record<string, any> = {};

    const lastUserIdx = state.messages.map(m => m.role).lastIndexOf("user");
    const currentTurnMessages = lastUserIdx !== -1 ? state.messages.slice(lastUserIdx) : state.messages;

    for (const rule of keywordOverrides) {
      if (!rule.keywords || !rule.tool) continue;
      const match = rule.keywords.some((kw: string) => latestUserMsgLower.includes(kw.toLowerCase()));
      if (match) {
        const tool = rule.tool;
        const systemOutputExists = currentTurnMessages.some(
          (m) => m.role === "system" && m.content.includes(`Tool Execution Result for ${tool}`)
        );
        const alreadyExecuted = (state.executedTools && state.executedTools.includes(tool)) || systemOutputExists;
        
        if (!alreadyExecuted) {
          forceTool = tool;
          const args: Record<string, any> = {};
          if (Array.isArray(rule.requiredArgs)) {
            for (const argName of rule.requiredArgs) {
              const val = await resolveAmbientParameter(argName);
              if (val !== undefined) {
                args[argName] = val;
              }
            }
          }
          forceArgs = args;
          break;
        }
      }
    }

    if (forceTool) {
      routingDecision = "mcp_action";
      target_action = "mcp_action";
      pending.push({
        name: forceTool,
        args: forceArgs,
      });
      console.log(`[supervisorNode] Programmatically force-routed to: ${forceTool}`);
    } else if (currentApp) {
      try {
        console.log("Supervisor Thread History Count:", state.messages.length);

        const plannerMessages = [
          { role: "system" as const, content: plannerSystemPrompt },
          ...state.messages.map((m) => {
            let content = m.content;
            if (m.role === "user") {
              const { maskedText: mt } = gateway.maskPayload(content);
              content = mt;
            }
            content = scrubImageContent(content);
            return { role: m.role, content };
          }),
        ];

        const model = new StructuredModelWrapper(currentApp, state.modelConfig);
        const structuralPlanner = model.withStructuredOutput(
          z.object({
            target_action: z.enum(["mcp_action", "sub_agent", "respond"]),
            toolCalls: z.array(
              z.object({
                name: z.string(),
                args: z.record(z.any()),
              })
            ).optional(),
            conversationalText: z.string().optional(),
            targetName: z.string().nullable().optional(),
            targetArgs: z.record(z.any()).optional(),
          })
        );

        const decision = await structuralPlanner.invoke(plannerMessages, { requestId });
        rawResponse = JSON.stringify(decision);
        console.log("Structured Supervisor Output:", rawResponse);

        target_action = decision.target_action || "respond";
        routingDecision = target_action;

        // Accumulate conversational narration chunk if present
        if (decision.conversationalText) {
          console.log(`[supervisorNode] Accumulating conversational narration chunk: ${decision.conversationalText}`);
          messagesToReturn.push({
            role: "assistant" as const,
            content: decision.conversationalText,
            timestamp: buildTimestamp(),
          });
        }

        if (decision.toolCalls && decision.toolCalls.length > 0) {
          pending.push(...decision.toolCalls);
        } else if (target_action === "mcp_action" && decision.targetName) {
          pending.push({
            name: decision.targetName,
            args: decision.targetArgs || {},
          });
        }

        if (target_action === "sub_agent") {
          selectedAgent = decision.targetName || selectedAgent;
        }

        // Force proper routing decision based on targetName/pending tool calls
        if (pending.length > 0) {
          routingDecision = "mcp_action";
          target_action = "mcp_action";
        } else if (routingDecision === "respond" && selectedAgent) {
          routingDecision = "sub_agent";
          target_action = "sub_agent";
        }

        // CRUCIAL EXECUTION GUARD: Post-mutation data gathering sequence
        if (routingDecision === "respond") {
          const userMsgLower = latestUserMsgContent.toLowerCase();
          const turnSystemMessages = currentTurnMessages.filter(m => m.role === "system");
          
          const lastExecutedMutation = [...turnSystemMessages].reverse().find(m => 
            m.content.includes("Tool Execution Result for update_wedding") ||
            m.content.includes("Tool Execution Result for create_guest") ||
            m.content.includes("Tool Execution Result for update_guest") ||
            m.content.includes("Tool Execution Result for delete_guest") ||
            m.content.includes("Tool Execution Result for create_task") ||
            m.content.includes("Tool Execution Result for update_task") ||
            m.content.includes("Tool Execution Result for delete_task") ||
            m.content.includes("Tool Execution Result for create_ceremony") ||
            m.content.includes("Tool Execution Result for update_ceremony") ||
            m.content.includes("Tool Execution Result for delete_ceremony")
          );

          if (lastExecutedMutation) {
            console.log(`[supervisorNode] Guard triggered: mutation tool was executed in this turn.`);
            
            // Check what data gathering tools are requested and not yet run
            const requestsWedding = userMsgLower.includes("wedding") || userMsgLower.includes("summary") || userMsgLower.includes("detail");
            const requestsCeremonies = userMsgLower.includes("ceremon") || userMsgLower.includes("schedule");
            const requestsTasks = userMsgLower.includes("task") || userMsgLower.includes("todo");
            const requestsGuests = userMsgLower.includes("guest") || userMsgLower.includes("rsvp");

            const ranGetWedding = turnSystemMessages.some(m => m.content.includes("Tool Execution Result for get_wedding"));
            const ranListCeremonies = turnSystemMessages.some(m => m.content.includes("Tool Execution Result for list_ceremonies"));
            const ranListTasks = turnSystemMessages.some(m => m.content.includes("Tool Execution Result for list_tasks"));
            const ranListGuests = turnSystemMessages.some(m => m.content.includes("Tool Execution Result for list_guests"));

            let nextDataTool: string | undefined;
            if (requestsWedding && !ranGetWedding) {
              nextDataTool = "get_wedding";
            } else if (requestsCeremonies && !ranListCeremonies) {
              nextDataTool = "list_ceremonies";
            } else if (requestsTasks && !ranListTasks) {
              nextDataTool = "list_tasks";
            } else if (requestsGuests && !ranListGuests) {
              nextDataTool = "list_guests";
            }

            if (nextDataTool) {
              console.log(`[supervisorNode] Guard forcing sequential data gathering tool: ${nextDataTool}`);
              routingDecision = "mcp_action";
              target_action = "mcp_action";
              
              // Resolve weddingId for parameters
              const weddingIdVal = await resolveAmbientParameter("weddingId");
              const nextDataArgs = weddingIdVal ? { weddingId: weddingIdVal } : {};
              pending.push({
                name: nextDataTool,
                args: nextDataArgs,
              });
            }
          }
        }
      } catch (err) {
        console.error("[supervisorNode] planner LLM parsing failed:", err);
      }
    }

    // 2. PREVENT CONVERSATIONAL SHORT-CIRCUITING
    if (routingDecision === "respond" && pending.length === 0) {
      const userMsgLower = latestUserMsgContent.toLowerCase();
      const hasMutationKeyword = userMsgLower.includes("update") || 
                                 userMsgLower.includes("change") || 
                                 userMsgLower.includes("set") || 
                                 userMsgLower.includes("create") || 
                                 userMsgLower.includes("delete") || 
                                 userMsgLower.includes("add");
      
      if (hasMutationKeyword) {
        const turnSystemMessages = currentTurnMessages.filter(m => m.role === "system");
        const ranMutation = turnSystemMessages.some(m => 
          m.content.includes("Tool Execution Result for update_") ||
          m.content.includes("Tool Execution Result for create_") ||
          m.content.includes("Tool Execution Result for delete_")
        );

        if (!ranMutation) {
          console.log(`[supervisorNode] Conversational short-circuit detected! Intercepting and forcing fallback tool selection.`);
          
          // Match the user intent to the correct mutation tool
          let targetTool: string | undefined;
          if (userMsgLower.includes("date") || userMsgLower.includes("wedding")) {
            targetTool = "update_wedding";
          } else if (userMsgLower.includes("guest")) {
            targetTool = userMsgLower.includes("update") || userMsgLower.includes("change") ? "update_guest" : "create_guest";
          } else if (userMsgLower.includes("task") || userMsgLower.includes("todo")) {
            targetTool = userMsgLower.includes("update") || userMsgLower.includes("change") ? "update_task" : "create_task";
          } else if (userMsgLower.includes("ceremony") || userMsgLower.includes("schedule")) {
            targetTool = userMsgLower.includes("update") || userMsgLower.includes("change") ? "update_ceremony" : "create_ceremony";
          }

          if (targetTool) {
            console.log(`[supervisorNode] Fallback intercept mapped to tool: ${targetTool}`);
            routingDecision = "mcp_action";
            target_action = "mcp_action";
            
            // Extract arguments from user message (e.g. date for update_wedding)
            const args: Record<string, any> = {};
            if (targetTool === "update_wedding") {
              const dateMatch = latestUserMsgContent.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}/i);
              if (dateMatch) {
                args.weddingDate = dateMatch[0];
              } else {
                const simpleDateMatch = latestUserMsgContent.match(/\d{4}-\d{2}-\d{2}/);
                if (simpleDateMatch) {
                  args.weddingDate = simpleDateMatch[0];
                }
              }
            }
            pending.push({
              name: targetTool,
              args,
            });
          }
        }
      }
    }

    // Unwrap parallel tool calls if any
    const firstCall = pending[0];
    if (firstCall && (firstCall.name === "multi_tool_use.parallel" || firstCall.name === "parallel")) {
      const unwrapped = unwrapAllParallelTools(firstCall.name, firstCall.args);
      if (unwrapped.length > 0) {
        pending.shift();
        pending.unshift(...unwrapped);
        console.log(`[supervisorNode] Unwrapped parallel tool container. Queue:`, pending.map(t => t.name));
      }
    }

    if (pending.length > 0) {
      const nextCall = pending.shift()!;
      decidedToolName = nextCall.name;
      decidedToolArgs = nextCall.args;
      routingDecision = "mcp_action";
      target_action = "mcp_action";
      newlyQueuedTools = pending;
    }

    // 1. FORCE AMBIENT PARAMETER INJECTION INTO PARALLEL AND MUTATION TOOL ROUTING
    const weddingIdVal = await resolveAmbientParameter("weddingId");
    if (weddingIdVal) {
      if (routingDecision === "mcp_action" && decidedToolName) {
        const isMutation = decidedToolName.startsWith("update_") || 
                           decidedToolName.startsWith("create_") || 
                           decidedToolName.startsWith("delete_") ||
                           decidedToolName.startsWith("list_") ||
                           decidedToolName.startsWith("get_");
        if (isMutation) {
          decidedToolArgs = decidedToolArgs || {};
          if (!decidedToolArgs.weddingId) {
            decidedToolArgs.weddingId = weddingIdVal;
            console.log(`[supervisorNode] Force-bound weddingId "${weddingIdVal}" into tool ${decidedToolName}`);
          }
        }
      }

      if (newlyQueuedTools && newlyQueuedTools.length > 0) {
        newlyQueuedTools = newlyQueuedTools.map(t => {
          const isMutation = t.name.startsWith("update_") || 
                             t.name.startsWith("create_") || 
                             t.name.startsWith("delete_") ||
                             t.name.startsWith("list_") ||
                             t.name.startsWith("get_");
          if (isMutation) {
            t.args = t.args || {};
            if (!t.args.weddingId) {
              t.args.weddingId = weddingIdVal;
              console.log(`[supervisorNode] Force-bound weddingId "${weddingIdVal}" into queued tool ${t.name}`);
            }
          }
          return t;
        });
      }
    }

    const isDeleteAction = decidedToolName?.startsWith("delete_") || /delete_/.test(maskedText);
    if (isDeleteAction) {
      telemetry.endSpan(requestId, span, {
        isDeleteAction: true,
        routingDecision: "end",
      });
      await telemetry.endTrace(requestId);

      return {
        maskedInput: maskedText,
        tokenMap: Object.fromEntries(tokenMap),
        messages: [{
          role: "system",
          content: "PENDING_APPROVAL: delete action detected - thread frozen",
          timestamp: buildTimestamp(),
        }],
        routingDecision: "end" as const,
        target_action: "end" as const,
        activeSubAgent: selectedAgent,
      };
    }

    // Map "date" key to "weddingDate" key for update_wedding and create_wedding
    if (decidedToolName === "update_wedding" || decidedToolName === "create_wedding") {
      if (decidedToolArgs && decidedToolArgs.date !== undefined && decidedToolArgs.weddingDate === undefined) {
        decidedToolArgs.weddingDate = decidedToolArgs.date;
        delete decidedToolArgs.date;
        console.log(`[supervisorNode] Mapped "date" key to "weddingDate" for tool ${decidedToolName}`);
      }
    }
    if (newlyQueuedTools && newlyQueuedTools.length > 0) {
      newlyQueuedTools = newlyQueuedTools.map(t => {
        if (t.name === "update_wedding" || t.name === "create_wedding") {
          if (t.args && t.args.date !== undefined && t.args.weddingDate === undefined) {
            t.args.weddingDate = t.args.date;
            delete t.args.date;
            console.log(`[supervisorNode] Mapped "date" key to "weddingDate" for queued tool ${t.name}`);
          }
        }
        return t;
      });
    }

    // Standardize date fields in decidedToolArgs and newlyQueuedTools
    if (decidedToolArgs) {
      for (const key of Object.keys(decidedToolArgs)) {
        if (key.toLowerCase().includes("date") && typeof decidedToolArgs[key] === "string") {
          const originalVal = decidedToolArgs[key];
          decidedToolArgs[key] = standardizeDateToISO(originalVal);
          console.log(`[supervisorNode] Standardized date field "${key}": "${originalVal}" -> "${decidedToolArgs[key]}"`);
        }
      }
    }
    if (newlyQueuedTools && newlyQueuedTools.length > 0) {
      newlyQueuedTools = newlyQueuedTools.map(t => {
        if (t.args) {
          for (const key of Object.keys(t.args)) {
            if (key.toLowerCase().includes("date") && typeof t.args[key] === "string") {
              const originalVal = t.args[key];
              t.args[key] = standardizeDateToISO(originalVal);
              console.log(`[supervisorNode] Standardized date field in queued tool "${t.name}" ("${key}"): "${originalVal}" -> "${t.args[key]}"`);
            }
          }
        }
        return t;
      });
    }

    telemetry.endSpan(requestId, span, {
      routingDecision,
      selectedAgent: selectedAgent ?? "none",
      decidedToolName: decidedToolName ?? "none",
    });

    console.log("Supervisor Routing Decision:", routingDecision, decidedToolName, decidedToolArgs);

    return {
      maskedInput: maskedText,
      tokenMap: Object.fromEntries(tokenMap),
      piiCategories,
      relevantSkills: decidedToolName ? [decidedToolName] : [],
      toolExecutedInCurrentNode: false,
      lastUserMessageContent: latestUserMsgContent,
      executedTools: isNewTurn ? [] : state.executedTools,
      executedToolSignatures: isNewTurn ? [] : state.executedToolSignatures,
      messages: messagesToReturn,
      routingDecision,
      target_action,
      activeSubAgent: selectedAgent ?? state.activeSubAgent,
      decidedToolName: decidedToolName || null,
      decidedToolArgs: decidedToolArgs || {},
      pendingToolCalls: isNewTurn ? newlyQueuedTools : [...(state.pendingToolCalls || []), ...newlyQueuedTools],
      parallelToolQueue: isNewTurn ? [] : [...(state.parallelToolQueue || []), ...newlyQueuedTools],
      currentApp,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    await telemetry.endTrace(requestId);
    throw err;
  }
}

async function subAgentNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "subAgentNode");

  try {
    const agentName = state.activeSubAgent;
    let systemPrompt = "";

    if (agentName) {
      const rows = await db
        .select()
        .from(autonomousAgents)
        .where(eq(autonomousAgents.agentName, agentName))
        .limit(1);

      if (rows.length > 0) {
        systemPrompt = rows[0].systemPrompt ?? "";
      } else {
        console.log(`[subAgentNode] Agent "${agentName}" not found. Dynamically composing instructions...`);
        
        const dynamicPrompt = `You are a meta-agent designer. Create a highly professional, optimized, and detailed system prompt for a specialized AI agent named "${agentName}".
This agent is being deployed to handle tasks within the SavazAI harness.
Write a clear, concise system prompt specifying the role, instructions, and behavior of the "${agentName}" agent.
Return ONLY the raw prompt text, without any markdown formatting or meta comments.`;

        let composedPrompt = `You are a specialized assistant named "${agentName}".`;
        if (state.currentApp) {
          await registerAppProvider(state.currentApp, state.modelConfig);
          try {
            const completion = await llmSwitchboard.executeUniversalCompletion({
              messages: [{ role: "user", content: dynamicPrompt }],
              providerId: state.currentApp,
              options: { requestId },
            });
            composedPrompt = completion.text.trim();
          } catch (e) {
            console.error("Failed to dynamically compose agent prompt:", e);
          }
        }
        systemPrompt = composedPrompt;

        try {
          const apps = state.currentApp
            ? await db.select().from(connectedApps).where(eq(connectedApps.appName, state.currentApp)).limit(1)
            : await db.select().from(connectedApps).limit(1);
          
          const appId = apps.length > 0 ? apps[0].id : 1;

          await db.insert(autonomousAgents).values({
            appId,
            agentName,
            systemPrompt,
            allowedMcpTools: [],
            isCoreAgent: false,
          });
          console.log(`[subAgentNode] Dynamic agent "${agentName}" successfully composed and saved to database.`);
        } catch (dbErr) {
          console.error("Failed to save dynamic agent to database:", dbErr);
        }
      }
    } else {
      systemPrompt = "You are a general-purpose sub-agent.";
    }

    span.attributes.agentName = agentName;
    span.attributes.systemPrompt = systemPrompt;

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...state.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let responseContent = `[${agentName}] (no LLM route available)`;

    if (state.currentApp) {
      await registerAppProvider(state.currentApp, state.modelConfig);
      try {
        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages: allMessages,
          providerId: state.currentApp,
          options: { requestId },
        });
        responseContent = `[${agentName}] ${completion.text}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        responseContent = `[${agentName}] LLM unavailable (${msg}). Using system prompt: ${systemPrompt.slice(0, 80)}...`;
        span.attributes.llmError = msg;
      }
    }

    telemetry.endSpan(requestId, span, {
      responseLength: responseContent.length,
    });

    return {
      messages: [{
        role: "system" as const,
        content: `Sub-Agent ${agentName} Execution Result:\n${responseContent}`,
        timestamp: buildTimestamp(),
      }],
      routingDecision: "respond" as const,
      target_action: "respond" as const,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function extractAndFormatImages(rawText: string): { cleanText: string; markdownImages: string[] } {
  let cleanText = rawText;
  const markdownImages: string[] = [];

  // Strip base64 image data URLs
  const base64Regex = /data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g;
  let count = 1;
  for (const match of rawText.match(base64Regex) || []) {
    if (match.length > 100) {
      const placeholder = `[Image Asset #${count}]`;
      cleanText = cleanText.replace(match, placeholder);
      markdownImages.push(`![Showcase Image ${count}](${match})`);
      count++;
    }
  }

  // Strip image file URL references (e.g. image.png, photo.jpg)
  const imageFileRegex = /[\w\-./]+\.(png|jpg|jpeg|gif|webp|svg|bmp)/gi;
  for (const match of rawText.match(imageFileRegex) || []) {
    if (cleanText.includes(match)) {
      const placeholder = `[Image Asset #${count}]`;
      cleanText = cleanText.replace(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), placeholder);
      markdownImages.push(`![Image File ${count}](${match})`);
      count++;
    }
  }

  return { cleanText, markdownImages };
}

function scrubImageContent(text: string): string {
  return text
    .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[Binary Data]')
    .replace(/[\w\-./\\]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|tiff?)/gi, '[Image Reference]')
    .replace(/<img[^>]*>/gi, '[Image]')
    .replace(/!\[.*?\]\(.*?\)/g, '[Image]')
    .replace(/https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)/gi, '[Image URL]');
}

async function mcpActionNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "mcpActionNode");

  try {
    const toolName = state.decidedToolName;
    const toolArgs = state.decidedToolArgs || {};

    if (!toolName) {
      throw new Error("No tool was decided by the supervisor node.");
    }

    span.attributes.decidedToolName = toolName;
    span.attributes.decidedToolArgs = JSON.stringify(toolArgs);

    let resultText = "";
    
    let customSkills: any[] = [];
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens?.customSkills) {
        customSkills = typeof configs[0].designTokens.customSkills === "string"
          ? JSON.parse(configs[0].designTokens.customSkills)
          : configs[0].designTokens.customSkills;
      }
    } catch (e) {
      console.error("[mcpActionNode] Failed to load custom skills:", e);
    }

    const customSkill = customSkills.find((c) => c.name === toolName);
    const localSkill = skillTools.find((s) => s.name === toolName);

    if (customSkill) {
      let schema: any = {};
      try {
        schema = typeof customSkill.inputSchema === "string" ? JSON.parse(customSkill.inputSchema) : customSkill.inputSchema;
      } catch (err) {
        console.error("Failed to parse custom skill schema:", err);
      }
      const props = schema?.properties || {};
      for (const propName of Object.keys(props)) {
        if (toolArgs[propName] === undefined) {
          const ambientValue = await resolveAmbientParameter(propName);
          if (ambientValue !== undefined) {
            toolArgs[propName] = ambientValue;
            console.log(`[mcpActionNode] Auto-injected ambient parameter ${propName}=${ambientValue} for custom skill ${toolName}`);
          }
        }
      }

      console.log(`[mcpActionNode] Executing custom skill: ${toolName}`);
      try {
        const runner = new Function("args", customSkill.executableScriptCode);
        const executionResult = await runner(toolArgs);
        resultText = typeof executionResult === "object" ? JSON.stringify(executionResult) : String(executionResult);
      } catch (err: any) {
        console.error(`Custom skill execution failed for ${toolName}:`, err);
        resultText = JSON.stringify({ error: `Custom skill execution failed: ${err.message}` });
      }
    } else if (localSkill) {
      // Auto-inject missing properties for local skills
      const params = localSkill.parameters || [];
      for (const p of params) {
        const propName = p.name;
        if (toolArgs[propName] === undefined) {
          const ambientValue = await resolveAmbientParameter(propName);
          if (ambientValue !== undefined) {
            toolArgs[propName] = ambientValue;
            console.log(`[mcpActionNode] Auto-injected ambient parameter ${propName}=${ambientValue} for local skill ${toolName}`);
          }
        }
      }

      console.log(`[mcpActionNode] Executing local skill: ${toolName}`);
      const executionResult = await localSkill.execute(toolArgs);
      resultText = JSON.stringify(executionResult);
    } else {
      // Remote MCP tool execution
      console.log(`[mcpActionNode] Executing remote MCP tool: ${toolName}`);
      const configs = await db.select().from(systemConfigurations).limit(1);
      const mcpServersValue = configs[0]?.designTokens?.mcpServers;
      let mcpServersObj: any = {};
      if (mcpServersValue) {
        if (typeof mcpServersValue === "string") {
          try {
            const parsed = JSON.parse(mcpServersValue);
            mcpServersObj = parsed.mcpServers || parsed;
          } catch (e) {
            console.error("Failed to parse mcpServers:", e);
          }
        } else {
          mcpServersObj = mcpServersValue.mcpServers || mcpServersValue;
        }
      }

      let activeServerConfig: any = null;
      let serversToScan = Object.keys(mcpServersObj);
      if (state.activeTools) {
        serversToScan = serversToScan.filter((s) => state.activeTools!.includes(s));
      }

      // Scan cached tools to find which server exposes this toolName
      for (const serverKey of serversToScan) {
        const config = mcpServersObj[serverKey];
        if (!config || !config.serverUrl) continue;
        const tools = await fetchMcpTools(config.serverUrl, config.headers || {});
        const toolObj = tools.find((t: any) => t.name === toolName);
        if (toolObj) {
          activeServerConfig = config;

          // Auto-inject missing properties for remote tool
          const props = toolObj.inputSchema?.properties || toolObj.parameters?.properties || {};
          for (const propName of Object.keys(props)) {
            if (toolArgs[propName] === undefined) {
              const ambientValue = await resolveAmbientParameter(propName);
              if (ambientValue !== undefined) {
                toolArgs[propName] = ambientValue;
                console.log(`[mcpActionNode] Auto-injected ambient parameter ${propName}=${ambientValue} for remote tool ${toolName}`);
              }
            }
          }
          break;
        }
      }

      if (!activeServerConfig) {
        throw new Error(`MCP tool "${toolName}" could not be resolved on any active server.`);
      }

      const res = await fetch(activeServerConfig.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeServerConfig.headers || {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArgs,
          },
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        throw new Error(`Remote MCP invocation failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      if (data.result && Array.isArray(data.result.content)) {
        resultText = data.result.content.map((c: any) => c.text || "").join("\n");
      } else {
        resultText = JSON.stringify(data.result || data);
      }
    }

    const { cleanText: cleanResultText } = extractAndFormatImages(resultText);

    // ALWAYS store clean text in state — never include image data or raw tool output.
    // Restoring image placeholders here would poison subsequent LLM calls (supervisor re-evaluation).
    telemetry.endSpan(requestId, span, {
      status: "executed",
    });

    const toolSignature = `${toolName}:${JSON.stringify(toolArgs)}`;

    return {
      messages: [{
        role: "system" as const,
        content: `Tool Execution Result for ${toolName}:\n${cleanResultText}`,
        timestamp: buildTimestamp(),
      }],
      routingDecision: "respond" as const,
      target_action: "respond" as const,
      executedTools: toolName ? [...(state.executedTools || []), toolName] : (state.executedTools || []),
      executedToolSignatures: [...(state.executedToolSignatures || []), toolSignature],
      toolExecutedInCurrentNode: true,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function verifierNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "verifierNode");

  try {
    if (state.relevantSkills.length === 0) {
      telemetry.endSpan(requestId, span, {
        isValid: true,
        failures: "",
        attempts: 0,
        routingDecision: "respond",
      });
      return {
        verificationFailures: [],
        correctAttempts: 0,
        routingDecision: "respond" as const,
      };
    }

    const lastMsg = state.messages[state.messages.length - 1];
    const allFailures: string[] = [];

    for (const skill of state.relevantSkills) {
      const result = okfVerifier.verifyToolOutput(skill, lastMsg?.content ?? "");
      allFailures.push(...result.failures);
    }

    const attempts = state.correctAttempts;
    const isValid = allFailures.length === 0;

    let routingDecision: "respond" | "correct" = "respond";
    if (!isValid && attempts < MAX_CORRECT_ATTEMPTS) {
      routingDecision = "correct";
    }

    telemetry.endSpan(requestId, span, {
      isValid,
      failures: allFailures.join("; "),
      attempts,
      routingDecision,
    });

    return {
      verificationFailures: allFailures,
      correctAttempts: isValid ? 0 : attempts + 1,
      routingDecision,
      target_action: routingDecision,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function correctorNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "correctorNode");

  try {
    const failures = state.verificationFailures;
    const correctionNote = `[correction] Verification failed: ${failures.join("; ")}. Retrying with corrections.`;

    span.attributes.failures = failures.join("; ");

    telemetry.endSpan(requestId, span);

    return {
      messages: [{
        role: "system",
        content: correctionNote,
        timestamp: buildTimestamp(),
      }],
      verificationFailures: [],
      routingDecision: "respond" as const,
      target_action: "respond" as const,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function sanitizeOutput(text: string): string {
  // Strip supervisor routing tags like [supervisor] planner routing...
  let clean = text.replace(/\[supervisor\]\s*planner routing.*$/gm, '').trim();
  // Strip PENDING_APPROVAL freeze markers
  clean = clean.replace(/PENDING_APPROVAL:\s*delete action detected.*$/gm, '').trim();
  // Strip any leftover JSON object literals that start with {"supervisor"
  clean = clean.replace(/\{"supervisor":.*?"\}/gms, '').trim();
  // Strip stray { "target_action": ... } or { "meta": ... } patterns (non-narrative JSON)
  clean = clean.replace(/\{\s*"target_action"\s*:.*?\}/gms, '').trim();
  clean = clean.replace(/\{\s*"meta"\s*:.*?\}/gms, '').trim();
  // Strip MASK tokens that may have leaked through
  clean = clean.replace(/\[MASK_\w+_\d+\]/g, '[REDACTED]').trim();
  // Collapse multiple newlines
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();
  return clean;
}

async function respondNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "respondNode");

  try {
    const gateway = new PrivacyGateway();

    let currentApp = state.currentApp;
    if (!currentApp) {
      const apps = await db.select().from(connectedApps).limit(1);
      if (apps.length > 0) {
        currentApp = apps[0].appName;
      }
    }

    let customGlobalPrompt = "";
    let customOrchestrationRules = "";

    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const tokens = configs[0].designTokens as any;
        customGlobalPrompt = tokens.globalSystemPrompt || "";
        customOrchestrationRules = tokens.orchestrationRules || "";
      }
    } catch (e) {
      console.error("[respondNode] Failed to load custom configurations:", e);
    }

    // 1. Build the history of messages for presentation synthesis.
    const formattedHistory = state.messages.map((m) => {
      let content = m.content;
      if (m.role === "user") {
        const { maskedText } = gateway.maskPayload(content);
        content = maskedText;
      }
      content = scrubImageContent(content);
      const role = m.role === "system" ? "user" : m.role;
      return { role, content };
    });

    let mcpServersObj: any = {};
    const openAiTools: any[] = [];
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const tokens = configs[0].designTokens as any;
        const mcpServersValue = tokens.mcpServers;
        if (mcpServersValue) {
          if (typeof mcpServersValue === "string") {
            const parsed = JSON.parse(mcpServersValue);
            mcpServersObj = parsed.mcpServers || parsed;
          } else {
            mcpServersObj = mcpServersValue.mcpServers || mcpServersValue;
          }
        }
        let customSkills: any[] = [];
        if (tokens.customSkills) {
          customSkills = typeof tokens.customSkills === "string" ? JSON.parse(tokens.customSkills) : tokens.customSkills;
        }
        
        let serversToFetch = Object.keys(mcpServersObj);
        if (state.activeTools && state.activeTools.length > 0) {
          serversToFetch = serversToFetch.filter((s) => state.activeTools!.includes(s));
        }
        
        for (const serverKey of serversToFetch) {
          const serverConfig = mcpServersObj[serverKey];
          if (!serverConfig || !serverConfig.serverUrl) continue;
          const tools = await fetchMcpTools(serverConfig.serverUrl, serverConfig.headers || {});
          for (const t of tools) {
            if (t.name) openAiTools.push(t.name);
          }
        }
        for (const c of customSkills) {
          if (c.name) openAiTools.push(c.name);
        }
      }
    } catch (e) {
      console.error("[respondNode] Failed to load tools list:", e);
    }

    // 2. Instruct the LLM to format the response and synthesize raw data.
    const respondSystemPrompt = `You are the presentation layer. You must synthesize the raw data present in the 'system' role tool execution result messages within the conversation history. Do not invent, mock, or fallback to generic text templates. If tool execution results are present in the history, you must parse and render that exact data in clean Markdown formats.
${customGlobalPrompt ? `Global System Instructions:\n${customGlobalPrompt}\n` : ""}
${customOrchestrationRules ? `Orchestration Rules:\n${customOrchestrationRules}\n` : ""}

## Active Integrations and Available Tools:
Registered MCP Servers: ${Object.keys(mcpServersObj).join(", ")}
Available Tools in current session: ${JSON.stringify(openAiTools)}

## Presentation and Formatting Guidelines:
1. Aggressively convert all incoming raw JSON database strings, system tool metrics, and key-value blocks into beautiful, highly readable Markdown formats (clean bullet structures, bold headers, and proper Markdown Table matrices).
2. Markdown Table Formatting Rule: When generating Markdown pipe tables, you MUST explicitly add padding spaces and a mandatory terminating newline buffer character at the conclusion of every pipe table row context block (e.g., '| value | \n'). This ensures the markdown interpreter compiles and preserves clean visual grid components.
3. NEVER output raw JSON blocks, lists of brackets, or developer-facing debug strings.
4. Media and Images: If any media attachment objects, image URLs, or hero image URL strings are found within the raw tool payload data, you MUST explicitly render them as valid inline Markdown image arrays in the format '![Alt Text](url)'. Do not omit them.`;

    let synthesizedResponse = "I'm ready to help.";

    if (currentApp) {
      await registerAppProvider(currentApp, state.modelConfig);
      // Clear any bound tools to ensure a clean, tool-free presentation completion
      llmSwitchboard.bindToolsToProvider(currentApp, []);

      const completion = await llmSwitchboard.executeUniversalCompletion({
        messages: [
          { role: "system", content: respondSystemPrompt },
          ...formattedHistory,
        ],
        providerId: currentApp,
        options: { requestId },
      });
      synthesizedResponse = completion.text;
    }

    // 3. Unmask the response content if there is a token map
    let finalContent = synthesizedResponse;
    if (Object.keys(state.tokenMap).length > 0) {
      finalContent = gateway.unmaskPayload(
        synthesizedResponse,
        new Map(Object.entries(state.tokenMap)),
      );
    }

    finalContent = sanitizeOutput(finalContent);

    telemetry.endSpan(requestId, span);
    await telemetry.endTrace(requestId);

    return {
      messages: [{
        role: "assistant" as const,
        content: finalContent,
        timestamp: buildTimestamp(),
      }],
      toolExecutedInCurrentNode: false,
      routingDecision: "end" as const,
      target_action: "end" as const,
      currentApp,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    await telemetry.endTrace(requestId);
    throw err;
  }
}

const MAX_CORRECT_ATTEMPTS = 2;

function verifierRoutingLogic(state: typeof StateAnnotation.State): string {
  if (state.routingDecision === "correct") return "correct";
  return "respond";
}

function agentRoutingLogic(state: typeof StateAnnotation.State): string {
  if (state.pendingToolCalls && state.pendingToolCalls.length > 0) {
    console.log("[agentRoutingLogic] Locked on execution queue: routing to mcp_action.");
    return "mcp_action";
  }

  const decision = state.routingDecision ?? "respond";

  // Enhanced dedup: same tool + same args in a single turn
  if (decision === "mcp_action" && state.decidedToolName && state.executedToolSignatures) {
    const sig = `${state.decidedToolName}:${JSON.stringify(state.decidedToolArgs || {})}`;
    if (state.executedToolSignatures.includes(sig)) {
      console.log("[agentRoutingLogic] Turn-scoped dedup — exact same tool+args, forcing respond. Sig:", sig);
      return "respond";
    }
  }

  // Cross-turn guardrail: only block if the EXACT same tool has been executed in prior turns.
  if (decision === "mcp_action" && state.decidedToolName && state.executedTools) {
    if (state.executedTools.includes(state.decidedToolName)) {
      console.log("[agentRoutingLogic] Cross-turn dedup — tool already executed in prior turns, forcing respond. Tool:", state.decidedToolName, "Executed:", state.executedTools);
      return "respond";
    }
    console.log("[agentRoutingLogic] Routing to mcpAction — new tool not yet executed. Tool:", state.decidedToolName, "Already executed:", state.executedTools);
  }

  // Safety net: if responding but user intent seems unfulfilled, log warning
  if (decision === "respond" && state.executedTools && state.executedTools.length > 0) {
    const userMsg = [...state.messages].reverse().find(m => m.role === "user");
    const userText = userMsg?.content?.toLowerCase() ?? "";
    for (const tool of state.executedTools) {
      const parts = tool.split(/[_-]/);
      for (const p of parts) {
        if (p.length > 3 && userText.includes(p) && !state.executedTools.includes(tool)) {
          console.warn(`[agentRoutingLogic] WARNING: user mentioned "${p}" but tool "${tool}" was not executed.`);
        }
      }
    }
  }

  return decision;
}

const graph = new StateGraph(StateAnnotation)
  .addNode("supervisor", supervisorNode)
  .addNode("subAgent", subAgentNode)
  .addNode("mcpAction", mcpActionNode)
  .addNode("verifier", verifierNode)
  .addNode("corrector", correctorNode)
  .addNode("respond", respondNode)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", agentRoutingLogic, {
    sub_agent: "subAgent",
    mcp_action: "mcpAction",
    respond: "respond",
    correct: "corrector",
    end: END,
  })
  .addEdge("subAgent", "verifier")
  .addEdge("mcpAction", "supervisor")
  .addConditionalEdges("verifier", verifierRoutingLogic, {
    correct: "corrector",
    respond: "supervisor",
  })
  .addEdge("corrector", "supervisor")
  .addEdge("respond", END);

export const compiledGraph = graph.compile({ checkpointer: new MemorySaver() });
export type GraphAnnotationType = typeof StateAnnotation;

export async function* streamGraphEvents(
  input: Partial<GraphState>,
  options?: { requestId?: string; threadId?: string },
): AsyncGenerator<unknown> {
  const stream = await compiledGraph.stream(input, {
    streamMode: "updates",
    configurable: {
      requestId: options?.requestId,
      thread_id: options?.threadId || "default-thread",
    },
  });
  for await (const chunk of stream) {
    yield chunk;
  }
}
