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
  decidedToolName: z.string().optional(),
  decidedToolArgs: z.record(z.string(), z.any()).optional(),
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
  decidedToolName: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  decidedToolArgs: Annotation<Record<string, any> | undefined>({
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
      signal: AbortSignal.timeout(10000),
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

async function supervisorNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();

  telemetry.startTrace(requestId, "langgraph-run");
  const span = telemetry.startSpan(requestId, "supervisorNode");

  try {
    const userMessage = [...state.messages].reverse().find((m) => m.role === "user");
    const gateway = new PrivacyGateway();
    const { maskedText, tokenMap } = gateway.maskPayload(userMessage?.content ?? "");

    span.attributes.maskedText = maskedText;

    let customGlobalPrompt = "";
    let customOrchestrationRules = "";
    let customSkills: any[] = [];

    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const tokens = configs[0].designTokens as any;
        customGlobalPrompt = tokens.globalSystemPrompt || "";
        customOrchestrationRules = tokens.orchestrationRules || "";
        if (tokens.customSkills) {
          customSkills = typeof tokens.customSkills === "string"
            ? JSON.parse(tokens.customSkills)
            : tokens.customSkills;
        }
      }
    } catch (e) {
      console.error("[supervisorNode] Failed to load custom configurations:", e);
    }

    const openAiTools: any[] = [];
    let mcpServersObj: any = {};
    if (state.currentApp) {
      await registerAppProvider(state.currentApp, state.modelConfig);

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
        if (state.activeTools) {
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
          llmSwitchboard.bindToolsToProvider(state.currentApp, openAiTools);
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
1. Track execution progress against a compound user checklist.
2. If multiple actions/tools are needed to fulfill the request, execute them sequentially.
3. Evaluate the output history of the executed tools against the remaining unfulfilled goals.
4. If more steps are needed, output "target_action": "mcp_action" or "target_action": "sub_agent" to continue.
5. If all goals are fulfilled, output "target_action": "respond" and formulate the final synthesized reply in the "response" field.`}

Available Sub-Agents:
${JSON.stringify(activeAgentsList, null, 2)}

Available Tools & Skills:
${JSON.stringify(activeToolsList, null, 2)}

You MUST respond with a JSON object strictly matching this schema:
{
  "target_action": "sub_agent" | "mcp_action" | "respond" | "end",
  "meta": {
    "agentName": string | null, // Selected agent name if target_action is "sub_agent"
    "toolName": string | null,  // Selected tool name if target_action is "mcp_action"
    "arguments": object | null  // Tool arguments if target_action is "mcp_action"
  },
  "response": string | null // Response text if target_action is "respond"
}

Do not include any other text or formatting. Return only the raw JSON.`;

    let routingDecision: "sub_agent" | "mcp_action" | "respond" | "end" = "respond";
    let selectedAgent = state.activeSubAgent;
    let decidedToolName: string | undefined;
    let decidedToolArgs: Record<string, any> | undefined;
    let responseText = "";

    if (state.currentApp) {
      try {
        const formattedHistory = state.messages.map((m) => {
          const role = m.role === "user" ? "user" as const : "assistant" as const;
          let content = m.content;
          if (m.role === "user") {
            const { maskedText } = gateway.maskPayload(content);
            content = maskedText;
          }
          return { role, content };
        });

        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages: [
            { role: "system", content: plannerSystemPrompt },
            ...formattedHistory,
          ],
          providerId: state.currentApp,
          options: { requestId },
        });

        let cleanText = completion.text.trim();
        if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        const decision = JSON.parse(cleanText);
        routingDecision = decision.target_action || "respond";

        if (routingDecision === "sub_agent") {
          selectedAgent = decision.meta?.agentName || selectedAgent;
        } else if (routingDecision === "mcp_action") {
          decidedToolName = decision.meta?.toolName || undefined;
          decidedToolArgs = decision.meta?.arguments || undefined;
        }
        responseText = decision.response || "";
      } catch (err) {
        console.error("[supervisorNode] planner LLM parsing failed:", err);
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
        activeSubAgent: selectedAgent,
      };
    }

    telemetry.endSpan(requestId, span, {
      routingDecision,
      selectedAgent: selectedAgent ?? "none",
      decidedToolName: decidedToolName ?? "none",
    });

    return {
      maskedInput: maskedText,
      tokenMap: Object.fromEntries(tokenMap),
      relevantSkills: decidedToolName ? [decidedToolName] : [],
      messages: routingDecision === "respond" ? [{
        role: "assistant" as const,
        content: responseText || "I'm ready to help.",
        timestamp: buildTimestamp(),
      }] : [{
        role: "system" as const,
        content: `[supervisor] planner routing to route=${routingDecision} target=${decidedToolName || selectedAgent || "none"}`,
        timestamp: buildTimestamp(),
      }],
      routingDecision,
      activeSubAgent: selectedAgent ?? state.activeSubAgent,
      decidedToolName,
      decidedToolArgs,
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
          const apps = await db
            .select()
            .from(connectedApps)
            .where(eq(connectedApps.appName, state.currentApp || "WedPlanAI-Local"))
            .limit(1);
          
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
        role: "assistant" as const,
        content: responseContent,
        timestamp: buildTimestamp(),
      }],
      routingDecision: "respond" as const,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function extractAndFormatImages(rawText: string): { cleanText: string; markdownImages: string[] } {
  // Matches base64 data URLs: e.g. data:image/jpeg;base64,...
  const base64Regex = /data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g;
  const matches = rawText.match(base64Regex) || [];

  let cleanText = rawText;
  const markdownImages: string[] = [];

  let count = 1;
  for (const match of matches) {
    if (match.length > 100) {
      const placeholder = `[Image Asset #${count}]`;
      cleanText = cleanText.replace(match, placeholder);
      markdownImages.push(`![Showcase Image ${count}](${match})`);
      count++;
    }
  }

  return { cleanText, markdownImages };
}

