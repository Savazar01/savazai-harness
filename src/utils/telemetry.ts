import { randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { db } from "../db/index.js";
import { telemetryLogs, systemConfigurations } from "../db/schema.js";

export interface TelemetrySpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, any>;
  parentId?: string;
}

export interface TraceSession {
  traceId: string;
  rootSpanId: string;
  name: string;
  spans: TelemetrySpan[];
  openSpanStack: TelemetrySpan[];
  chatId?: string;
  executedMcpTools?: { toolName: string; latencyMs: number; statusCode: number; estimatedToolCost?: number }[];
}

export interface ModelPricing {
  inputRatePerMillion: number;
  outputRatePerMillion: number;
}

export const MODEL_PRICING_REGISTRY: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputRatePerMillion: 0.15, outputRatePerMillion: 0.60 },
  "gpt-4o": { inputRatePerMillion: 2.50, outputRatePerMillion: 10.00 },
  "claude-3-5-sonnet": { inputRatePerMillion: 3.00, outputRatePerMillion: 15.00 },
  "claude-3-5-haiku": { inputRatePerMillion: 0.80, outputRatePerMillion: 4.00 },
  "gemini-1.5-pro": { inputRatePerMillion: 1.25, outputRatePerMillion: 5.00 },
  "gemini-2.5-pro": { inputRatePerMillion: 1.25, outputRatePerMillion: 5.00 },
  "gemini-1.5-flash": { inputRatePerMillion: 0.075, outputRatePerMillion: 0.30 },
  "gemini-2.5-flash": { inputRatePerMillion: 0.075, outputRatePerMillion: 0.30 },
  "gemini-2.5-flash-lite": { inputRatePerMillion: 0.075, outputRatePerMillion: 0.30 },
  "default": { inputRatePerMillion: 1.00, outputRatePerMillion: 3.00 }
};

export function getModelPricing(modelName: string, customPricing?: Record<string, ModelPricing>): ModelPricing {
  const model = modelName.toLowerCase();
  
  if (customPricing) {
    for (const [key, value] of Object.entries(customPricing)) {
      if (model.includes(key.toLowerCase())) {
        return value;
      }
    }
  }

  for (const [key, value] of Object.entries(MODEL_PRICING_REGISTRY)) {
    if (key !== "default" && model.includes(key)) {
      return value;
    }
  }

  return MODEL_PRICING_REGISTRY["default"];
}

export class TelemetryGateway {
  private static instance: TelemetryGateway | null = null;
  private activeTraces = new Map<string, TraceSession>();

  private endpoint: string | undefined;
  private publicKey: string | undefined;
  private secretKey: string | undefined;

  private constructor() {
    this.endpoint = process.env.TELEMETRY_ENDPOINT;
    this.publicKey = process.env.TELEMETRY_PUBLIC_KEY;
    this.secretKey = process.env.TELEMETRY_SECRET_KEY;
  }

  public static getInstance(): TelemetryGateway {
    if (!TelemetryGateway.instance) {
      TelemetryGateway.instance = new TelemetryGateway();
    }
    return TelemetryGateway.instance;
  }

  private generateTraceId(): string {
    return randomBytes(16).toString("hex");
  }

  private generateSpanId(): string {
    return randomBytes(8).toString("hex");
  }

  public startTrace(requestId: string, name: string, chatId?: string): TraceSession {
    const existing = this.activeTraces.get(requestId);
    if (existing) {
      if (chatId && !existing.chatId) {
        existing.chatId = chatId;
      }
      return existing;
    }

    const traceId = this.generateTraceId();
    const rootSpanId = this.generateSpanId();

    const rootSpan: TelemetrySpan = {
      id: rootSpanId,
      name,
      startTime: Date.now(),
      attributes: {},
    };

    const session: TraceSession = {
      traceId,
      rootSpanId,
      name,
      spans: [rootSpan],
      openSpanStack: [rootSpan],
      chatId,
    };

    this.activeTraces.set(requestId, session);
    return session;
  }

  public recordMcpToolCall(requestId: string, toolName: string, latencyMs: number, statusCode: number, estimatedToolCost?: number) {
    const session = this.activeTraces.get(requestId);
    if (session) {
      if (!session.executedMcpTools) {
        session.executedMcpTools = [];
      }
      session.executedMcpTools.push({ toolName, latencyMs, statusCode, estimatedToolCost });
    }
  }

  public startSpan(requestId: string, name: string): TelemetrySpan {
    let session = this.activeTraces.get(requestId);
    if (!session) {
      session = this.startTrace(requestId, "autostart-trace");
    }

    const parent = session.openSpanStack[session.openSpanStack.length - 1];
    const spanId = this.generateSpanId();

    const span: TelemetrySpan = {
      id: spanId,
      name,
      startTime: Date.now(),
      attributes: {},
      parentId: parent ? parent.id : undefined,
    };

    session.spans.push(span);
    session.openSpanStack.push(span);
    return span;
  }

