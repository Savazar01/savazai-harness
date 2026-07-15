import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph";
import { z } from "zod";
import { PrivacyGateway } from "../utils/privacy-gateway.js";
import { skillTools } from "../utils/skills-loader.js";
import { llmSwitchboard } from "../services/llm-switchboard.js";
import { db } from "../db/index.js";
import { connectedApps, systemConfigurations, type ModelConfig } from "../db/schema.js";
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
  routingDecision: z.enum(["sub_agent", "mcp_action", "respond", "correct", "end", "DataFetchAgent", "MutationAgent", "SynthesisAgent"]).optional(),
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
  target_action: z.enum(["sub_agent", "mcp_action", "respond", "correct", "end", "DataFetchAgent", "MutationAgent", "SynthesisAgent"]).optional(),
  delegationQueue: z.array(z.string()).optional(),
  delegatedTasks: z.record(z.string(), z.any()).optional(),
  synthesisOutput: z.string().optional(),
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
  routingDecision: Annotation<"sub_agent" | "mcp_action" | "respond" | "correct" | "end" | "DataFetchAgent" | "MutationAgent" | "SynthesisAgent" | undefined>({
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
  target_action: Annotation<"sub_agent" | "mcp_action" | "respond" | "correct" | "end" | "DataFetchAgent" | "MutationAgent" | "SynthesisAgent" | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  delegationQueue: Annotation<string[]>({
    reducer: (x, y) => y !== undefined ? y : (x ?? []),
    default: () => [],
  }),
  delegatedTasks: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  synthesisOutput: Annotation<string | undefined>({
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
  private tools: any[] = [];

  constructor(providerId: string, modelConfig: any) {
    this.providerId = providerId;
    this.modelConfig = modelConfig;
  }

  bindTools(tools: any[]) {
    this.tools = tools;
    return this;
  }

  withStructuredOutput(schema: any) {
    return {
      invoke: async (messages: any[], options?: any) => {
        if (this.tools && this.tools.length > 0) {
          llmSwitchboard.bindToolsToProvider(this.providerId, this.tools);
        } else {
          llmSwitchboard.bindToolsToProvider(this.providerId, []);
        }

        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages,
          providerId: this.providerId,
          options: {
            ...options,
            response_format: { type: "json_object" },
          },
        });

        // 1. Handle native model tool_calls if they are returned instead of raw JSON text
        if (completion.toolCalls && completion.toolCalls.length > 0) {
          console.log("[StructuredModelWrapper] Native tool calls detected:", completion.toolCalls);
          const parsed: Record<string, any> = {
            target_action: "mcp_action",
            toolCalls: completion.toolCalls,
            conversationalText: completion.text || undefined,
          };
          try {
            return schema.parse(parsed);
          } catch (e) {
            console.error("[StructuredModelWrapper] Zod validation failed for native toolCalls:", parsed, "Error:", e);
            throw e;
          }
        }

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

        let parsed: any;
        try {
          if (cleanText) {
            parsed = JSON.parse(cleanText);
          } else {
            throw new Error("Empty model response text");
          }
        } catch (e) {
          console.error("[StructuredModelWrapper] JSON parsing failed. Raw Text:", rawText, "Error:", e);
          throw e;
        }

        // 2. Normalize variations in key names and structures from different LLM models
        if (parsed && typeof parsed === "object") {
          // Normalize toolCalls / tool_calls
          if (parsed.tool_calls && !parsed.toolCalls) {
            parsed.toolCalls = parsed.tool_calls;
          }
          // Normalize target_action / targetAction
          if (parsed.targetAction && !parsed.target_action) {
            parsed.target_action = parsed.targetAction;
          }
          // Ensure toolCalls elements are correctly formatted objects
          if (parsed.toolCalls && Array.isArray(parsed.toolCalls)) {
            parsed.toolCalls = parsed.toolCalls.map((tc: any) => {
              if (tc && typeof tc === "object") {
                const name = tc.name || tc.function?.name || tc.tool || tc.tool_name || "";
                const args = tc.args || tc.arguments || tc.function?.arguments || tc.parameters || {};
                const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
                return { name, args: parsedArgs };
              }
              return tc;
            });
          }
        }

        try {
          return schema.parse(parsed);
        } catch (e) {
          console.error("[StructuredModelWrapper] Zod validation failed. Parsed Object:", parsed, "Error:", e);
          throw e;
        }
      }
    };
  }
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

    // Check for delete action freeze
    const isDeleteAction = latestUserMsgContent.toLowerCase().includes("delete");
    if (isDeleteAction) {
      telemetry.endSpan(requestId, span, {
        isDeleteAction: true,
        routingDecision: "end",
      });

      return {
        maskedInput: maskedText,
        tokenMap: Object.fromEntries(tokenMap),
        piiCategories,
        relevantSkills: [],
        toolExecutedInCurrentNode: false,
        lastUserMessageContent: latestUserMsgContent,
        messages: [{
          role: "system",
          content: "PENDING_APPROVAL: delete action detected - thread frozen",
          timestamp: buildTimestamp(),
        }],
        routingDecision: "end" as const,
        target_action: "end" as const,
      };
    }

    let queue = state.delegationQueue ? [...state.delegationQueue] : [];
    let delegatedTasks = state.delegatedTasks ? { ...state.delegatedTasks } : {};

    if (isNewTurn) {
      // Clear previous turn parameters and analyze user intent to build a new delegation queue
      queue = [];
      delegatedTasks = {};

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
        console.error("[supervisorNode] Failed to load custom configurations:", e);
      }

      const supervisorSystemPrompt = `You are the High-Level Supervisor and Orchestrator for SavazAI.
Your sole responsibility is task delegation and coordination. You must NOT execute tool calls or write conversational responses to the user directly.
Instead, you must analyze the user prompt and decide which specialized sub-agents need to run to fulfill the request.
${customGlobalPrompt ? `Global System Instructions:\n${customGlobalPrompt}\n` : ""}
${customOrchestrationRules ? `Orchestration Rules:\n${customOrchestrationRules}\n` : ""}

Available Sub-Agents:
1. DataFetchAgent: Specialized in gathering, listing, or retrieving data. Use this if the user wants a report, summary, details, or lists of weddings, guests, tasks, ceremonies, etc.
2. MutationAgent: Specialized in database writing, creation, updates, or deletions. Use this if the user wants to create, change, delete, or add any wedding, guest, task, ceremony, etc.

Analyze the user's intent:
- If the user wants to fetch data, delegate to 'DataFetchAgent'.
- If the user wants to mutate data, delegate to 'MutationAgent'.
- If they want both (e.g. create a guest and show the updated list), delegate to 'MutationAgent' then 'DataFetchAgent'.

You MUST respond with a JSON object strictly matching this schema:
{
  "delegationQueue": ["MutationAgent" | "DataFetchAgent"]
}
Return only the raw JSON.`;

      const plannerMessages = [
        { role: "system" as const, content: supervisorSystemPrompt },
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

      if (currentApp) {
        try {
          await registerAppProvider(currentApp, state.modelConfig);
          const model = new StructuredModelWrapper(currentApp, state.modelConfig);
          const structuralPlanner = model.withStructuredOutput(
            z.object({
              delegationQueue: z.array(z.enum(["MutationAgent", "DataFetchAgent"])),
            })
          );
          const decision = await structuralPlanner.invoke(plannerMessages, { requestId });
          queue = decision.delegationQueue.map((agent: string) => {
            if (agent === "MutationAgent") return "MutationAgent";
            return "DataFetchAgent";
          });
          console.log("[supervisorNode] Structured Planner Decided Queue:", queue);
        } catch (err: any) {
          console.error("[supervisorNode] Structured Planner LLM call failed with schema validation/parsing error:", err?.stack || err?.message || err);
          throw err;
        }
      } else {
        queue = ["MutationAgent", "DataFetchAgent"];
      }
    }

    // Process the delegation queue sequentially
    let routingDecision: "MutationAgent" | "DataFetchAgent" | "SynthesisAgent" | "respond" = "respond";
    if (queue.length > 0) {
      const nextAgent = queue.shift()!;
      if (nextAgent === "MutationAgent" || nextAgent === "mutationAgent") {
        routingDecision = "MutationAgent";
      } else {
        routingDecision = "DataFetchAgent";
      }
    } else {
      // Queue is empty, delegation is complete -> Go to SynthesisAgent
      if (Object.keys(delegatedTasks).length > 0) {
        routingDecision = "SynthesisAgent";
      } else {
        routingDecision = "respond";
      }
    }

    telemetry.endSpan(requestId, span, {
      routingDecision,
      queueLength: queue.length,
    });

    return {
      maskedInput: maskedText,
      tokenMap: Object.fromEntries(tokenMap),
      piiCategories,
      relevantSkills: [],
      toolExecutedInCurrentNode: false,
      lastUserMessageContent: latestUserMsgContent,
      executedTools: isNewTurn ? [] : state.executedTools,
      executedToolSignatures: isNewTurn ? [] : state.executedToolSignatures,
      messages: [],
      routingDecision,
      target_action: routingDecision,
      delegationQueue: queue,
      delegatedTasks,
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

function isMutationTool(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("create_") || 
         lower.startsWith("update_") || 
         lower.startsWith("delete_") ||
         lower.startsWith("add_") ||
         lower.startsWith("remove_") ||
         lower.includes("mutate") ||
         lower.includes("save") ||
         lower.includes("edit") ||
         lower.includes("change");
}

function isDataFetchTool(name: string): boolean {
  return !isMutationTool(name);
}

async function executeToolByName(
  toolName: string,
  toolArgs: Record<string, any>,
  state: typeof StateAnnotation.State
): Promise<string> {
  let resultText: string;
  
  let customSkills: any[] = [];
  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    if (configs.length > 0 && configs[0].designTokens?.customSkills) {
      customSkills = typeof configs[0].designTokens.customSkills === "string"
        ? JSON.parse(configs[0].designTokens.customSkills)
        : configs[0].designTokens.customSkills;
    }
  } catch (e) {
    console.error("[executeToolByName] Failed to load custom skills:", e);
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
        }
      }
    }

    try {
      const runner = new Function("args", customSkill.executableScriptCode);
      const executionResult = await runner(toolArgs);
      resultText = typeof executionResult === "object" ? JSON.stringify(executionResult) : String(executionResult);
    } catch (err: any) {
      console.error(`Custom skill execution failed for ${toolName}:`, err);
      resultText = JSON.stringify({ error: `Custom skill execution failed: ${err.message}` });
    }
  } else if (localSkill) {
    const params = localSkill.parameters || [];
    for (const p of params) {
      const propName = p.name;
      if (toolArgs[propName] === undefined) {
        const ambientValue = await resolveAmbientParameter(propName);
        if (ambientValue !== undefined) {
          toolArgs[propName] = ambientValue;
        }
      }
    }
    const executionResult = await localSkill.execute(toolArgs);
    resultText = JSON.stringify(executionResult);
  } else {
    // Remote MCP tool
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

    for (const serverKey of serversToScan) {
      const config = mcpServersObj[serverKey];
      if (!config || !config.serverUrl) continue;
      const tools = await fetchMcpTools(config.serverUrl, config.headers || {});
      const toolObj = tools.find((t: any) => t.name === toolName);
      if (toolObj) {
        activeServerConfig = config;
        const props = toolObj.inputSchema?.properties || toolObj.parameters?.properties || {};
        for (const propName of Object.keys(props)) {
          if (toolArgs[propName] === undefined) {
            const ambientValue = await resolveAmbientParameter(propName);
            if (ambientValue !== undefined) {
              toolArgs[propName] = ambientValue;
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

  const { cleanText } = extractAndFormatImages(resultText);
  return cleanText;
}

async function runSubAgentLoop(
  agentName: string,
  systemPrompt: string,
  toolFilter: (toolName: string) => boolean,
  state: typeof StateAnnotation.State,
  config?: any
) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, `${agentName}Loop`);

  const gateway = new PrivacyGateway();
  const newMessages: typeof state.messages = [];
  const currentTurnMessages = [...state.messages];
  const localExecutedTools: string[] = [];
  const localExecutedToolSignatures: string[] = [];

  let currentApp = state.currentApp;
  if (!currentApp) {
    const apps = await db.select().from(connectedApps).limit(1);
    if (apps.length > 0) {
      currentApp = apps[0].appName;
    }
  }

  if (!currentApp) {
    throw new Error("No connected app configuration found");
  }

  const openAiTools: any[] = [];
  let mcpServersObj: any = {};
  let customSkills: any[] = [];

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
      if (tokens.customSkills) {
        customSkills = typeof tokens.customSkills === "string" ? JSON.parse(tokens.customSkills) : tokens.customSkills;
      }
    }

    const serversToFetch = Object.keys(mcpServersObj);
    for (const serverKey of serversToFetch) {
      const serverConfig = mcpServersObj[serverKey];
      if (!serverConfig || !serverConfig.serverUrl) continue;
      const tools = await fetchMcpTools(serverConfig.serverUrl, serverConfig.headers || {});
      for (const t of tools) {
        if (!t.name || !toolFilter(t.name)) continue;
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
      if (!c.name || !toolFilter(c.name)) continue;
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
  } catch (e) {
    console.error(`[${agentName}] Failed to load tools list:`, e);
  }

  await registerAppProvider(currentApp, state.modelConfig);

  const model = new StructuredModelWrapper(currentApp, state.modelConfig);
  if (openAiTools.length > 0) {
    model.bindTools(openAiTools);
  }

  const planner = model.withStructuredOutput(
    z.object({
      target_action: z.enum(["mcp_action", "respond"]),
      toolCalls: z.array(
        z.object({
          name: z.string(),
          args: z.record(z.any()),
        })
      ).optional(),
      conversationalText: z.string().optional(),
    })
  );

  let iterations = 0;
  const maxIterations = 5;
  let done = false;

  while (!done && iterations < maxIterations) {
    iterations++;
    console.log(`[${agentName}] Running iteration ${iterations}/${maxIterations}`);

    const formattedHistory = currentTurnMessages.map((m) => {
      let content = m.content;
      if (m.role === "user") {
        const { maskedText } = gateway.maskPayload(content);
        content = maskedText;
      }
      content = scrubImageContent(content);
      return { role: m.role, content };
    });

    const messages = [
      {
        role: "system" as const,
        content: `${systemPrompt}

You MUST respond with a JSON object strictly matching this schema:
{
  "target_action": "mcp_action" | "respond",
  "toolCalls": [
    {
      "name": "name_of_the_tool_to_call",
      "args": {
        "arg_name": "arg_value"
      }
    }
  ],
  "conversationalText": "narrative response or description of action"
}

If you need to call any tool, you must set "target_action" to "mcp_action" and populate the "toolCalls" list.
If you have finished calling tools, do not need to call any tools, or have gathered/modified the data, set "target_action" to "respond" and do not include toolCalls.
You MUST output ONLY valid JSON.`
      },
      ...formattedHistory,
    ];

    try {
      const decision = await planner.invoke(messages, { requestId });
      console.log(`[${agentName}] Planner decision:`, decision);

      if (decision.conversationalText) {
        const narration = {
          role: "assistant" as const,
          content: `[${agentName}] ${decision.conversationalText}`,
          timestamp: buildTimestamp(),
        };
        newMessages.push(narration);
        currentTurnMessages.push(narration);
      }

      if (decision.target_action === "mcp_action" && decision.toolCalls && decision.toolCalls.length > 0) {
        for (const call of decision.toolCalls) {
          console.log(`[${agentName}] Executing tool: ${call.name}`);
          
          const weddingIdVal = await resolveAmbientParameter("weddingId");
          if (weddingIdVal && (call.name.startsWith("update_") || call.name.startsWith("create_") || call.name.startsWith("delete_") || call.name.startsWith("list_") || call.name.startsWith("get_"))) {
            call.args = call.args || {};
            if (!call.args.weddingId) {
              call.args.weddingId = weddingIdVal;
            }
          }

          if (call.name === "update_wedding" || call.name === "create_wedding") {
            if (call.args && call.args.date !== undefined && call.args.weddingDate === undefined) {
              call.args.weddingDate = call.args.date;
              delete call.args.date;
            }
          }

          if (call.args) {
            for (const key of Object.keys(call.args)) {
              if (key.toLowerCase().includes("date") && typeof call.args[key] === "string") {
                call.args[key] = standardizeDateToISO(call.args[key]);
              }
            }
          }

          const cleanResultText = await executeToolByName(call.name, call.args, state);
          const toolMsg = {
            role: "system" as const,
            content: `Tool Execution Result for ${call.name}:\n${cleanResultText}`,
            timestamp: buildTimestamp(),
          };
          newMessages.push(toolMsg);
          currentTurnMessages.push(toolMsg);

          localExecutedTools.push(call.name);
          localExecutedToolSignatures.push(`${call.name}:${JSON.stringify(call.args)}`);
        }
      } else {
        done = true;
      }
    } catch (err: any) {
      console.error(`[${agentName}] EXACT SCHEMA/PARSING ERROR:`, err?.stack || err?.message || err);
      throw err;
    }
  }

  telemetry.endSpan(requestId, span);

  return {
    messages: newMessages,
    executedTools: localExecutedTools,
    executedToolSignatures: localExecutedToolSignatures,
  };
}

async function dataFetchAgentNode(state: typeof StateAnnotation.State, config?: any) {
  const systemPrompt = `You are the DataFetchAgent. Your role is to gather, list, or retrieve data requested by the user.
You must use the available data-fetching tools (e.g., get_wedding, list_guests, list_tasks, list_ceremonies, list_vendors) to retrieve the relevant information.
Call as many data-fetching tools as necessary to completely satisfy the user's request.
Once you have retrieved all the data or if no tools can help, stop planning tool calls.`;

  const result = await runSubAgentLoop(
    "DataFetchAgent",
    systemPrompt,
    (toolName) => isDataFetchTool(toolName),
    state,
    config
  );

  const updatedTasks = {
    ...state.delegatedTasks,
    DataFetchAgent: { status: "completed", timestamp: new Date().toISOString() },
  };

  return {
    messages: result.messages,
    executedTools: result.executedTools,
    executedToolSignatures: result.executedToolSignatures,
    delegatedTasks: updatedTasks,
    routingDecision: "supervisor" as const,
    target_action: "supervisor" as const,
  };
}

async function mutationAgentNode(state: typeof StateAnnotation.State, config?: any) {
  const systemPrompt = `You are the MutationAgent. Your role is to write, create, update, or delete database records as requested by the user.
You must use the available database mutation tools (e.g., create_wedding, update_wedding, create_guest, update_guest, delete_guest, create_task, update_task, delete_task, create_ceremony, update_ceremony, delete_ceremony) to perform the changes.
Call the mutation tools with the exact arguments requested by the user.
Once all changes are performed, stop planning tool calls.`;

  const result = await runSubAgentLoop(
    "MutationAgent",
    systemPrompt,
    (toolName) => isMutationTool(toolName),
    state,
    config
  );

  const updatedTasks = {
    ...state.delegatedTasks,
    MutationAgent: { status: "completed", timestamp: new Date().toISOString() },
  };

  return {
    messages: result.messages,
    executedTools: result.executedTools,
    executedToolSignatures: result.executedToolSignatures,
    delegatedTasks: updatedTasks,
    routingDecision: "supervisor" as const,
    target_action: "supervisor" as const,
  };
}

function sanitizeOutput(text: string): string {
  let clean = text.replace(/\[supervisor\]\s*planner routing.*$/gm, '').trim();
  clean = clean.replace(/PENDING_APPROVAL:\s*delete action detected.*$/gm, '').trim();
  clean = clean.replace(/\{"supervisor":.*?"\}/gms, '').trim();
  clean = clean.replace(/\{\s*"target_action"\s*:.*?\}/gms, '').trim();
  clean = clean.replace(/\{\s*"meta"\s*:.*?\}/gms, '').trim();
  clean = clean.replace(/\[MASK_\w+_\d+\]/g, '[REDACTED]').trim();
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();
  return clean;
}

async function synthesisAgentNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "synthesisAgentNode");

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
    console.error("[synthesisAgentNode] Failed to load custom configurations:", e);
  }

  const gateway = new PrivacyGateway();
  const formattedHistory: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  for (const m of state.messages) {
    let content = m.content;
    if (m.role === "user") {
      const { maskedText } = gateway.maskPayload(content);
      content = maskedText;
    }
    content = scrubImageContent(content);
    const role = m.role === "system" ? "user" as const : m.role as "user" | "assistant" | "system";
    
    const lastMsg = formattedHistory[formattedHistory.length - 1];
    if (lastMsg && lastMsg.role === role) {
      lastMsg.content += `\n\n${content}`;
    } else {
      formattedHistory.push({ role, content });
    }
  }

  const synthesisSystemPrompt = `You are the SynthesisAgent. All programmatic tool executions and database mutations are complete.
Your sole task is to compile a highly detailed, comprehensive summary of the sub-agent operations and the retrieved data from the history timeline.
${customGlobalPrompt ? `Global System Instructions:\n${customGlobalPrompt}\n` : ""}
${customOrchestrationRules ? `Orchestration Rules:\n${customOrchestrationRules}\n` : ""}

## Presentation and Formatting Guidelines:
1. Synthesize all raw data present in the history. Do not invent, mock, or fallback to generic templates.
2. Aggressively convert all incoming raw JSON database strings, system tool metrics, and key-value blocks into beautiful, highly readable Markdown formats (clean bullet structures, bold headers, and proper Markdown Table matrices).
3. NEVER output raw JSON blocks, lists of brackets, or developer-facing debug strings.
4. Return a complete, detailed conversational response in Markdown. Do not output JSON.`;

  let responseText = "No operations executed.";
  if (currentApp) {
    await registerAppProvider(currentApp, state.modelConfig);
    llmSwitchboard.bindToolsToProvider(currentApp, []);

    try {
      const completion = await llmSwitchboard.executeUniversalCompletion({
        messages: [
          { role: "system", content: synthesisSystemPrompt },
          ...formattedHistory,
        ],
        providerId: currentApp,
        options: { requestId },
      });
      responseText = completion.text;
    } catch (err) {
      console.error("[synthesisAgentNode] LLM call failed:", err);
    }
  }

  telemetry.endSpan(requestId, span);

  return {
    synthesisOutput: responseText,
    routingDecision: "respond" as const,
    target_action: "respond" as const,
  };
}

async function respondNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "respondNode");

  try {
    const gateway = new PrivacyGateway();

    // Read the output from the SynthesisAgent
    let content = state.synthesisOutput || "I've processed your request.";

    // Unmask the response content if there is a token map
    if (Object.keys(state.tokenMap).length > 0) {
      content = gateway.unmaskPayload(
        content,
        new Map(Object.entries(state.tokenMap)),
      );
    }

    content = sanitizeOutput(content);

    telemetry.endSpan(requestId, span);
    await telemetry.endTrace(requestId);

    return {
      messages: [{
        role: "assistant" as const,
        content,
        timestamp: buildTimestamp(),
      }],
      toolExecutedInCurrentNode: false,
      routingDecision: "end" as const,
      target_action: "end" as const,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    await telemetry.endTrace(requestId);
    throw err;
  }
}

function agentRoutingLogic(state: typeof StateAnnotation.State): string {
  if (state.routingDecision === "DataFetchAgent") {
    return "DataFetchAgent";
  }
  if (state.routingDecision === "MutationAgent") {
    return "MutationAgent";
  }
  if (state.routingDecision === "SynthesisAgent") {
    return "SynthesisAgent";
  }
  if (state.routingDecision === "end") {
    return "end";
  }

  console.log("[agentRoutingLogic] Defaulting/Fallback to respond.");
  return "respond";
}

const graph = new StateGraph(StateAnnotation)
  .addNode("supervisorNode", supervisorNode)
  .addNode("DataFetchAgent", dataFetchAgentNode)
  .addNode("MutationAgent", mutationAgentNode)
  .addNode("SynthesisAgent", synthesisAgentNode)
  .addNode("respondNode", respondNode)
  .addEdge(START, "supervisorNode")
  .addConditionalEdges("supervisorNode", agentRoutingLogic, {
    DataFetchAgent: "DataFetchAgent",
    MutationAgent: "MutationAgent",
    SynthesisAgent: "SynthesisAgent",
    respond: "respondNode",
    end: END,
  })
  .addEdge("DataFetchAgent", "supervisorNode")
  .addEdge("MutationAgent", "supervisorNode")
  .addEdge("SynthesisAgent", "respondNode")
  .addEdge("respondNode", END);

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
