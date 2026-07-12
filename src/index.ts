import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { PrivacyGateway } from "./utils/privacy-gateway.js";
import { compiledGraph, streamGraphEvents } from "./orchestrator/graph.js";
import { eventOrchestrator, OrchestratedEventSchema } from "./orchestrator/event-orchestrator.js";
import { StreamBroadcaster } from "./utils/stream-broadcaster.js";

const app = express();
const PORT = Number(process.env.PORT) || 3055;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const gateway = new PrivacyGateway();

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
  const result = await compiledGraph.invoke({
    messages: [{ role: "user", content: message, timestamp: new Date().toISOString() }],
    currentApp: currentApp ?? "",
    activeSubAgent: "",
    tokenMap: {},
    relevantSkills: [],
    verificationFailures: [],
    correctAttempts: 0,
    modelConfig: modelConfig ?? undefined,
    activeTools: activeTools ?? undefined,
  }, {
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

  try {
    const input = {
      messages: [{ role: "user" as const, content: message, timestamp: new Date().toISOString() }],
      currentApp: currentApp ?? "",
      activeSubAgent: "",
      tokenMap: {},
      relevantSkills: [],
      verificationFailures: [],
      correctAttempts: 0,
      modelConfig: modelConfig ?? undefined,
      activeTools: activeTools ?? undefined,
    };

    for await (const chunk of streamGraphEvents(input, { requestId, threadId })) {
      if (broadcaster.isClosed) break;
      broadcaster.send(chunk);
    }

    broadcaster.end();
  } catch (err) {
    broadcaster.error(err instanceof Error ? err : new Error(String(err)));
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
