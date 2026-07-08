import { randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

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

  public startTrace(requestId: string, name: string): TraceSession {
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
    };

    this.activeTraces.set(requestId, session);
    return session;
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
