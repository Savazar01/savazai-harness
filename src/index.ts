import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { PrivacyGateway } from "./utils/privacy-gateway.js";
import { compiledGraph, streamGraphEvents, type GraphState } from "./orchestrator/graph.js";
import { eventOrchestrator, OrchestratedEventSchema } from "./orchestrator/event-orchestrator.js";
import { StreamBroadcaster } from "./utils/stream-broadcaster.js";
import { db } from "./db/index.js";
import { systemConfigurations } from "./db/schema.js";
import { TelemetryGateway } from "./utils/telemetry.js";

const app = express();
const PORT = Number(process.env.PORT) || 3055;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const gateway = new PrivacyGateway();

async function resolveActiveTools(activeTools?: string[]): Promise<string[]> {
  if (activeTools && activeTools.length > 0) {
    return activeTools;
  }
  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    if (configs.length > 0 && configs[0].designTokens) {
      const tokens = configs[0].designTokens as any;
      const mcpServersValue = tokens.mcpServers;
      if (mcpServersValue) {
        let mcpServersObj: any = {};
        if (typeof mcpServersValue === "string") {
          mcpServersObj = JSON.parse(mcpServersValue);
          mcpServersObj = mcpServersObj.mcpServers || mcpServersObj;
        } else {
          mcpServersObj = mcpServersValue.mcpServers || mcpServersValue;
        }
        return Object.keys(mcpServersObj);
      }
    }
  } catch (err) {
    console.error("[resolveActiveTools] Failed to load default active tools:", err);
  }
  return [];
}

app.post("/api/test-mask", (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text field required" });
    return;
  }
  const { maskedText, tokenMap } = gateway.maskPayload(text);
  const unmapped = Object.fromEntries(tokenMap);
  const unmaskedText = gateway.unmaskPayload(maskedText, tokenMap);
  res.json({ original: text, masked: maskedText, tokenMap: unmapped, unmasked: unmaskedText });
});

app.post("/api/graph/invoke", async (req, res) => {
  const { message, currentApp, modelConfig, activeTools, threadId } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message field required" });
    return;
  }
  const requestId = crypto.randomUUID();
  const invokeInput: Partial<GraphState> = {
    messages: [{ role: "user", content: message, timestamp: new Date().toISOString() }],
  };
  if (currentApp) invokeInput.currentApp = currentApp;
  if (modelConfig) invokeInput.modelConfig = modelConfig;
  
  const resolvedTools = await resolveActiveTools(activeTools);
  invokeInput.activeTools = resolvedTools;

  const result = await compiledGraph.invoke(invokeInput as GraphState, {
    configurable: { requestId, thread_id: threadId || "default-thread" }
  });
  res.json(result);
});