async function mcpActionNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "mcpActionNode");

  try {
    const gateway = new PrivacyGateway();
    const latestMessage = state.messages[state.messages.length - 1];
    const unmasked = gateway.unmaskPayload(
      latestMessage?.content ?? "",
      new Map(Object.entries(state.tokenMap)),
    );

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
        signal: AbortSignal.timeout(15000),
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

    const { cleanText: cleanResultText, markdownImages } = extractAndFormatImages(resultText);

    let finalFormattedResponse = "";
    if (markdownImages.length > 0) {
      let fallbackText = cleanResultText;
      for (let i = 0; i < markdownImages.length; i++) {
        const placeholder = `[Image Asset #${i + 1}]`;
        fallbackText = fallbackText.replace(placeholder, `\n\n${markdownImages[i]}\n\n`);
      }
      finalFormattedResponse = `Tool Execution Result:\n${fallbackText}`;
    } else {
      finalFormattedResponse = `Tool Execution Result:\n${resultText}`;
    }

    if (state.currentApp) {
      await registerAppProvider(state.currentApp, state.modelConfig);
      try {
        const prompt = `You are a helpful assistant. The tool "${toolName}" was executed to fulfill the user's request.
Here is the tool output (sensitive PII has been masked, and any large base64 image data has been replaced with placeholders like [Image Asset #1]):
${cleanResultText}

Transform raw technical JSON metrics into a clean, human-readable narrative. Never print massive inline code dumps or raw JSON blocks unless explicitly requested.
Refer to [Image Asset #1], [Image Asset #2], etc., inline in your narrative where appropriate so they render properly.`;

        const summary = await llmSwitchboard.executeUniversalCompletion({
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: unmasked },
          ],
          providerId: state.currentApp,
          options: { requestId },
        });

        let formattedText = summary.text;
        for (let i = 0; i < markdownImages.length; i++) {
          formattedText = formattedText.replace(new RegExp(`\\[?Image Asset #${i + 1}\\]?`, 'g'), markdownImages[i]);
        }
        finalFormattedResponse = formattedText;
      } catch (err) {
        console.error("Failed to generate tool output summary:", err);
      }
    }

    telemetry.endSpan(requestId, span, {
      status: "executed",
    });

    return {
      messages: [{
        role: "assistant" as const,
        content: finalFormattedResponse,
        timestamp: buildTimestamp(),
      }],
      routingDecision: "respond" as const,
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
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function respondNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "respondNode");

  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const gateway = new PrivacyGateway();

    if (lastMessage && Object.keys(state.tokenMap).length > 0) {
      const unmasked = gateway.unmaskPayload(
        lastMessage.content,
        new Map(Object.entries(state.tokenMap)),
      );
      telemetry.endSpan(requestId, span);
      await telemetry.endTrace(requestId);
      return {
        messages: [{ ...lastMessage, content: unmasked }],
        routingDecision: "end",
      };
    }

    telemetry.endSpan(requestId, span);
    await telemetry.endTrace(requestId);
    return { messages: [], routingDecision: "end" };
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
  return state.routingDecision ?? "respond";
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
  .addEdge("mcpAction", "verifier")
  .addConditionalEdges("verifier", verifierRoutingLogic, {
    correct: "corrector",
    respond: "supervisor",
  })
  .addEdge("corrector", "supervisor")
  .addEdge("respond", END);

export const compiledGraph = graph.compile({ checkpointer: new MemorySaver() });
export type GraphAnnotationType = typeof StateAnnotation;

export async function* streamGraphEvents(
  input: GraphState,
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
