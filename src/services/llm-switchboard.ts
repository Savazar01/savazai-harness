import { TelemetryGateway } from "../utils/telemetry.js";
import { db } from "../db/index.js";
import { systemConfigurations } from "../db/schema.js";

export interface UniversalPayload {
  messages: { role: string; content: string }[];
  providerId: string;
  options?: Record<string, unknown>;
}

export interface UniversalResult {
  text: string;
  usage: { 
    promptTokens: number; 
    completionTokens: number; 
    totalTokens: number; 
    reasoningTokens?: number;
  };
  toolCalls?: Array<{ name: string; args: Record<string, any> }>;
}

export interface ProviderConfig {
  providerId: string;
  type: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  "openai": "OpenAI",
  "openai-compatible": "OpenAI Compatible",
  "anthropic": "Anthropic",
  "gemini": "Google Gemini",
  "google-vertex": "Google Vertex AI",
  "ollama": "Ollama",
  "lmstudio": "LM Studio",
  "openrouter": "OpenRouter",
};

function getProviderDisplayName(type: string): string {
  return PROVIDER_DISPLAY_NAMES[type] || type;
}

export class RetryableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "RetryableError";
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof RetryableError) return true;
  if (err instanceof Error && /timeout|rate.?limit|504|429|ETIMEDOUT|ECONNRESET/i.test(err.message)) return true;
  return false;
}

interface LLMDriver {
  execute(messages: { role: string; content: string }[], options?: Record<string, unknown>): Promise<UniversalResult>;
  bind_tools?(tools: any[]): void;
}

class OpenAICompatibleDriver implements LLMDriver {
  private baseUrl: string;
  private modelName: string;
  private apiKey: string;
  private boundTools?: any[];

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.modelName = config.modelName;
    this.apiKey = config.apiKey;
  }

  bind_tools(tools: any[]): void {
    this.boundTools = tools;
  }

  async execute(
    messages: { role: string; content: string }[],
    options?: Record<string, unknown>,
  ): Promise<UniversalResult> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { requestId, ...restOptions } = options || {};

    const bodyPayload: Record<string, any> = {
      model: this.modelName,
      messages,
      ...restOptions,
    };

    if (this.boundTools && this.boundTools.length > 0) {
      bodyPayload.tools = this.boundTools;
    }

    let res = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      
      // Fallback to json_object if json_schema is not supported by this endpoint
      if (res.status === 400 && bodyPayload.response_format?.type === "json_schema" && 
          (body.includes("json_schema") || body.includes("schema") || body.includes("format") || body.includes("type") || body.includes("parameter"))) {
        console.warn("[OpenAICompatibleDriver] Endpoint does not support json_schema response format. Falling back to json_object...");
        bodyPayload.response_format = { type: "json_object" };
        res = await fetch(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify(bodyPayload),
        });
        if (!res.ok) {
          const secondBody = await res.text().catch(() => "");
          if (res.status === 504 || res.status === 429) throw new RetryableError(`${res.status} ${secondBody}`);
          throw new Error(`LLM ${res.status} ${secondBody}`);
        }
      } else {
        if (res.status === 504 || res.status === 429) throw new RetryableError(`${res.status} ${body}`);
        throw new Error(`LLM ${res.status} ${body}`);
      }
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: any[] } }[];
      usage?: { 
        prompt_tokens?: number; 
        completion_tokens?: number; 
        total_tokens?: number;
        completion_tokens_details?: {
          reasoning_tokens?: number;
        }
      };
    };

    const nativeToolCalls = data.choices?.[0]?.message?.tool_calls;
    const toolCalls = nativeToolCalls?.map((tc: any) => {
      let parsedArgs = {};
      try {
        if (typeof tc.function?.arguments === "string") {
          parsedArgs = JSON.parse(tc.function.arguments);
        } else if (tc.function?.arguments) {
          parsedArgs = tc.function.arguments;
        } else if (tc.args) {
          parsedArgs = tc.args;
        }
      } catch (err) {
        console.error("[llm-switchboard] Error parsing native tool call arguments:", err);
      }
      return {
        name: tc.function?.name ?? tc.name ?? "",
        args: parsedArgs,
      };
    });

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      },
      toolCalls,
    };
  }
}