app.post("/api/graph/invoke/stream", async (req, res) => {
  const streamMode = (req.query["stream-mode"] || req.headers["stream-mode"]) as string | undefined;
  if (streamMode !== "sse" && streamMode !== "http") {
    res.status(400).json({ error: "stream-mode must be 'sse' or 'http' (via query or header)" });
    return;
  }

  const { message, currentApp, modelConfig, activeTools, threadId } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message field required" });
    return;
  }

  const broadcaster = new StreamBroadcaster(res, streamMode);
  const requestId = crypto.randomUUID();

  // Start telemetry trace recording, binding threadId as chatId
  TelemetryGateway.getInstance().startTrace(requestId, "chat-stream-pass", threadId);

  try {
    const input: Partial<GraphState> = {
      messages: [{ role: "user" as const, content: message, timestamp: new Date().toISOString() }],
    };
    if (currentApp) input.currentApp = currentApp;
    if (modelConfig) input.modelConfig = modelConfig;
    
    const resolvedTools = await resolveActiveTools(activeTools);
    input.activeTools = resolvedTools;

    let hasSentAssistantMessage = false;

    for await (const chunk of streamGraphEvents(input, { requestId, threadId })) {
      if (broadcaster.isClosed) break;
      const anyChunk = chunk as any;
      const nodeKeys = Object.keys(anyChunk);
      for (const nodeKey of nodeKeys) {
        // Exclude intermediate diagnostic messages from background sub-agents
        if (nodeKey !== "respondNode") {
          continue;
        }
        const nodeUpdate = anyChunk[nodeKey];
        if (nodeUpdate && Array.isArray(nodeUpdate.messages)) {
          const assistantMsg = nodeUpdate.messages.find((m: any) => m.role === "assistant");
          if (assistantMsg && assistantMsg.content) {
            let content = assistantMsg.content.trim();
            // Verify and skip any diagnostics prefixed with [MutationAgent] or [DataFetchAgent]
            if (content.startsWith("[MutationAgent]") || content.startsWith("[DataFetchAgent]") || content.startsWith("[CommunicationAgent]")) {
              continue;
            }
            // Rigorously filter trailing JSON braces/brackets and routing structures
            content = content.replace(/(?:\s*\}|\])+\s*$/g, '').trim();
            content = content.replace(/\{\s*"routingDecision".*?\}\s*$/gs, '').trim();
            content = content.replace(/\{\s*"meta".*?\}\s*$/gs, '').trim();
            
            // Scrub any leading or trailing standalone template syntax artifacts (like }, }}, {, {{)
            content = content.replace(/^[\s,;|}]+/, '').trim();
            content = content.replace(/[\s,;|}]+$/, '').trim();
            
            if (content) {
              broadcaster.send({ type: "content", content });
              hasSentAssistantMessage = true;
            }
          }
        }
      }
    }

    if (!hasSentAssistantMessage) {
      broadcaster.send({
        type: "content",
        content: "I processed your request, but no final conversational response was generated by the orchestrator. This can happen if all matching tools have already executed. Please try again or check your query.",
      });
    }

    broadcaster.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[invoke/stream] Orchestrator exception encountered:", errMsg);
    // End telemetry trace cleanly upon execution error
    TelemetryGateway.getInstance().endTrace(requestId);
    broadcaster.send({
      type: "content",
      content: `An internal exception was encountered during stream execution: ${errMsg}`,
    });
    broadcaster.end();
  }
});

app.get(["/api/graph/threads/:threadId", "/api/history/threads/:threadId"], async (req, res) => {
  const { threadId } = req.params;
  try {
    const state = await compiledGraph.getState({
      configurable: { thread_id: threadId }
    });
    if (!state || !state.values?.messages?.length) {
      res.status(404).json({ error: "Thread not found", threadId });
      return;
    }
    const filteredMessages = (state.values.messages || []).filter((m: any) => {
      if (m.role === "assistant") {
        const content = m.content || "";
        if (content.startsWith("[MutationAgent]") || content.startsWith("[DataFetchAgent]") || content.startsWith("[CommunicationAgent]")) {
          return false;
        }
      }
      return true;
    });

    res.json({
      threadId,
      messages: filteredMessages,
      hasTokenMap: Object.keys(state.values.tokenMap || {}).length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get thread state" });
  }
});

app.post("/api/orchestrate/run", async (req, res) => {
  const { title, totalDays, objectives } = req.body;
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title (string) required" });
    return;
  }
  if (!Number.isInteger(totalDays) || (totalDays as number) < 1) {
    res.status(400).json({ error: "totalDays (positive integer) required" });
    return;
  }
  if (!Array.isArray(objectives) || objectives.length === 0) {
    res.status(400).json({ error: "objectives (non-empty array) required" });
    return;
  }

  const event = eventOrchestrator.initializeEvent(title, totalDays, objectives);
  const result = await eventOrchestrator.executeCurrentDayStep(event.id);
  const parsed = OrchestratedEventSchema.parse(result);
  res.json(parsed);
});

console.log("[savazai-harness] Service initialized");

app.listen(PORT, () => {
  console.log(`[savazai-harness] Listening on port ${PORT}`);
});
