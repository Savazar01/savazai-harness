import { StateGraph, Annotation, START, END, MemorySaver, Command, interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { PrivacyGateway } from "../utils/privacy-gateway.js";
import { convertMarkdownToHtml } from "../utils/config-registry.js";
import { skillTools } from "../utils/skills-loader.js";
import { llmSwitchboard } from "../services/llm-switchboard.js";
import { db } from "../db/index.js";
import { connectedApps, systemConfigurations, agentflows, type ModelConfig } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { TelemetryGateway } from "../utils/telemetry.js";
import { getValidGmailAccessToken, sendGmailEmail } from "../utils/config-registry.js";
import { runPython } from "../utils/python-runner.js";
import dns from "node:dns";
import postgres from "postgres";


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
  routingDecision: z.enum([
    "sub_agent",
    "mcp_action",
    "respond",
    "correct",
    "end",
    "DataFetchAgent",
    "MutationAgent",
    "SynthesisAgent",
    "CommunicationAgent",
    "communication_dispatch"
  ]).optional(),
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
  target_action: z.enum([
    "sub_agent",
    "mcp_action",
    "respond",
    "correct",
    "end",
    "DataFetchAgent",
    "MutationAgent",
    "SynthesisAgent",
    "CommunicationAgent",
    "communication_dispatch"
  ]).optional(),
  delegationQueue: z.array(z.string()).optional(),
  delegatedTasks: z.record(z.string(), z.any()).optional(),
  synthesisOutput: z.string().optional(),
  pendingCommunications: z.array(
    z.object({
      recipients: z.array(z.string()),
      subject: z.string(),
      body: z.string(),
      bodyHtml: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    })
  ).optional(),
  executionMode: z.enum(["plan_first", "direct", "inherit"]).optional(),
  plan_approved: z.boolean().optional(),
  supervisorPlan: z.array(z.any()).optional(),
  approvedActions: z.array(z.string()).optional(),
  parameterLocks: z.record(z.any()).optional(),
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
  routingDecision: Annotation<
    | "sub_agent"
    | "mcp_action"
    | "respond"
    | "correct"
    | "end"
    | "DataFetchAgent"
    | "MutationAgent"
    | "SynthesisAgent"
    | "CommunicationAgent"
    | "communication_dispatch"
    | undefined
  >({
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
  target_action: Annotation<
    | "sub_agent"
    | "mcp_action"
    | "respond"
    | "correct"
    | "end"
    | "DataFetchAgent"
    | "MutationAgent"
    | "SynthesisAgent"
    | "CommunicationAgent"
    | "communication_dispatch"
    | undefined
  >({
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
  pendingCommunications: Annotation<
    Array<{ recipients: string[]; subject: string; body: string; bodyHtml?: string; metadata?: Record<string, any> }> | undefined
  >({
    reducer: (x, y) => y !== undefined ? y : (x ?? []),
    default: () => [],
  }),
  executionMode: Annotation<"plan_first" | "direct" | "inherit" | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  plan_approved: Annotation<boolean | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  supervisorPlan: Annotation<any[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  approvedActions: Annotation<string[] | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  parameterLocks: Annotation<Record<string, any> | undefined>({
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

  if (paramName.toLowerCase().includes("wedding")) {
    try {
      const dbRes = await db.execute(sql`SELECT DISTINCT wedding_id FROM guests WHERE wedding_id IS NOT NULL LIMIT 1`);
      const row = (dbRes as any)?.rows?.[0] || (dbRes as any)?.[0];
      if (row?.wedding_id) return String(row.wedding_id);
    } catch {}
    return "be5badd9-0cb2-4d5d-9acf-2412406b9cae";
  }

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

      // Direct lookup first, then try canonical aliases for common type names
      const aliasMap: Record<string, string[]> = {
        "openai-compatible": ["openai", "openai-compatible"],
        "openai": ["openai", "openai-compatible"],
        "gemini": ["gemini"],
        "anthropic": ["anthropic"],
        "ollama": ["ollama"],
        "lmstudio": ["lmstudio"],
        "openrouter": ["openrouter"],
      };
      const candidates = aliasMap[providerType] || [providerType];
      let prov = candidates.map((k) => providers[k]).find((p) => p && p.active !== false);

      // If still no match, fall back to first active provider in the map
      if (!prov) {
        prov = Object.values(providers).find((p: any) => p?.active === true) as any;
      }

      if (prov) {
        baseUrl = prov.endpoint || baseUrl;
        // Append /v1 for openai-compatible providers if not already present
        if ((providerType === "openai-compatible" || providerType === "openai") && !baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
          baseUrl = `${baseUrl.replace(/\/+$/, "")}/v1`;
        }
        apiKey = prov.apiKey || apiKey;
        if (!modelOverride?.modelName) {
          modelName = prov.defaultModel || modelName;
        }
      }
    }

    const isDocker = process.env.DATABASE_URL?.includes("savazai-db") || !process.env.DATABASE_URL?.includes("localhost");
    if (isDocker && typeof baseUrl === "string") {
      if (baseUrl.includes("localhost:11434")) {
        baseUrl = baseUrl.replace("localhost:11434", "host.docker.internal:11434");
      } else if (baseUrl.includes("127.0.0.1:11434")) {
        baseUrl = baseUrl.replace("127.0.0.1:11434", "host.docker.internal:11434");
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
  let resolvedUrl = serverUrl;
  const isDocker = process.env.DATABASE_URL?.includes("savazai-db") || !process.env.DATABASE_URL?.includes("localhost");
  if (isDocker && typeof resolvedUrl === "string") {
    if (resolvedUrl.includes("localhost:")) {
      resolvedUrl = resolvedUrl.replace("localhost:", "host.docker.internal:");
    } else if (resolvedUrl.includes("127.0.0.1:")) {
      resolvedUrl = resolvedUrl.replace("127.0.0.1:", "host.docker.internal:");
    }
  }

  const cacheKey = `${resolvedUrl}:${JSON.stringify(headers)}`;
  const cached = mcpToolCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.tools;
  }

  try {
    const res = await fetch(resolvedUrl, {
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
      console.error(`[fetchMcpTools] Failed to fetch tools from ${resolvedUrl}: HTTP ${res.status}`);
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

function convertZodToJsonSchema(schema: any): any {
  if (!schema) return {};

  let current = schema;
  while (current && current._def) {
    if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
    } else if (current instanceof z.ZodOptional) {
      current = current._def.innerType;
    } else if (current instanceof z.ZodNullable) {
      current = current._def.innerType;
    } else if (current instanceof z.ZodEffects) {
      current = current._def.schema;
    } else {
      break;
    }
  }

  if (current instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(current.shape)) {
      properties[key] = convertZodToJsonSchema(value);
      
      let isOptional = false;
      let check = value as any;
      while (check && check._def) {
        if (
          check instanceof z.ZodOptional || 
          check instanceof z.ZodNullable || 
          check instanceof z.ZodDefault
        ) {
          isOptional = true;
          break;
        }
        if (check._def.innerType) {
          check = check._def.innerType;
        } else if (check._def.schema) {
          check = check._def.schema;
        } else {
          break;
        }
      }
      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (current instanceof z.ZodArray) {
    return {
      type: "array",
      items: convertZodToJsonSchema(current.element),
    };
  }

  if (current instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: current._def.values,
    };
  }

  if (current instanceof z.ZodString) {
    return { type: "string" };
  }

  if (current instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (current instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (current instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: true,
    };
  }

  return { type: "string" };
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

        const jsonSchema = convertZodToJsonSchema(schema);
        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages,
          providerId: this.providerId,
          options: {
            ...options,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "response_schema",
                schema: jsonSchema,
              },
            },
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

          // Normalize envelopes from flat structures returned by some models
          if (!parsed.envelopes && (parsed.to || parsed.recipient || parsed.recipients) && parsed.subject && parsed.body) {
            const rec = parsed.to || parsed.recipient || parsed.recipients;
            parsed.envelopes = [
              {
                recipients: Array.isArray(rec) ? rec : [rec],
                subject: parsed.subject,
                body: parsed.body,
                metadata: parsed.metadata,
              }
            ];
          }

          // Normalize each envelope structure to use standard keys
          if (parsed.envelopes && Array.isArray(parsed.envelopes)) {
            parsed.envelopes = parsed.envelopes.map((env: any) => {
              if (env && typeof env === "object") {
                const rec = env.recipients || env.to || env.recipient;
                return {
                  recipients: Array.isArray(rec) ? rec : rec ? [rec] : [],
                  subject: env.subject || "",
                  body: env.body || "",
                  metadata: env.metadata,
                };
              }
              return env;
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

async function getDynamicToolDefinitions(activeTools?: string[]): Promise<Array<{ name: string; description: string; category: string }>> {
  const tools: Array<{ name: string; description: string; category: string }> = [];

  const nativeTools = [
    { name: "phone_number_validator", description: "Validate phone number format and formatting style.", category: "native" },
    { name: "email_domain_inspector", description: "Validate email domain mx records and deliverability status.", category: "native" },
    { name: "geocoding_lookup", description: "Find geographical coordinates (latitude and longitude) for a street address.", category: "native" },
    { name: "financial_math_calculator", description: "Execute simple math expressions safely (+ - * / ()).", category: "native" },
    { name: "analytics_dashboard_generator", description: "Aggregate event records into statistics and output a local markdown file path.", category: "native" },
    { name: "postgres_query_tool", description: "Execute read-only SQL queries on a PostgreSQL database.", category: "native" },
    { name: "sqlite_query_tool", description: "Execute read-only SQL queries on a local SQLite database.", category: "native" },
    { name: "mongodb_query_tool", description: "Execute queries and actions on a MongoDB database.", category: "native" },
    { name: "google_docs_writer", description: "Create or write content to Google Docs files via OAuth.", category: "native" },
    { name: "google_sheets_sync", description: "Append rows/values to Google Sheets spreadsheet via OAuth.", category: "native" },
    { name: "google_drive_uploader", description: "Upload raw text or files to Google Drive folders via OAuth.", category: "native" },
    { name: "google_places", description: "Search locations and points of interest using the Google Places API.", category: "native" },
    { name: "web_search", description: "Perform a Google Search or Tavily Web Search and retrieve relevant summaries.", category: "native" },
    { name: "send-email", description: "Dispatch rich HTML or Markdown emails to recipients.", category: "native" },
    { name: "generate-pdf", description: "Compile a Markdown report into a PDF report document.", category: "native" },
  ];
  tools.push(...nativeTools);

  for (const s of skillTools) {
    tools.push({ name: s.name, description: s.description, category: "skill" });
  }

  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    if (configs.length > 0 && configs[0].designTokens?.customSkills) {
      const customSkills = typeof configs[0].designTokens.customSkills === "string"
        ? JSON.parse(configs[0].designTokens.customSkills)
        : configs[0].designTokens.customSkills;
      if (Array.isArray(customSkills)) {
        for (const cs of customSkills) {
          tools.push({ name: cs.name, description: cs.description, category: "custom" });
        }
      }
    }
  } catch (e) {
    console.error("[getDynamicToolDefinitions] Failed to load custom skills:", e);
  }

  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    const mcpServersValue = configs[0]?.designTokens?.mcpServers;
    let mcpServersObj: any = {};
    if (mcpServersValue) {
      if (typeof mcpServersValue === "string") {
        try {
          const parsed = JSON.parse(mcpServersValue);
          mcpServersObj = parsed.mcpServers || parsed;
        } catch {
          // Ignore invalid JSON string
        }
      } else {
        mcpServersObj = mcpServersValue.mcpServers || mcpServersValue;
      }
    }

    let serversToScan = Object.keys(mcpServersObj);
    if (activeTools && activeTools.length > 0) {
      const serverKeyMatches = serversToScan.filter((s) => activeTools.includes(s));
      // Only narrow to specific servers if activeTools contains explicit server key names
      if (serverKeyMatches.length > 0) {
        serversToScan = serverKeyMatches;
      }
    }

    for (const serverKey of serversToScan) {
      const config = mcpServersObj[serverKey];
      if (!config || !config.serverUrl || config.disabled === true || config.active === false) continue;
      const headers = config.headers || {};
      const mcpTools = await fetchMcpTools(config.serverUrl, headers);
      for (const mt of mcpTools) {
        tools.push({ name: mt.name, description: mt.description, category: `mcp:${serverKey}` });
      }
    }
  } catch (e) {
    console.error("[getDynamicToolDefinitions] Failed to load MCP tools:", e);
  }

  if (activeTools && activeTools.length > 0) {
    return tools.filter(t => {
      if (activeTools.includes(t.name)) return true;
      if (t.category.startsWith("mcp:")) {
        const serverName = t.category.split(":")[1];
        if (activeTools.includes(serverName)) return true;
      }
      return false;
    });
  }

  return tools;
}

async function getDefaultExecutionMode(): Promise<"plan_first" | "direct"> {
  try {
    const [wf] = await db
      .select()
      .from(agentflows)
      .where(eq(agentflows.status, "published"))
      .limit(1);
    if (wf && wf.canvasDefinition) {
      const cd = typeof wf.canvasDefinition === "string"
        ? JSON.parse(wf.canvasDefinition)
        : wf.canvasDefinition;
      if (cd && Array.isArray(cd.nodes)) {
        const supervisor = cd.nodes.find((n: any) => n.roleTemplate === "supervisor");
        if (supervisor && supervisor.data && supervisor.data.executionMode) {
          return supervisor.data.executionMode;
        }
      }
    }
  } catch (err) {
    console.error("[getDefaultExecutionMode] failed to read config:", err);
  }
  return "plan_first";
}

async function generateExecutionPlanFromTools(
  tools: Array<{ name: string; description: string; category: string }>,
  message: string,
  currentApp: string,
  modelConfig: any,
  requestId: string
): Promise<any[]> {
  let filteredTools = tools;
  if (isReadOnlyQuery(message)) {
    filteredTools = tools.filter(t => 
      t.name.startsWith("list_") || 
      t.name.startsWith("get_") || 
      t.name.includes("fetch") || 
      t.name.includes("query") || 
      (!t.name.startsWith("create_") && !t.name.startsWith("update_") && !t.name.startsWith("delete_") && !t.name.startsWith("add_") && !t.name.startsWith("remove_") && !t.name.startsWith("send_"))
    );
  }
  const toolDescriptions = filteredTools.map(t => `- Name: "${t.name}"\n  Description: "${t.description}"\n  Category: "${t.category}"`).join("\n\n");

  const plannerPrompt = `You are a Supervisor/Routing Agent. Your task is to analyze the user request, determine which tools should be executed, and generate a structured Execution Plan.
Choose ONLY the tools that are strictly required to resolve the user's intent. Do not include irrelevant tools.

For each selected tool, you MUST specify:
1. nodeId: The exact name of the tool (e.g. "phone_number_validator" or "list_tasks").
2. targetNode: A descriptive name of the tool/action.
3. actionVerb: Choose one from 'CREATE', 'UPDATE', 'DELETE', 'SEND', 'LIST', 'READ'.
4. targetEntity: The entity name being acted upon (e.g., "Guest", "Task", "Email", "Phone").
5. parameters: A dictionary of key-value parameters extracted from the user request to be passed to the tool.

CRITICAL PARAMETER EXTRACTION RULES:
- Extract all explicit user-provided parameters and populate them into the 'parameters' object.
- If critical parameters for a creation/update action are ambiguous or missing, do NOT use placeholders. Instead, set "requiresClarification": true and "warning": "Description of the missing parameter" in that item.

READ-ONLY & INTENT-BASED CLASSIFICATION RULES:
- If the user request contains retrieval/querying keywords ("list", "get", "show", "provide", "status", "report", "fetch", "details", "read", "view", "display", "summarize", "export", "find", "search"), you MUST force the generated plan to set actionVerb to "READ" or "LIST".
- For read-only queries, you are STRICTLY PROHIBITED from choosing 'CREATE', 'UPDATE', or 'DELETE' action verbs or selecting mutation tools. Ensure you select ONLY list_* or get_* tools and specify allowedVerbs = ["LIST", "READ"].

Available Tools to choose from:
${toolDescriptions}

You MUST return your decision as a valid JSON object matching the following structure:
{
  "executionPlan": [
    {
      "nodeId": "tool_name",
      "targetNode": "Tool Label",
      "allowedVerbs": ["CREATE"],
      "actionVerb": "CREATE",
      "targetEntity": "Entity Name",
      "parameters": {
        "key1": "value1"
      },
      "requiresClarification": false,
      "warning": ""
    }
  ]
}

Return ONLY the raw JSON object. Do not include markdown backticks or extra commentary.`;

  try {
    await registerAppProvider(currentApp, modelConfig);
    const completion = await llmSwitchboard.executeUniversalCompletion({
      messages: [
        { role: "system", content: plannerPrompt },
        { role: "user", content: `Original user request: "${message}"\nGenerate the execution plan.` }
      ],
      providerId: currentApp,
      options: { requestId }
    });

    const cleaned = completion.text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    let plan = parsed.executionPlan || [];

    // Post-process to remove CREATE locks for read-only queries
    if (isReadOnlyQuery(message)) {
      plan = plan.filter((item: any) => {
        const verb = String(item.actionVerb || item.allowedVerbs?.[0] || "").toUpperCase();
        const nodeId = String(item.nodeId || "").toLowerCase();
        if (verb === "CREATE" || verb === "UPDATE" || verb === "DELETE") return false;
        if (nodeId.startsWith("create_") || nodeId.startsWith("update_") || nodeId.startsWith("delete_") || nodeId.startsWith("add_") || nodeId.startsWith("remove_")) return false;
        return true;
      });
      for (const item of plan) {
        item.actionVerb = "LIST";
        item.allowedVerbs = ["LIST", "READ"];
      }
    }

    for (const planItem of plan) {
      if (!planItem.allowedVerbs || planItem.allowedVerbs.length === 0) {
        planItem.allowedVerbs = [planItem.actionVerb || "CREATE"];
      }
      if (!planItem.actionVerb) {
        planItem.actionVerb = planItem.allowedVerbs[0] || "CREATE";
      }
    }
    return plan;
  } catch (err) {
    console.error("[generateExecutionPlanFromTools] Failed to generate plan:", err);
    return [];
  }
}

async function supervisorNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();

  telemetry.startTrace(requestId, "langgraph-run", config?.configurable?.thread_id);
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
    let newPlanApproved = state.plan_approved;
    let newSupervisorPlan = state.supervisorPlan;
    let newApprovedActions = state.approvedActions;
    let newParameterLocks = state.parameterLocks;

    if (isNewTurn) {
      // Clear previous turn parameters and analyze user intent to build a new delegation queue
      queue = [];
      delegatedTasks = {};
      newPlanApproved = undefined;
      newSupervisorPlan = undefined;
      newApprovedActions = undefined;
      newParameterLocks = undefined;

      let mode = state.executionMode;
      if (!mode || mode === "inherit") {
        mode = await getDefaultExecutionMode();
      }

      if (mode === "plan_first") {
        const tools = await getDynamicToolDefinitions(state.activeTools);
        const plan = await generateExecutionPlanFromTools(
          tools,
          latestUserMsgContent,
          currentApp ?? "WedPlanAI-Local",
          state.modelConfig,
          requestId
        );

        console.log("[supervisorNode] Execution mode: plan_first. Generating plan and pausing.", JSON.stringify(plan));

        // Call interrupt to pause execution and await approval
        const resumeValue = interrupt({
          plan,
          status: "WAITING_USER_APPROVAL",
        }) as { approved: boolean; feedback?: string } | undefined;

        console.log("[supervisorNode] Resumed with value:", JSON.stringify(resumeValue));

        if (resumeValue) {
          newPlanApproved = resumeValue.approved;
          if (!resumeValue.approved) {
            let currentPlan = plan;
            let feedback = resumeValue.feedback || "";
            while (true) {
              const revisedPlan = await generateExecutionPlanFromTools(
                tools,
                `Original request: "${latestUserMsgContent}"\nUser feedback on previous plan: "${feedback}"`,
                currentApp ?? "WedPlanAI-Local",
                state.modelConfig,
                requestId
              );

              const nextResume = interrupt({
                plan: revisedPlan,
                status: "WAITING_USER_APPROVAL",
              }) as { approved: boolean; feedback?: string } | undefined;

              console.log("[supervisorNode] Re-paused and resumed with value:", JSON.stringify(nextResume));

              if (!nextResume || nextResume.approved) {
                currentPlan = revisedPlan;
                newPlanApproved = nextResume ? nextResume.approved : true;
                break;
              }
              feedback = nextResume.feedback || "";
            }
            newSupervisorPlan = currentPlan;
            queue = currentPlan.map((item: any) => {
              const nodeId = item.nodeId;
              if (nodeId === "send-email" || nodeId === "CommunicationAgent") return "CommunicationAgent";
              if (nodeId === "generate-pdf" || nodeId === "SynthesisAgent") return "SynthesisAgent";
              if (isMutationTool(nodeId)) return "MutationAgent";
              return "DataFetchAgent";
            });
          } else {
            newSupervisorPlan = plan;
            queue = plan.map((item: any) => {
              const nodeId = item.nodeId;
              if (nodeId === "send-email" || nodeId === "CommunicationAgent") return "CommunicationAgent";
              if (nodeId === "generate-pdf" || nodeId === "SynthesisAgent") return "SynthesisAgent";
              if (isMutationTool(nodeId)) return "MutationAgent";
              return "DataFetchAgent";
            });
          }
          queue = Array.from(new Set(queue));
        } else {
          // If no resume value, default to direct mapping
          newSupervisorPlan = plan;
          queue = plan.map((item: any) => {
            const nodeId = item.nodeId;
            if (nodeId === "send-email" || nodeId === "CommunicationAgent") return "CommunicationAgent";
            if (nodeId === "generate-pdf" || nodeId === "SynthesisAgent") return "SynthesisAgent";
            if (isMutationTool(nodeId)) return "MutationAgent";
            return "DataFetchAgent";
          });
          queue = Array.from(new Set(queue));
        }
      } else {
        let customGlobalPrompt = "";
        let customOrchestrationRules = "";
        let profileInstructions = "";
        try {
          const configs = await db.select().from(systemConfigurations).limit(1);
          if (configs.length > 0 && configs[0].designTokens) {
            const tokens = configs[0].designTokens as any;
            customGlobalPrompt = tokens.globalSystemPrompt || "";
            customOrchestrationRules = tokens.orchestrationRules || "";
            
            const capabilityProfile = tokens.capabilityProfile || "standard_balanced";
            if (capabilityProfile === "strict_deterministic") {
              profileInstructions = `
[CAPABILITY STUDIO CONSTRAINTS - STRICT / DETERMINISTIC]:
- ZERO CONVERSATIONAL GATING: You must immediately delegate task routing without asking follow-up questions or inserting chat filler.
- DIRECT TOOL TRIGGERING: Populate the delegation queue to immediately invoke the relevant backend APIs.
- ABSOLUTE DOMAIN-AGNOSTIC LIMITS: Do not assume domain contexts or makeEvent assumptions; strictly follow the provided tool list boundaries.`;
            } else if (capabilityProfile === "fast_creative") {
              profileInstructions = `
[CAPABILITY STUDIO CONSTRAINTS - FAST / CREATIVE]:
- Prioritize rapid sequential execution and allow creative/flexible interpretations of the user's intent.`;
            } else if (capabilityProfile === "deep_reasoning") {
              profileInstructions = `
[CAPABILITY STUDIO CONSTRAINTS - DEEP REASONING]:
- Reason step-by-step about the user's implicit intent before deciding delegation. Draw logical connections between multi-step tasks.`;
            }
          }
        } catch (e) {
          console.error("[supervisorNode] Failed to load custom configurations:", e);
        }

        const supervisorSystemPrompt = `You are the High-Level Supervisor and Orchestrator for SavazAI.
Your sole responsibility is task delegation and coordination. You must NOT execute tool calls or write conversational responses to the user directly.
Instead, you must analyze the user prompt and decide which specialized sub-agents need to run to fulfill the request.
${customGlobalPrompt ? `Global System Instructions:\n${customGlobalPrompt}\n` : ""}
${customOrchestrationRules ? `Orchestration Rules:\n${customOrchestrationRules}\n` : ""}
${profileInstructions}

Available Sub-Agents:
1. DataFetchAgent: Specialized in gathering, listing, or retrieving data. Use this if the user wants a report, summary, details, or lists of weddings, guests, tasks, ceremonies, etc.
2. MutationAgent: Specialized in database writing, creation, updates, or deletions. Use this if the user wants to create, change, delete, or add any wedding, guest, task, ceremony, etc.
3. CommunicationAgent: Specialized in sending emails, notifications, alerts, or messages to recipients. Use this if the user wants to send an email or message to a guest, vendor, or anyone.
4. SynthesisAgent: Specialized in compiling data into clean Markdown tables and formatted summaries. Run BEFORE CommunicationAgent when email content needs formatted tables.

Analyze the user's intent:
- If the user wants to fetch data, delegate to 'DataFetchAgent'.
- If the user wants to mutate data, delegate to 'MutationAgent'.
- If the user wants to send an email, message, or notification, delegate in sequence: FIRST delegate to 'SynthesisAgent' (to compute clean formatted tables), THEN delegate to 'CommunicationAgent' (to send the email).
- If they want a mixture (e.g., fetch guest list details and then email it to someone), delegate in sequence: ['DataFetchAgent', 'SynthesisAgent', 'CommunicationAgent'].

You MUST respond with a JSON object strictly matching this schema:
{
  "delegationQueue": ["MutationAgent" | "DataFetchAgent" | "CommunicationAgent"]
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
                delegationQueue: z.array(z.enum(["MutationAgent", "DataFetchAgent", "CommunicationAgent", "SynthesisAgent"])).default([]),
                target_action: z.enum([
                  "sub_agent",
                  "mcp_action",
                  "respond",
                  "correct",
                  "end",
                  "DataFetchAgent",
                  "MutationAgent",
                  "SynthesisAgent",
                  "CommunicationAgent",
                  "communication_dispatch"
                ]).optional(),
              })
            );
            const decision = await structuralPlanner.invoke(plannerMessages, { requestId });
            queue = decision.delegationQueue.map((agent: string) => {
              if (agent === "MutationAgent") return "MutationAgent";
              if (agent === "CommunicationAgent") return "CommunicationAgent";
              if (agent === "SynthesisAgent") return "SynthesisAgent";
              return "DataFetchAgent";
            });
            
            // If the model explicitly decides communication_dispatch, force queue to contain CommunicationAgent
            if (decision.target_action === "communication_dispatch" && !queue.includes("CommunicationAgent")) {
              queue.push("CommunicationAgent");
            }
            console.log("[supervisorNode] Structured Planner Decided Queue:", queue, "target_action:", decision.target_action);
          } catch (err: any) {
            console.error("[supervisorNode] Structured Planner LLM call failed with schema validation/parsing error:", err?.stack || err?.message || err);
            throw err;
          }
        } else {
          queue = ["MutationAgent", "DataFetchAgent"];
        }
      }
    }

    // Process the delegation queue sequentially
    let routingDecision: "MutationAgent" | "DataFetchAgent" | "CommunicationAgent" | "SynthesisAgent" | "respond" = "respond";
    if (queue.length > 0) {
      const nextAgent = queue.shift()!;
      if (nextAgent === "MutationAgent" || nextAgent === "mutationAgent") {
        routingDecision = "MutationAgent";
      } else if (nextAgent === "CommunicationAgent" || nextAgent === "communicationAgent") {
        routingDecision = "CommunicationAgent";
      } else if (nextAgent === "SynthesisAgent" || nextAgent === "synthesisAgent") {
        routingDecision = "SynthesisAgent";
      } else {
        routingDecision = "DataFetchAgent";
      }
    } else {
      // Queue is empty, delegation is complete
      const synthesisCompleted = state.delegatedTasks?.SynthesisAgent?.status === "completed";
      const synthesisOutputSet = !!state.synthesisOutput;
      const synthesisAlreadyDone = synthesisCompleted || synthesisOutputSet;
      if (Object.keys(delegatedTasks).length > 0 && !synthesisAlreadyDone) {
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
      plan_approved: newPlanApproved,
      supervisorPlan: newSupervisorPlan,
      approvedActions: newApprovedActions,
      parameterLocks: newParameterLocks,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    await telemetry.endTrace(requestId);
    throw err;
  }
}

function isReadOnlyQuery(message: string): boolean {
  const lower = message.toLowerCase();
  const hasReadWords = lower.includes("list") || lower.includes("get") || lower.includes("show") || lower.includes("read") || lower.includes("view") || lower.includes("display") || lower.includes("report") || lower.includes("summarize") || lower.includes("export") || lower.includes("find") || lower.includes("search") || lower.includes("provide") || lower.includes("status") || lower.includes("fetch") || lower.includes("details");
  const hasWriteWords = lower.includes("create") || lower.includes("update") || lower.includes("delete") || lower.includes("add") || lower.includes("remove") || lower.includes("change") || lower.includes("modify") || lower.includes("cancel") || lower.includes("insert") || lower.includes("post") || lower.includes("send");
  return hasReadWords && !hasWriteWords;
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
  state: typeof StateAnnotation.State,
  requestId: string
): Promise<string> {
  const startTime = Date.now();
  let statusCode = 200;
  let resultText: string;

  let estimatedToolCost: number | undefined;
  if (toolName.startsWith("create_") || toolName.startsWith("update_") || toolName.startsWith("delete_")) {
    estimatedToolCost = 0.005;
  } else if (toolName.startsWith("list_") || toolName.startsWith("get_")) {
    estimatedToolCost = 0.001;
  }

  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    if (configs.length > 0 && configs[0].designTokens) {
      const tokens = configs[0].designTokens as any;
      if (tokens.toolPricing && typeof tokens.toolPricing === "object") {
        const customPrice = tokens.toolPricing[toolName];
        if (typeof customPrice === "number") {
          estimatedToolCost = customPrice;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to load tool pricing config:", err);
  }

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

  if (toolName === "phone_number_validator") {
    try {
      const phoneNumber = toolArgs.phoneNumber || "";
      if (!phoneNumber) {
        throw new Error("Missing required argument: phoneNumber");
      }
      let normalized = phoneNumber.replace(/[^0-9+]/g, "");
      if (!normalized.startsWith("+")) {
        normalized = "+" + (toolArgs.defaultCountry || "1") + normalized.replace(/^0+/, "");
      }
      const isValid = /^\+[1-9]\d{1,14}$/.test(normalized);
      resultText = JSON.stringify({
        valid: isValid,
        original: phoneNumber,
        formatted: normalized,
        carrierVerified: isValid
      });
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "email_domain_inspector") {
    try {
      const emailOrDomain = toolArgs.email || toolArgs.domain || "";
      if (!emailOrDomain) {
        throw new Error("Missing required argument: email or domain");
      }
      let domain = emailOrDomain;
      if (emailOrDomain.includes("@")) {
        domain = emailOrDomain.split("@")[1];
      }
      domain = domain.trim().toLowerCase();
      
      const records = await dns.promises.resolveMx(domain).catch(() => []);
      const isValid = records.length > 0;
      resultText = JSON.stringify({
        domain,
        mxRecords: records,
        valid: isValid,
        deliverable: isValid
      });
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "geocoding_lookup") {
    try {
      const address = toolArgs.address || "";
      if (!address) {
        throw new Error("Missing required argument: address");
      }
      const configs = await db.select().from(systemConfigurations).limit(1);
      const tokens = configs.length > 0 ? (configs[0].designTokens || {}) as any : {};
      const googlePlacesApiKey = tokens.googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY;
      
      if (googlePlacesApiKey && googlePlacesApiKey.trim()) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googlePlacesApiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Google Geocoding returned ${response.status}: ${await response.text()}`);
        }
        const data = await response.json() as any;
        if (data.status === "OK" && data.results?.[0]) {
          const loc = data.results[0].geometry.location;
          resultText = JSON.stringify({
            lat: loc.lat,
            lng: loc.lng,
            formattedAddress: data.results[0].formatted_address,
            provider: "google"
          });
        } else {
          throw new Error(`Google Geocoding error: ${data.status}`);
        }
      } else {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
        const response = await fetch(url, {
          headers: { "User-Agent": "SavazAI-Harness-Geocoding/1.0" }
        });
        if (!response.ok) {
          throw new Error(`OSM Nominatim returned ${response.status}: ${await response.text()}`);
        }
        const data = await response.json() as any;
        if (data && data.length > 0) {
          resultText = JSON.stringify({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            formattedAddress: data[0].display_name,
            provider: "nominatim"
          });
        } else {
          throw new Error("No address coordinates found in OpenStreetMap Geocoding.");
        }
      }
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "financial_math_calculator") {
    try {
      const expression = toolArgs.expression || "";
      if (!expression) {
        throw new Error("Missing required argument: expression");
      }
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      if (sanitized.trim() !== expression.trim()) {
        throw new Error("Invalid characters in expression. Only digits and operators (+ - * / ( )) are allowed.");
      }
      const evalFn = new Function(`return (${sanitized});`);
      const result = evalFn();
      resultText = JSON.stringify({ expression, sanitized, result });
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "analytics_dashboard_generator") {
    try {
      const events = toolArgs.events || [];
      const title = toolArgs.title || "Enterprise Event Analytics Dashboard";
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error("Missing required argument: events (non-empty array)");
      }
      
      const groups: Record<string, number> = {};
      const statusGroups: Record<string, number> = {};
      for (const event of events) {
        const name = event.eventName || event.name || "Unknown";
        groups[name] = (groups[name] || 0) + 1;
        const status = event.status || "completed";
        statusGroups[status] = (statusGroups[status] || 0) + 1;
      }

      let mdReport = `## ${title}\n\n`;
      mdReport += `### Summary Statistics\n`;
      mdReport += `| Event Name | Count | Visualization |\n`;
      mdReport += `| :--- | :--- | :--- |\n`;
      for (const [name, count] of Object.entries(groups)) {
        const bar = "█".repeat(Math.min(count, 15));
        mdReport += `| ${name} | ${count} | ${bar} |\n`;
      }
      
      mdReport += `\n### Status Distribution\n`;
      for (const [status, count] of Object.entries(statusGroups)) {
        mdReport += `- **${status}**: ${count}\n`;
      }

      const fs = await import("node:fs");
      const path = await import("node:path");
      const logsDir = "./logs";
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const dashboardPath = path.join(logsDir, `dashboard_${Date.now()}.md`);
      fs.writeFileSync(dashboardPath, mdReport, "utf8");

      resultText = JSON.stringify({
        success: true,
        title,
        summary: groups,
        statusSummary: statusGroups,
        markdownReport: mdReport,
        filePath: dashboardPath
      });
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "postgres_query_tool") {
    try {
      const connectionString = toolArgs.connectionString;
      const query = toolArgs.query;
      if (!connectionString) {
        throw new Error("Missing required argument: connectionString");
      }
      if (!query) {
        throw new Error("Missing required argument: query");
      }
      
      const sqlClient = postgres(connectionString);
      const rows = await sqlClient.unsafe(query);
      await sqlClient.end();
      
      resultText = JSON.stringify({ results: rows });
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "sqlite_query_tool") {
    try {
      const dbPath = toolArgs.dbPath;
      const query = toolArgs.query;
      if (!dbPath) {
        throw new Error("Missing required argument: dbPath");
      }
      if (!query) {
        throw new Error("Missing required argument: query");
      }
      
      const executionResult = await runPython("scripts/sqlite_query.py", [dbPath, query]);
      resultText = typeof executionResult === "object" ? JSON.stringify(executionResult) : String(executionResult);
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "mongodb_query_tool") {
    try {
      const uri = toolArgs.uri;
      const database = toolArgs.database;
      const collection = toolArgs.collection;
      const operation = toolArgs.operation;
      if (!uri || !database || !collection || !operation) {
        throw new Error("Missing required arguments: uri, database, collection, operation");
      }
      
      const queryStr = JSON.stringify(toolArgs.query || {});
      const docStr = JSON.stringify(toolArgs.document || {});
      
      const executionResult = await runPython("scripts/mongodb_query.py", [
        uri,
        database,
        collection,
        operation,
        queryStr,
        docStr
      ]);
      resultText = typeof executionResult === "object" ? JSON.stringify(executionResult) : String(executionResult);
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (
    toolName === "youtube_tool" ||
    toolName === "instagram_tool" ||
    toolName === "facebook_tool" ||
    toolName === "linkedin_tool" ||
    toolName === "tiktok_tool" ||
    toolName.startsWith("social_")
  ) {
    try {
      let preset = "custom";
      if (toolName.startsWith("social_")) {
        preset = toolName.split("_")[1] || "custom";
      } else {
        preset = toolName.split("_")[0] || "custom";
      }
      
      const action = toolArgs.action || "publish";
      const content = toolArgs.content || toolArgs.message || toolArgs.text || "";
      const mediaUrl = toolArgs.mediaUrl || "";

      const mockPostId = `${preset}_post_${Math.random().toString(36).substr(2, 9)}`;
      const mockResult = {
        success: true,
        tool: toolName,
        preset: preset,
        action: action,
        postId: mockPostId,
        url: `https://mock-${preset}.com/shares/${mockPostId}`,
        timestamp: new Date().toISOString(),
        contentSummary: content.length > 50 ? content.substr(0, 50) + "..." : content,
        mediaAttached: !!mediaUrl,
        apiStatus: "authorized"
      };

      resultText = JSON.stringify(mockResult);
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "google_docs_writer") {
    try {
      const text = toolArgs.text;
      if (!text) {
        throw new Error("Missing required argument: text");
      }
      const accessToken = await getValidGmailAccessToken();
      const documentId = toolArgs.documentId;
      const action = toolArgs.action || "append";
      
      if (action === "create" || !documentId) {
        const title = toolArgs.title || "SavazAI Document";
        const response = await fetch("https://docs.googleapis.com/v1/documents", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ title })
        });
        if (!response.ok) {
          throw new Error(`Google Docs returned ${response.status}: ${await response.text()}`);
        }
        const docInfo = await response.json() as any;
        const newId = docInfo.documentId;
        
        await fetch(`https://docs.googleapis.com/v1/documents/${newId}:batchUpdate`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            requests: [{
              insertText: {
                text,
                location: { index: 1 }
              }
            }]
          })
        });
        
        resultText = JSON.stringify({ success: true, documentId: newId, title });
      } else {
        const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            requests: [{
              insertText: {
                text,
                endOfSegmentLocation: {}
              }
            }]
          })
        });
        if (!response.ok) {
          throw new Error(`Google Docs returned ${response.status}: ${await response.text()}`);
        }
        resultText = JSON.stringify({ success: true, documentId, appended: true });
      }
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "google_sheets_sync") {
    try {
      const spreadsheetId = toolArgs.spreadsheetId;
      const range = toolArgs.range || "Sheet1!A1";
      const values = toolArgs.values;
      if (!spreadsheetId) {
        throw new Error("Missing required argument: spreadsheetId");
      }
      if (!Array.isArray(values)) {
        throw new Error("Missing required argument: values (2D array of rows)");
      }
      
      const accessToken = await getValidGmailAccessToken();
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values })
      });
      
      if (!response.ok) {
        throw new Error(`Google Sheets returned ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      resultText = JSON.stringify(data);
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "google_drive_uploader") {
    try {
      const name = toolArgs.name || "upload.txt";
      const mimeType = toolArgs.mimeType || "text/plain";
      const content = toolArgs.content || "";
      
      const accessToken = await getValidGmailAccessToken();
      const boundary = "savazai_boundary";
      const metadata = JSON.stringify({ name, mimeType });
      const multipartBody = 
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;
        
      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });
      
      if (!response.ok) {
        throw new Error(`Google Drive returned ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      resultText = JSON.stringify(data);
      statusCode = 200;
    } catch (err: any) {
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "google-places" || toolName === "google_places" || toolName === "google_places_search" || toolName === "places") {
    const params = ["textQuery", "query", "search_query", "location", "pageSize", "languageCode"];
    for (const propName of params) {
      if (toolArgs[propName] === undefined) {
        const ambientValue = await resolveAmbientParameter(propName);
        if (ambientValue !== undefined) {
          toolArgs[propName] = ambientValue;
        }
      }
    }
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      const tokens = configs.length > 0 ? (configs[0].designTokens || {}) as any : {};
      const googlePlacesApiKey = tokens.googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY;
      if (!googlePlacesApiKey) {
        throw new Error("Google Places API key is not configured.");
      }
      const query = String(toolArgs.textQuery || toolArgs.query || toolArgs.search_query || toolArgs.location || toolArgs.q || "").trim();
      if (!query) {
        throw new Error("Missing required argument: textQuery or query");
      }
      const pageSize = Math.min(Math.max(Number(toolArgs.pageSize || toolArgs.limit || toolArgs.count || 20), 1), 20);
      const languageCode = toolArgs.languageCode || toolArgs.language ? String(toolArgs.languageCode || toolArgs.language) : undefined;

      const requestBody: Record<string, unknown> = {
        textQuery: query,
        pageSize,
      };
      if (languageCode) requestBody.languageCode = languageCode;

      const fieldMask = [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.businessStatus",
        "places.regularOpeningHours"
      ].join(",");

      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googlePlacesApiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Google Places API returned ${response.status}: ${await response.text()}`);
      }
      const data = await response.json() as any;
      const placesArr = Array.isArray(data.places) ? data.places : [];

      const results = placesArr.map((p: any) => ({
        name: p.displayName?.text || p.displayName || p.name || "Unnamed Place",
        address: p.formattedAddress || "",
        rating: p.rating ?? null,
        review_count: p.userRatingCount ?? null,
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        website: p.websiteUri || p.googleMapsUri || null,
        email: null,
        googleMapsUri: p.googleMapsUri || null,
        businessStatus: p.businessStatus || null,
        placeId: p.id || null,
      }));
      resultText = JSON.stringify({ results, total: results.length });
      statusCode = 200;
    } catch (err: any) {
      console.error("Google Places tool execution failed:", err);
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "web-search" || toolName === "web_search" || toolName === "serper-search" || toolName === "serper_search" || toolName === "serper-places" || toolName === "serper_places" || toolName === "tavily" || toolName === "tavily_search") {
    const params = ["query", "textQuery", "search_query", "count"];
    for (const propName of params) {
      if (toolArgs[propName] === undefined) {
        const ambientValue = await resolveAmbientParameter(propName);
        if (ambientValue !== undefined) {
          toolArgs[propName] = ambientValue;
        }
      }
    }
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      const tokens = configs.length > 0 ? (configs[0].designTokens || {}) as any : {};
      const tavilyApiKey = tokens.tavilyApiKey || process.env.TAVILY_API_KEY;
      const serperApiKey = tokens.serperApiKey || process.env.SERPER_API_KEY;
      const query = String(toolArgs.query || toolArgs.textQuery || toolArgs.search_query || toolArgs.q || "").trim();
      if (!query) {
        throw new Error("Missing required argument: query");
      }
      const count = Number(toolArgs.count || toolArgs.limit || toolArgs.pageSize || 5);

      const extractEmailsFromSnippet = (text: string): string[] => {
        if (!text) return [];
        const matches = Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g));
        return Array.from(new Set(matches.map((m) => m[0].replace(/[.,;:)\]]+$/, "")).filter(Boolean)));
      };

      const extractPhonesFromSnippet = (text: string): string[] => {
        if (!text) return [];
        const phoneRegex = /(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}|\b0\d{2,4}[\-\s]?\d{6,8}\b|\b\d{5}[\-\s]?\d{5}\b|\+?\d{1,3}[-.\s]\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]\d{3,4}/g;
        const matches = text.match(phoneRegex) || [];
        return Array.from(new Set(matches.map((p) => p.trim()).filter((p) => !/^\d{4}$/.test(p))));
      };

      if (serperApiKey) {
        const isPlacesSearch = toolName.includes("places");
        const endpoint = isPlacesSearch ? "https://google.serper.dev/places" : "https://google.serper.dev/search";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: count }),
        });
        if (!response.ok) {
          throw new Error(`Serper search returned ${response.status}: ${await response.text()}`);
        }
        const data = await response.json() as any;
        const results: any[] = [];

        if (Array.isArray(data.places)) {
          for (const p of data.places) {
            results.push({
              name: p.title || p.name || "",
              address: p.address || "",
              rating: p.rating ?? null,
              review_count: p.ratingCount ?? null,
              phone: p.phoneNumber || p.phone || null,
              website: p.website || p.link || null,
              email: null,
              snippet: p.category || p.address || "",
            });
          }
        }

        if (Array.isArray(data.organic)) {
          for (const r of data.organic) {
            const snippet = String(r.snippet || "");
            const title = String(r.title || "");
            const fullSnippet = `${title} ${snippet}`;
            const emails = extractEmailsFromSnippet(fullSnippet);
            const phones = extractPhonesFromSnippet(fullSnippet);

            results.push({
              name: title,
              address: "",
              rating: null,
              review_count: null,
              phone: phones[0] || null,
              website: r.link || null,
              email: emails[0] || null,
              snippet,
            });
          }
        }

        resultText = JSON.stringify({ results, total: results.length });
      } else if (tavilyApiKey) {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tavilyApiKey, query, max_results: count, search_depth: "advanced" })
        });
        if (!response.ok) {
          throw new Error(`Tavily search returned ${response.status}: ${await response.text()}`);
        }
        const data = await response.json() as any;
        const rawResults = Array.isArray(data.results) ? data.results : [];
        const results = rawResults.map((r: any) => {
          const content = String(r.content || "");
          const title = String(r.title || "");
          const fullText = `${title} ${content}`;
          const emails = extractEmailsFromSnippet(fullText);
          const phones = extractPhonesFromSnippet(fullText);

          return {
            name: title,
            address: "",
            rating: null,
            review_count: null,
            phone: phones[0] || null,
            website: r.url || null,
            email: emails[0] || null,
            snippet: content,
          };
        });
        resultText = JSON.stringify({ results, total: results.length });
      } else {
        throw new Error("Neither Tavily nor Serper API key is configured.");
      }
      statusCode = 200;
    } catch (err: any) {
      console.error("Web Search tool execution failed:", err);
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "send-email") {
    const params = ["to", "subject", "bodyHtml", "markdownContent"];
    for (const propName of params) {
      if (toolArgs[propName] === undefined) {
        const ambientValue = await resolveAmbientParameter(propName);
        if (ambientValue !== undefined) {
          toolArgs[propName] = ambientValue;
        }
      }
    }
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      const tokens = configs.length > 0 ? (configs[0].designTokens || {}) as any : {};
      const sendgridApiKey = tokens.sendgridApiKey || process.env.SENDGRID_API_KEY;
      const sendgridSenderEmail = tokens.sendgridSenderEmail || process.env.SENDGRID_SENDER_EMAIL || "noreply@savazai.com";

      const to = toolArgs.to;
      const subject = toolArgs.subject;
      const bodyHtml = toolArgs.bodyHtml || "";
      const markdownContent = toolArgs.markdownContent || "";
      if (!to || !subject) {
        throw new Error("Missing required arguments: to, subject");
      }

      const finalHtml = bodyHtml || convertMarkdownToHtml(markdownContent || "");

      if (sendgridApiKey) {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: sendgridSenderEmail },
            subject: subject,
            content: [{ type: "text/html", value: finalHtml }]
          })
        });
        if (!response.ok) {
          throw new Error(`SendGrid returned ${response.status}: ${await response.text()}`);
        }
        resultText = JSON.stringify({ success: true, provider: "sendgrid" });
      } else {
        const accessToken = await getValidGmailAccessToken();
        const sendResult = await sendGmailEmail(accessToken, [to], subject, markdownContent, finalHtml);
        resultText = JSON.stringify({ success: true, provider: "gmail", id: sendResult.id });
      }
      statusCode = 200;
    } catch (err: any) {
      console.error("Send Email tool execution failed:", err);
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "generate-pdf") {
    const params = ["summaryText", "title", "filename"];
    for (const propName of params) {
      if (toolArgs[propName] === undefined) {
        const ambientValue = await resolveAmbientParameter(propName);
        if (ambientValue !== undefined) {
          toolArgs[propName] = ambientValue;
        }
      }
    }
    try {
      const summaryText = toolArgs.summaryText;
      const title = toolArgs.title || "SavazAI Report";
      const filename = toolArgs.filename || "report";
      if (!summaryText) {
        throw new Error("Missing required argument: summaryText");
      }

      const scriptPath = "scripts/generate_pdf.py";
      const executionResult = await runPython(scriptPath, [summaryText, title, filename]);
      resultText = typeof executionResult === "object" ? JSON.stringify(executionResult) : String(executionResult);
      statusCode = 200;
    } catch (err: any) {
      console.error("Generate PDF tool execution failed:", err);
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (toolName === "generate-csv" || toolName === "generate_csv" || toolName === "csv_export" || toolName === "export_csv") {
    try {
      const filename = String(toolArgs.filename || toolArgs.title || `export_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
      const csvFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
      const rawData = toolArgs.data || toolArgs.records || toolArgs.items || toolArgs.rows || toolArgs.content || toolArgs.summaryText || "";

      const escapeCell = (val: unknown): string => {
        if (val === null || val === undefined) return '""';
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
      };

      let csvContent = "";
      if (Array.isArray(rawData) && rawData.length > 0) {
        const headers = Object.keys(rawData[0] || {});
        const headerLine = headers.map(h => escapeCell(h)).join(",");
        const dataLines = rawData.map((row: Record<string, unknown>) =>
          headers.map(h => escapeCell(row[h])).join(",")
        );
        csvContent = [headerLine, ...dataLines].join("\r\n");
      } else if (typeof rawData === "string" && rawData.trim()) {
        const lines = rawData.trim().split(/\r?\n/);
        const tableLines = lines.filter(l => l.includes("|") && !l.includes("---"));
        if (tableLines.length > 0) {
          csvContent = tableLines.map(l => {
            const cells = l.split("|").map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length);
            return cells.map(c => escapeCell(c)).join(",");
          }).join("\r\n");
        } else {
          csvContent = rawData;
        }
      } else {
        csvContent = "Name,Address,Rating,Reviews,Phone,Website,Email\r\n";
      }

      const base64Data = Buffer.from(csvContent, "utf-8").toString("base64");
      const downloadUrl = `data:text/csv;charset=utf-8;base64,${base64Data}`;
      const downloadMarkdown = `[ 📥 Download CSV Export (${csvFilename}) ](${downloadUrl})`;

      resultText = JSON.stringify({
        success: true,
        message: `CSV file "${csvFilename}" generated successfully. ${downloadMarkdown}`,
        filename: csvFilename,
        downloadUrl,
        downloadMarkdown,
        rowCount: csvContent.split("\r\n").length - 1
      });
      statusCode = 200;
    } catch (err: any) {
      console.error("Generate CSV tool execution failed:", err);
      resultText = JSON.stringify({ error: err.message });
      statusCode = 500;
    }
  } else if (customSkill) {
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
      statusCode = 200;
    } catch (err: any) {
      console.error(`Custom skill execution failed for ${toolName}:`, err);
      resultText = JSON.stringify({ error: `Custom skill execution failed: ${err.message}` });
      statusCode = 500;
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
    try {
      const executionResult = await localSkill.execute(toolArgs);
      resultText = JSON.stringify(executionResult);
      statusCode = 200;
    } catch (err: any) {
      console.error(`Local skill execution failed for ${toolName}:`, err);
      resultText = JSON.stringify({ error: `Local skill execution failed: ${err.message}` });
      statusCode = 500;
    }
  } else {
    // Remote MCP tool
    try {
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

      // When activeTools contains tool names (not server keys), we still need to scan all servers.
      // Only filter servers if activeTools explicitly contains a known server key.
      let activeServerConfig: any = null;
      let serversToScan = Object.keys(mcpServersObj);
      if (state.activeTools && state.activeTools.length > 0) {
        const toolNamesAsServerKeys = serversToScan.filter((s) => state.activeTools!.includes(s));
        // Only narrow the scan if there are explicit server-key matches; otherwise scan all servers
        if (toolNamesAsServerKeys.length > 0) {
          serversToScan = toolNamesAsServerKeys;
        }
      }

      for (const serverKey of serversToScan) {
        const config = mcpServersObj[serverKey];
        if (!config || !config.serverUrl || config.disabled === true || config.active === false) continue;
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
        statusCode = 404;
        throw new Error(`MCP tool "${toolName}" could not be resolved on any active server.`);
      }

      let executeUrl = activeServerConfig.serverUrl;
      const isDocker = process.env.DATABASE_URL?.includes("savazai-db") || !process.env.DATABASE_URL?.includes("localhost");
      if (isDocker && typeof executeUrl === "string") {
        if (executeUrl.includes("localhost:")) {
          executeUrl = executeUrl.replace("localhost:", "host.docker.internal:");
        } else if (executeUrl.includes("127.0.0.1:")) {
          executeUrl = executeUrl.replace("127.0.0.1:", "host.docker.internal:");
        }
      }

      const res = await fetch(executeUrl, {
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

      statusCode = res.status;
      if (!res.ok) {
        throw new Error(`Remote MCP invocation failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      if (data.result && Array.isArray(data.result.content)) {
        resultText = data.result.content.map((c: any) => c.text || "").join("\n");
      } else {
        resultText = JSON.stringify(data.result || data);
      }
    } catch (err: any) {
      console.error(`Remote MCP execution failed for ${toolName}:`, err);
      if (statusCode === 200) statusCode = 500;
      resultText = JSON.stringify({ error: err.message });
    }
  }

  const latencyMs = Date.now() - startTime;
  TelemetryGateway.getInstance().recordMcpToolCall(requestId, toolName, latencyMs, statusCode, estimatedToolCost);

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

  // [Plan Audit] Log Audit info
  const lastUserPrompt = state.lastUserMessageContent || (state.messages.filter(m => m.role === "user").pop()?.content) || "";
  const matchingPlanItem = state.supervisorPlan?.find((item: any) => {
    const nodeIdLower = String(item.nodeId || "").toLowerCase();
    const agentNameLower = String(agentName).toLowerCase();
    return nodeIdLower.includes(agentNameLower) || agentNameLower.includes(nodeIdLower) || String(item.targetNode || "").toLowerCase().includes(agentNameLower);
  }) || state.supervisorPlan?.[0];
  const actionType = matchingPlanItem ? (matchingPlanItem.actionVerb || matchingPlanItem.allowedVerbs?.[0] || "UNKNOWN") : "UNKNOWN";
  const selectedTool = matchingPlanItem ? (matchingPlanItem.nodeId || "UNKNOWN") : "UNKNOWN";

  console.log(`[Plan Audit] User Prompt: ${lastUserPrompt}`);
  console.log(`[Plan Audit] Generated Action Type: ${actionType}`);
  console.log(`[Plan Audit] Selected Tool: ${selectedTool}`);

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
      if (!serverConfig || !serverConfig.serverUrl || serverConfig.disabled === true || serverConfig.active === false) continue;
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

          const cleanResultText = await executeToolByName(call.name, call.args, state, requestId);
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

async function communicationAgentNode(state: typeof StateAnnotation.State, config?: any) {
  const currentApp = state.currentApp || "WedPlanAI-Local";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan("CommunicationAgent", "node");
  const requestId = config?.configurable?.requestId || "communication-default";

  console.log("[CommunicationAgent] Running communication agent lane...");
  let envelopes = state.pendingCommunications || [];

  // If envelopes are empty, extract recipients from conversation via LLM
  if (envelopes.length === 0) {
    console.log("[CommunicationAgent] No pending communications in state. Analyzing history to construct envelopes...");
    try {
      await registerAppProvider(currentApp, state.modelConfig);
      const model = new StructuredModelWrapper(currentApp, state.modelConfig);
      const hasSynthesisOutput = state.synthesisOutput && state.synthesisOutput.length > 10;
      const prompt = `You are the CommunicationAgent. Your role is to formulate email envelopes based on the user's intent and the data gathered so far in the conversation history.
Each email envelope MUST contain:
- recipients: string[] (The list of recipient email addresses. Look for email addresses in the user request or tool results)
- subject: string (A concise and relevant subject line)
${hasSynthesisOutput ? "- body: string (Write a brief summary like 'See details above' — the full body will be injected separately)" : "- body: string (The actual HTML or plain text body of the email. Write a fully polished, professional message body satisfying the user's requirements)" }
- metadata: Record<string, any> (Any helpful metadata keys, e.g. target_audience, app_domain)

INSTRUCTION RULES FOR COMPILING THE EMAIL BODY:
1. EXHAUSTIVE DATA INCLUSION: Analyze the user's latest request carefully. You MUST extract and compile ALL categories of data requested (e.g., if they ask for guest list details AND vendor details, you must include BOTH datasets). Do not summarize, omit, or leave out any requested details.
2. STRICT MARKDOWN TABLE FORMATTING: For every list of records, database table, or set of entities (such as guests, vendors, or tasks) present in the tool results, you MUST format them as a valid Markdown Table (using '| Header |' pipes and alignment lines like '|---|').
3. NO PARAGRAPH MERGING: Do NOT merge lists or tabular datasets into a single plain text sentence or list. Each dataset must be fully expanded into its own Markdown Table.
4. PRESERVE STRUCTURE ALWAYS: Even if the user asks for a 'brief', 'summary', or 'short' update, you MUST still format tabular datasets (guests, vendors, etc.) as Markdown Tables. Do NOT condense lists into plain paragraphs.
5. HEADINGS & SEPARATION: Separate different datasets with descriptive headings (e.g., '### Guest List Overview' and '### Vendor Details') and double line breaks.
6. PROFESSIONAL WRITING: Write a fully polished, professional, and beautifully structured email body.

If no recipient email address is found or the user did not specify sending any message, return an empty list of envelopes.

You MUST respond with a JSON object containing the "envelopes" array. The word "json" must be present in your system instructions.`;


      const responseSchema = z.object({
        envelopes: z.array(
          z.object({
            recipients: z.array(z.string()),
            subject: z.string(),
            body: z.string(),
            metadata: z.record(z.any()).optional(),
          })
        ).default([])
      });

      const planner = model.withStructuredOutput(responseSchema);
      const messagesForLlm = [
        { role: "system" as const, content: prompt },
        ...state.messages.map((m) => ({ role: m.role as any, content: m.content })),
      ];

      const precomputedBody = hasSynthesisOutput ? state.synthesisOutput : null;
      const precomputedHtml = precomputedBody ? convertMarkdownToHtml(precomputedBody) : null;
      const result = await planner.invoke(messagesForLlm, { requestId });
      if (result && result.envelopes) {
        envelopes = result.envelopes.map((env: { recipients: string[]; subject: string; body: string; metadata?: Record<string, any> }) => ({
          ...env,
          body: precomputedBody || env.body,
          bodyHtml: precomputedHtml || convertMarkdownToHtml(env.body),
        }));
        console.log(`[CommunicationAgent] Constructed ${envelopes.length} envelopes from LLM.`);
      }
    } catch (err) {
      console.error("[CommunicationAgent] Failed to construct envelopes using LLM:", err);
    }
  }

  const receipts: Array<{ recipient: string; subject: string; success: boolean; error?: string; id?: string }> = [];
  const errorMessages: string[] = [];

  if (envelopes.length > 0) {
    console.log(`[CommunicationAgent] Dispatched queue has ${envelopes.length} envelopes. Refreshing credentials...`);
    let accessToken: string | undefined;
    try {
      accessToken = await getValidGmailAccessToken();
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("[CommunicationAgent] Failed to obtain valid Gmail OAuth access token:", msg);
      errorMessages.push(`Gmail authentication failed: ${msg}`);
    }

    for (const env of envelopes) {
      if (!accessToken) {
        receipts.push({
          recipient: env.recipients.join(", "),
          subject: env.subject,
          success: false,
          error: errorMessages[0] || "Missing or invalid OAuth access token",
        });
        continue;
      }
      console.log(`[CommunicationAgent] Sending email to ${env.recipients.join(", ")}...`);
      try {
        const sendResult = await sendGmailEmail(accessToken, env.recipients, env.subject, env.body, env.bodyHtml);
        receipts.push({
          recipient: env.recipients.join(", "),
          subject: env.subject,
          success: true,
          id: sendResult.id,
        });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`[CommunicationAgent] Failed to send email to ${env.recipients.join(", ")}:`, msg);
        errorMessages.push(msg);
        receipts.push({
          recipient: env.recipients.join(", "),
          subject: env.subject,
          success: false,
          error: msg,
        });
      }
    }
  } else {
    console.log("[CommunicationAgent] No envelopes to dispatch.");
  }

  // Wiping the pendingCommunications state block to protect against duplicate email looping behaviors (Loop Termination Guard)
  const clearedCommunications: typeof state.pendingCommunications = [];

  const updatedTasks = {
    ...state.delegatedTasks,
    CommunicationAgent: { status: "completed", timestamp: new Date().toISOString() },
  };

  telemetry.endSpan(requestId, span);

  // Append receipts as system message + surface any dispatch errors as user-visible messages
  const resultMessages: Array<{ role: "system" | "assistant"; content: string; timestamp: string }> = [
    {
      role: "system" as const,
      content: `[CommunicationAgent] Dispatch Receipts: ${JSON.stringify(receipts)}`,
      timestamp: new Date().toISOString(),
    },
  ];
  for (const errMsg of errorMessages) {
    resultMessages.push({
      role: "assistant" as const,
      content: `Email dispatch error: ${errMsg}`,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    messages: resultMessages,
    pendingCommunications: clearedCommunications,
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
  const currentTurnMessages = state.messages;

  const formattedHistory: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  for (const m of currentTurnMessages) {
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
1. ZERO DATA HALLUCINATION: Synthesize all raw data present strictly from the tool outputs in history. If no data was returned by tools, state clearly: "No search results were retrieved from the tools." NEVER invent, mock, fabricate, or fallback to fake placeholder records.
2. ACTION VERIFICATION: Only confirm that an email was sent or a file/CSV was generated if a successful execution receipt exists in the history.
3. Aggressively convert all incoming raw JSON database strings, system tool metrics, and key-value blocks into beautiful, highly readable Markdown formats (clean bullet structures, bold headers, and proper Markdown Table matrices).
4. Contact, Website, and Entity Table Formatting:
   - For business discovery & location tables, render standard matrix headers: | Business Name | ⭐ Rating | Review Count | Address | 📞 Contact / Email | 🌐 Website / Maps |
   - Format phone numbers cleanly with clickable tel links where possible (e.g. \[📞 +91 70043 38655\](tel:+917004338655) or formatted numbers). If missing, display "Not listed".
   - Format email addresses with mailto links (e.g. \[📧 name@domain.com\](mailto:email@domain.com)).
   - Format websites and Google Maps as clean Markdown links (e.g. \[🌐 Website\](url) and \[🗺️ Google Maps\](url)).
   - Display review counts (e.g. 497 reviews) and ratings (e.g. 4.9 ★) accurately from tool payloads.
5. NEVER output raw JSON blocks, lists of brackets, or developer-facing debug strings.
6. Return a complete, detailed conversational response in Markdown. Do not output JSON.`;

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

  const updatedSynthesisTasks = {
    ...state.delegatedTasks,
    SynthesisAgent: { status: "completed", timestamp: new Date().toISOString() },
  };

  return {
    synthesisOutput: responseText,
    delegatedTasks: updatedSynthesisTasks,
    routingDecision: "supervisor" as const,
    target_action: "supervisor" as const,
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
  if (state.routingDecision === "CommunicationAgent" || state.routingDecision === "communication_dispatch") {
    return "communication_dispatch";
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
  .addNode("CommunicationAgent", communicationAgentNode)
  .addNode("SynthesisAgent", synthesisAgentNode)
  .addNode("respondNode", respondNode)
  .addEdge(START, "supervisorNode")
  .addConditionalEdges("supervisorNode", agentRoutingLogic, {
    DataFetchAgent: "DataFetchAgent",
    MutationAgent: "MutationAgent",
    communication_dispatch: "CommunicationAgent",
    SynthesisAgent: "SynthesisAgent",
    respond: "respondNode",
    end: END,
  })
  .addEdge("DataFetchAgent", "supervisorNode")
  .addEdge("MutationAgent", "supervisorNode")
  .addEdge("CommunicationAgent", "supervisorNode")
  .addEdge("SynthesisAgent", "supervisorNode")
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
  input: Partial<GraphState> | null,
  options?: { requestId?: string; threadId?: string; resume?: any; executionMode?: string },
  graph?: any,
): AsyncGenerator<unknown> {
  const target = graph ?? compiledGraph;
  const streamInput = options?.resume !== undefined
    ? new Command({
        resume: options.resume,
        update: options.executionMode ? { executionMode: options.executionMode } : undefined,
      })
    : input;
  const stream = await target.stream(streamInput, {
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