class OllamaDriver implements LLMDriver {
  private baseUrl: string;
  private modelName: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.modelName = config.modelName;
  }

  bind_tools(_tools: any[]): void {} // eslint-disable-line @typescript-eslint/no-unused-vars

  async execute(
    messages: { role: string; content: string }[],
    _options?: Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<UniversalResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ model: this.modelName, messages, stream: false }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 504 || res.status === 429) throw new RetryableError(`${res.status} ${body}`);
      throw new Error(`Ollama ${res.status} ${body}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    return {
      text: data.message?.content ?? "",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

class AnthropicDriver implements LLMDriver {
  private apiKey: string;
  private modelName: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.modelName = config.modelName;
  }

  bind_tools(_tools: any[]): void {} // eslint-disable-line @typescript-eslint/no-unused-vars

  async execute(
    messages: { role: string; content: string }[],
    _options?: Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<UniversalResult> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const nonSystem = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = { model: this.modelName, max_tokens: 4096, messages: nonSystem };
    if (system) body.system = system;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const b = await res.text().catch(() => "");
      if (res.status === 504 || res.status === 429) throw new RetryableError(`${res.status} ${b}`);
      throw new Error(`Anthropic ${res.status} ${b}`);
    }

    const data = (await res.json()) as {
      content?: { text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      text: data.content?.map((c) => c.text ?? "").join("") ?? "",
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  }
}

class GoogleVertexDriver implements LLMDriver {
  private baseUrl: string;
  private modelName: string;
  private apiKey: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.modelName = config.modelName;
    this.apiKey = config.apiKey;
  }

  bind_tools(_tools: any[]): void {} // eslint-disable-line @typescript-eslint/no-unused-vars

  async execute(
    messages: { role: string; content: string }[],
    _options?: Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<UniversalResult> {
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(
      `${this.baseUrl}/v1/projects/-/locations/us-central1/publishers/google/models/${this.modelName}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ contents }),
      },
    );

    if (!res.ok) {
      const b = await res.text().catch(() => "");
      if (res.status === 504 || res.status === 429) throw new RetryableError(`${res.status} ${b}`);
      throw new Error(`Vertex ${res.status} ${b}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };

    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: data.usageMetadata?.totalTokenCount ?? (promptTokens + completionTokens),
      },
    };
  }
}

export class LLMSwitchboard {
  private configs = new Map<string, ProviderConfig>();
  private drivers = new Map<string, LLMDriver>();

  constructor() {
    const primaryType = process.env.LLM_PROVIDER_TYPE || "openai-compatible";
    this.configs.set("primary", {
      providerId: "primary",
      type: primaryType,
      baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
      modelName: process.env.LLM_MODEL_NAME || "gpt-4o-mini",
      apiKey: process.env.LLM_API_KEY || "",
    });

    if (process.env.LLM_BACKUP_PROVIDER_TYPE) {
      this.configs.set("backup", {
        providerId: "backup",
        type: process.env.LLM_BACKUP_PROVIDER_TYPE,
        baseUrl: process.env.LLM_BACKUP_BASE_URL || "",
        modelName: process.env.LLM_BACKUP_MODEL_NAME || "",
        apiKey: process.env.LLM_BACKUP_API_KEY || "",
      });
    }
  }

  registerProvider(config: ProviderConfig): void {
    this.configs.set(config.providerId, config);
    this.drivers.delete(config.providerId);
  }



  private getDriver(config: ProviderConfig): LLMDriver {
    const existing = this.drivers.get(config.providerId);
    if (existing) {
      const cachedConfig = (existing as any)._config;
      if (cachedConfig && 
          cachedConfig.modelName === config.modelName && 
          cachedConfig.baseUrl === config.baseUrl && 
          cachedConfig.apiKey === config.apiKey) {
        return existing;
      }
    }

    const driver = this.buildDriver(config);
    (driver as any)._config = { ...config };
    this.drivers.set(config.providerId, driver);
    return driver;
  }

  private buildDriver(config: ProviderConfig): LLMDriver {
    switch (config.type) {
      case "anthropic":
        return new AnthropicDriver(config);
      case "google-vertex":
        return new GoogleVertexDriver(config);
      case "ollama":
        return new OllamaDriver(config);
      case "gemini": {
        let baseUrl = config.baseUrl;
        if (baseUrl.includes("generativelanguage.googleapis.com") && !baseUrl.includes("/openai")) {
          baseUrl = baseUrl.replace(/\/+$/, "");
          if (!baseUrl.endsWith("/v1beta") && !baseUrl.endsWith("/v1")) {
            baseUrl = `${baseUrl}/v1beta/openai`;
          } else {
            baseUrl = `${baseUrl}/openai`;
          }
        }
        return new OpenAICompatibleDriver({
          ...config,
          baseUrl,
        });
      }
      case "openai-compatible":
      default:
        return new OpenAICompatibleDriver(config);
    }
  }

  async executeUniversalCompletion(payload: UniversalPayload): Promise<UniversalResult> {
    const providerId = payload.providerId || "primary";
    const primary = this.configs.get(providerId) || this.configs.get("primary");
    if (!primary) throw new Error(`No provider configured for "${providerId}"`);

    const activeConfig = { ...primary };
    let temperature = 0.5;
    let maxTokens = 4096;

    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const tokens = configs[0].designTokens as any;
        const profile = tokens.capabilityProfile || "standard_balanced";

        if (profile === "fast_creative") {
          temperature = 0.8;
          maxTokens = 2048;
        } else if (profile === "strict_deterministic") {
          temperature = 0.0;
          maxTokens = 2048;
        } else if (profile === "deep_reasoning") {
          temperature = 0.2;
          maxTokens = 8192;
        }
      }
    } catch (err) {
      console.warn("[llm-switchboard] Failed to fetch capability profile configuration:", err);
    }

    const finalOptions = {
      temperature: payload.options?.temperature ?? temperature,
      max_tokens: payload.options?.max_tokens ?? maxTokens,
      ...payload.options,
    };

    const requestId = (payload.options?.requestId as string) || "global";
    const telemetry = TelemetryGateway.getInstance();
    const span = telemetry.startSpan(requestId, `llm-completion:${providerId}`);
    
    span.attributes.providerId = activeConfig.type;
    span.attributes.providerDisplayName = getProviderDisplayName(activeConfig.type);
    span.attributes.modelName = activeConfig.modelName;
    span.attributes.deploymentApp = providerId;
    span.attributes.inputMessages = JSON.stringify(payload.messages);

    try {
      const result = await this.getDriver(activeConfig).execute(payload.messages, finalOptions);
      telemetry.endSpan(requestId, span, {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        reasoningTokens: result.usage.reasoningTokens || 0,
        output: result.text,
      });
      return result;
    } catch (err) {
      const backup = this.configs.get("backup");
      if (backup && isRetryable(err)) {
        span.attributes.retryWithBackup = true;
        try {
          const activeBackup = { ...backup };
          const result = await this.getDriver(activeBackup).execute(payload.messages, finalOptions);
          telemetry.endSpan(requestId, span, {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            reasoningTokens: result.usage.reasoningTokens || 0,
            output: result.text,
            usedBackup: true,
          });
          return result;
        } catch (backupErr) {
          telemetry.endSpan(requestId, span, {
            error: backupErr instanceof Error ? backupErr.message : String(backupErr),
            failedBackup: true,
          });
          throw backupErr;
        }
      }
      telemetry.endSpan(requestId, span, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  bindToolsToProvider(providerId: string, tools: any[]): void {
    const config = this.configs.get(providerId) || this.configs.get("primary");
    if (!config) return;
    const driver = this.getDriver(config);
    if (driver && typeof driver.bind_tools === "function") {
      driver.bind_tools(tools);
    }
  }
}

export const llmSwitchboard = new LLMSwitchboard();