  public endSpan(
    requestId: string,
    span: TelemetrySpan,
    extraAttributes?: Record<string, any>,
  ): void {
    const session = this.activeTraces.get(requestId);
    if (!session) return;

    span.endTime = Date.now();
    if (extraAttributes) {
      span.attributes = { ...span.attributes, ...extraAttributes };
    }

    const duration = span.endTime - span.startTime;
    span.attributes.duration_ms = duration;

    session.openSpanStack = session.openSpanStack.filter((s) => s.id !== span.id);

    const parent = session.openSpanStack[session.openSpanStack.length - 1];
    if (parent) {
      if (span.name.startsWith("llm-completion")) {
        parent.attributes.promptTokens = (parent.attributes.promptTokens || 0) + (span.attributes.promptTokens || 0);
        parent.attributes.completionTokens = (parent.attributes.completionTokens || 0) + (span.attributes.completionTokens || 0);
        parent.attributes.totalTokens = (parent.attributes.totalTokens || 0) + (span.attributes.totalTokens || 0);
        if (span.attributes.inputMessages) {
          parent.attributes.llmInputMessages = span.attributes.inputMessages;
        }
      }
    }
  }

  public async endTrace(requestId: string): Promise<void> {
    const session = this.activeTraces.get(requestId);
    if (!session) return;

    const now = Date.now();
    for (const span of session.openSpanStack) {
      if (!span.endTime) {
        span.endTime = now;
        span.attributes.duration_ms = now - span.startTime;
        span.attributes.completed_at_trace_end = true;
      }
    }
    session.openSpanStack = [];

    this.dispatchTrace(session, requestId).catch((err) => {
      console.warn("[telemetry] Asynchronous dispatch failed:", err);
    });

    this.activeTraces.delete(requestId);
  }

  private async dispatchTrace(session: TraceSession, requestId: string): Promise<void> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalReasoningTokens = 0;
    let primaryModel = "";
    let primaryProvider = "";

    for (const span of session.spans) {
      if (span.name.startsWith("llm-completion")) {
        totalInputTokens += span.attributes.promptTokens || 0;
        totalOutputTokens += span.attributes.completionTokens || 0;
        totalReasoningTokens += span.attributes.reasoningTokens || 0;
        if (span.attributes.modelName) {
          primaryModel = span.attributes.modelName;
        }
        if (span.attributes.providerId) {
          primaryProvider = span.attributes.providerId;
        }
      }
    }

    const normalizedProvider = (primaryProvider || "").trim().toLowerCase();
    const normalizedModel = (primaryModel || "").trim().toLowerCase();

    if (
      !normalizedProvider || normalizedProvider === "unknown" || 
      !normalizedModel || normalizedModel === "unknown" || 
      totalInputTokens === 0
    ) {
      const errorMsg = `[Telemetry Ledger Critical Error]: Missing true LLM context on write. (Provider: ${primaryProvider || "null"}, Model: ${primaryModel || "null"}, Input Tokens: ${totalInputTokens})`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const rootSpan = session.spans[0];
    const duration = rootSpan ? ((rootSpan.endTime || Date.now()) - rootSpan.startTime) : 0;
    const mcpTools = session.executedMcpTools || [];

    let customPricing: Record<string, ModelPricing> | undefined;
    try {
      const configs = await db.select().from(systemConfigurations).limit(1);
      if (configs.length > 0 && configs[0].designTokens) {
        const tokens = configs[0].designTokens as any;
        if (tokens.modelPricing) {
          customPricing = tokens.modelPricing;
        }
      }
    } catch (err) {
      console.warn("[telemetry] Failed to fetch custom model pricing from db:", err);
    }

    const pricing = getModelPricing(primaryModel, customPricing);
    const inputCost = (totalInputTokens / 1_000_000) * pricing.inputRatePerMillion;
    const outputCost = (totalOutputTokens / 1_000_000) * pricing.outputRatePerMillion;

    let totalToolCost = 0;
    for (const tool of mcpTools) {
      if (tool.estimatedToolCost) {
        totalToolCost += tool.estimatedToolCost;
      }
    }
    const cost = inputCost + outputCost + totalToolCost;

    try {
      let validatedChatId: string | null = null;
      if (session.chatId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(session.chatId)) {
          validatedChatId = session.chatId;
        }
      }

      const insertPayload = {
        chatId: validatedChatId,
        provider: primaryProvider,
        modelName: primaryModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        reasoningTokens: totalReasoningTokens,
        executionLatencyMs: duration,
        executedMcpTools: mcpTools,
        transactionCost: cost,
      };
      console.log(`[telemetry] Writing to DB: provider=${primaryProvider} model=${primaryModel} inputTokens=${totalInputTokens} outputTokens=${totalOutputTokens} reasoningTokens=${totalReasoningTokens} latencyMs=${duration}`);
      await db.insert(telemetryLogs).values(insertPayload);
      console.log(`[telemetry] Saved telemetry log to DB (Request ID: ${requestId}, Chat ID: ${validatedChatId})`);
    } catch (dbErr) {
      console.warn("[telemetry] Failed to insert trace log into DB:", dbErr);
    }

