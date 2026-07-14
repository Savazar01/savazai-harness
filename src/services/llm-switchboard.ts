import { TelemetryGateway } from "../utils/telemetry.js";

export interface UniversalPayload {
  messages: { role: string; content: string }[];
  providerId: string;
  options?: Record<string, unknown>;
}

export interface UniversalResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ProviderConfig {
  providerId: string;
  type: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
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

    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 504 || res.status === 429) throw new RetryableError(`${res.status} ${body}`);
      throw new Error(`LLM ${res.status} ${body}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
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

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

    return {
      text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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
    if (existing) return existing;

    const driver = this.buildDriver(config);
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
      case "openai-compatible":
      default:
        return new OpenAICompatibleDriver(config);
    }
  }

  async executeUniversalCompletion(payload: UniversalPayload): Promise<UniversalResult> {
    const providerId = payload.providerId || "primary";
    const primary = this.configs.get(providerId) || this.configs.get("primary");
    if (!primary) throw new Error(`No provider configured for "${providerId}"`);

    const requestId = (payload.options?.requestId as string) || "global";
    const telemetry = TelemetryGateway.getInstance();
    const span = telemetry.startSpan(requestId, `llm-completion:${providerId}`);
    
    span.attributes.providerId = providerId;
    span.attributes.modelName = primary.modelName;
    span.attributes.inputMessages = JSON.stringify(payload.messages);

    try {
      const result = await this.getDriver(primary).execute(payload.messages, payload.options);
      telemetry.endSpan(requestId, span, {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        output: result.text,
      });
      return result;
    } catch (err) {
      const backup = this.configs.get("backup");
      if (backup && isRetryable(err)) {
        span.attributes.retryWithBackup = true;
        try {
          const result = await this.getDriver(backup).execute(payload.messages, payload.options);
          telemetry.endSpan(requestId, span, {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
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