    if (!this.endpoint) {
      console.log(
        `[telemetry-local-fallback] Trace ID: ${session.traceId} (Request ID: ${requestId})\n` +
          `Spans:\n` +
          session.spans
            .map((s) => {
              const indent = s.parentId ? "  " : "";
              const parentInfo = s.parentId ? ` (Parent: ${s.parentId})` : " (Root)";
              const attrs = Object.keys(s.attributes).length > 0 ? `Attrs: ${JSON.stringify(s.attributes)}` : "";
              return `${indent}- [${s.id}] ${s.name} - Duration: ${s.attributes.duration_ms}ms${parentInfo} ${attrs}`;
            })
            .join("\n"),
      );
      return;
    }

    if (this.publicKey && this.secretKey) {
      await this.dispatchToLangfuse(session, requestId);
    } else {
      await this.dispatchToOltp(session, requestId);
    }
  }

  private async dispatchToLangfuse(session: TraceSession, requestId: string): Promise<void> {
    const endpoint = this.endpoint;
    const publicKey = this.publicKey;
    const secretKey = this.secretKey;
    if (!endpoint || !publicKey || !secretKey) return;

    const url = `${endpoint.replace(/\/+$/, "")}/api/public/ingestion`;
    const authHeader = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;

    const batch: any[] = [];
    const rootSpan = session.spans[0];

    batch.push({
      id: randomUUID(),
      type: "trace-create",
      timestamp: new Date(rootSpan.startTime).toISOString(),
      body: {
        id: session.traceId,
        name: session.name,
        metadata: { requestId },
      },
    });

    for (const span of session.spans) {
      const isRoot = span.id === session.rootSpanId;
      batch.push({
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date(span.startTime).toISOString(),
        body: {
          id: span.id,
          traceId: session.traceId,
          parentObserveId: isRoot ? undefined : (span.parentId || session.rootSpanId),
          name: span.name,
          startTime: new Date(span.startTime).toISOString(),
          metadata: span.attributes,
        },
      });

      batch.push({
        id: randomUUID(),
        type: "span-update",
        timestamp: new Date(span.endTime || span.startTime).toISOString(),
        body: {
          id: span.id,
          endTime: new Date(span.endTime || span.startTime).toISOString(),
          input: span.attributes.llmInputMessages || span.attributes.input || undefined,
          output: span.attributes.output || undefined,
          usage: span.attributes.totalTokens
            ? {
                input: span.attributes.promptTokens || 0,
                output: span.attributes.completionTokens || 0,
                total: span.attributes.totalTokens || 0,
              }
            : undefined,
        },
      });
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ batch }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.warn(`[telemetry-langfuse] Failed to export trace: ${res.status} ${await res.text().catch(() => "")}`);
      }
    } catch (err) {
      console.warn(`[telemetry-langfuse] Error sending trace:`, err);
    }
  }

  private async dispatchToOltp(session: TraceSession, requestId: string): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint) return;

    let url = endpoint;
    if (!url.includes("/v1/")) {
      url = `${url.replace(/\/+$/, "")}/v1/traces`;
    }

    const resourceSpans = [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "savazai-harness" } },
            { key: "request.id", value: { stringValue: requestId } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "savazai-orchestrator" },
            spans: session.spans.map((span) => ({
              traceId: session.traceId,
              spanId: span.id,
              parentSpanId: span.parentId || undefined,
              name: span.name,
              kind: 1, // SPAN_KIND_INTERNAL
              startTimeUnixNano: String(span.startTime * 1_000_000),
              endTimeUnixNano: String((span.endTime || span.startTime) * 1_000_000),
              attributes: Object.entries(span.attributes).map(([k, v]) => ({
                key: k,
                value: typeof v === "number"
                  ? { doubleValue: v }
                  : typeof v === "boolean"
                    ? { boolValue: v }
                    : { stringValue: typeof v === "object" ? JSON.stringify(v) : String(v) },
              })),
              status: { code: span.attributes.error ? 2 : 1 },
            })),
          },
        ],
      },
    ];

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resourceSpans }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.warn(`[telemetry-otlp] Failed to export trace: ${res.status} ${await res.text().catch(() => "")}`);
      }
    } catch (err) {
      console.warn(`[telemetry-otlp] Error sending trace:`, err);
    }
  }
}
