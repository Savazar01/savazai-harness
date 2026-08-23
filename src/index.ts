import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { PrivacyGateway } from "./utils/privacy-gateway.js";
import { compiledGraph, streamGraphEvents, type GraphState } from "./orchestrator/graph.js";
import { eventOrchestrator, OrchestratedEventSchema } from "./orchestrator/event-orchestrator.js";
import { StreamBroadcaster } from "./utils/stream-broadcaster.js";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { systemConfigurations, agentflows } from "./db/schema.js";
import { TelemetryGateway } from "./utils/telemetry.js";
import { CanvasDefinitionSchema } from "./core/schemas.js";
import { compileCanvasToGraph } from "./core/compiler.js";
import { seed } from "./db/seed.js";

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
        return Object.keys(mcpServersObj).filter(key => {
          const cfg = mcpServersObj[key];
          return !(cfg && (cfg.disabled === true || cfg.active === false));
        });
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

async function resolveGraphForAgentflow(agentflowId?: string) {
  if (!agentflowId) return compiledGraph;
  const [wf] = await db.select().from(agentflows).where(eq(agentflows.id, agentflowId)).limit(1);
  if (!wf || wf.status !== "published" || !wf.canvasDefinition) return compiledGraph;
  const parsed = CanvasDefinitionSchema.safeParse(wf.canvasDefinition);
  if (!parsed.success) return compiledGraph;
  return compileCanvasToGraph(parsed.data);
}

app.post("/api/graph/invoke", async (req, res) => {
  const { message, currentApp, modelConfig, activeTools, threadId, workflowId, agentflowId } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message field required" });
    return;
  }
  const requestId = crypto.randomUUID();
  const invokeInput: Partial<GraphState> = {
    messages: [{ role: "user", content: message, timestamp: new Date().toISOString() }],
    plan_approved: undefined,
    supervisorPlan: undefined,
    approvedActions: undefined,
    parameterLocks: undefined,
  };
  if (currentApp) invokeInput.currentApp = currentApp;
  if (modelConfig) invokeInput.modelConfig = modelConfig;
  
  const resolvedTools = await resolveActiveTools(activeTools);
  invokeInput.activeTools = resolvedTools;

  const graph = await resolveGraphForAgentflow(agentflowId || workflowId);
  const result = await graph.invoke(invokeInput as GraphState, {
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

  const { message, currentApp, modelConfig, activeTools, threadId, workflowId, agentflowId, executionMode, resume } = req.body;
  const isResume = resume !== undefined;
  if (!isResume && (!message || typeof message !== "string")) {
    res.status(400).json({ error: "message field required" });
    return;
  }

  const broadcaster = new StreamBroadcaster(res, streamMode);
  const requestId = crypto.randomUUID();

  // Start telemetry trace recording, binding threadId as chatId
  TelemetryGateway.getInstance().startTrace(requestId, "chat-stream-pass", threadId);

  try {
    let input: Partial<GraphState> | null = null;
    if (!isResume) {
      input = {
        messages: [{ role: "user" as const, content: message, timestamp: new Date().toISOString() }],
        plan_approved: undefined,
        supervisorPlan: undefined,
        approvedActions: undefined,
        parameterLocks: undefined,
      };
      if (currentApp) input.currentApp = currentApp;
      if (modelConfig) input.modelConfig = modelConfig;
      if (executionMode) input.executionMode = executionMode;
      
      const resolvedTools = await resolveActiveTools(activeTools);
      input.activeTools = resolvedTools;
    }

    const graph = await resolveGraphForAgentflow(agentflowId || workflowId);
    let hasSentAssistantMessage = false;

    const streamOptions = {
      requestId,
      threadId,
      resume,
      executionMode,
    };

    for await (const chunk of streamGraphEvents(input, streamOptions, graph)) {
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

    // Inspect graph state to determine if execution is suspended on an interrupt
    const stateConfig = { configurable: { thread_id: threadId || "default-thread" } };
    const graphState = await graph.getState(stateConfig);
    if (graphState.tasks && graphState.tasks.length > 0) {
      const pendingTask = graphState.tasks.find((t: any) => t.interrupts && t.interrupts.length > 0);
      if (pendingTask) {
        const interruptInfo = pendingTask.interrupts[0];
        console.log("[stream] Suspending execution on interrupt:", interruptInfo);
        broadcaster.send({
          type: "interrupt",
          node: pendingTask.name,
          interrupt: interruptInfo.value,
        });
        hasSentAssistantMessage = true;
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

app.post("/api/graph/compile", async (req, res) => {
  try {
    const parsed = CanvasDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid canvas definition", details: parsed.error.issues });
      return;
    }
    compileCanvasToGraph(parsed.data);
    res.json({
      success: true,
      message: "Canvas compiled to LangGraph successfully",
      nodeCount: parsed.data.nodes.length,
      edgeCount: parsed.data.edges.length,
      workflowType: parsed.data.workflowType,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Graph compilation failed: ${errMsg}` });
  }
});


/* ── Dynamic Tool Registry ── */
app.get("/api/tools/registered", async (_req, res) => {
  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    const tokens = configs.length > 0 ? (configs[0].designTokens || {}) as any : {};

    // 1. Google Places Key Check
    const googlePlacesApiKey = tokens.googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY;
    const placesActive = !!(googlePlacesApiKey && googlePlacesApiKey.trim());

    // 2. Web Search Key Check
    const tavilyApiKey = tokens.tavilyApiKey || process.env.TAVILY_API_KEY;
    const serperApiKey = tokens.serperApiKey || process.env.SERPER_API_KEY;
    const searchActive = !!((tavilyApiKey && tavilyApiKey.trim()) || (serperApiKey && serperApiKey.trim()));

    // 3. Email Key Check
    const sendgridApiKey = tokens.sendgridApiKey || process.env.SENDGRID_API_KEY;
    const hasSendgrid = !!(sendgridApiKey && sendgridApiKey.trim());
    const hasGmail = !!(tokens.gmailClientId && tokens.gmailClientSecret && (tokens.gmailRefreshToken || tokens.OAUTH_REFRESH_TOKEN));
    const emailActive = hasSendgrid || hasGmail;

    // 4. Yelp API Key Check
    const yelpApiKey = tokens.yelpApiKey || process.env.YELP_API_KEY;
    const yelpActive = !!(yelpApiKey && yelpApiKey.trim());

    // 5. WhatsApp / WABA Key Check
    const wabaToken = tokens.wabaAccessToken || tokens.whatsappAccessToken || process.env.WABA_ACCESS_TOKEN;
    const wabaActive = !!(wabaToken && wabaToken.trim());

    // 6. Custom Registered APIs / Webhooks saved in system settings
    let customSkills: any[] = [];
    if (tokens.customSkills) {
      try {
        customSkills = typeof tokens.customSkills === "string" ? JSON.parse(tokens.customSkills) : tokens.customSkills;
      } catch (e) {
        console.error("Failed to parse customSkills:", e);
      }
    }

    const toolsList = [
      {
        name: "google-places",
        label: "Google Places & Local Search",
        category: "native",
        status: placesActive ? "active" : "needs_key",
        description: "Local business lookup, ratings, review counts, contact phone numbers, and maps links via the Google Places (New) API."
      },
      {
        name: "web-search",
        label: "Web Search (Serper / Tavily)",
        category: "native",
        status: searchActive ? "active" : "needs_key",
        description: "Search the web for real-time contact enrichment, phone numbers, emails, and website links via Serper or Tavily."
      },
      {
        name: "send-email",
        label: "Email Auto-Sender",
        category: "native",
        status: emailActive ? "active" : "needs_key",
        description: "Send automated emails utilizing SendGrid or Google Gmail."
      },
      {
        name: "generate-pdf",
        label: "PDF Report Generator",
        category: "native",
        status: "active",
        description: "Generate structured PDF reports from text utilizing local python scripts and ReportLab."
      },
      {
        name: "generate-csv",
        label: "CSV Export Generator",
        category: "native",
        status: "active",
        description: "Generate RFC 4180 compliant CSV spreadsheets with downloadable Data URI links."
      },
      {
        name: "yelp-business-search",
        label: "Yelp Business Search",
        category: "native",
        status: yelpActive ? "active" : "needs_key",
        description: "Search for local businesses, reviews, and ratings via the Yelp Fusion API."
      },
      {
        name: "whatsapp-messenger",
        label: "WhatsApp Messenger (WABA)",
        category: "native",
        status: wabaActive ? "active" : "needs_key",
        description: "Send templated and free-form WhatsApp messages via the official WABA Cloud API."
      },
      {
        name: "phone_number_validator",
        label: "Phone Number Validator",
        category: "native",
        status: "active",
        description: "Validates and normalizes phone numbers to E.164 standard."
      },
      {
        name: "email_domain_inspector",
        label: "Email Domain Inspector",
        category: "native",
        status: "active",
        description: "Inspects email domains by looking up MX records for deliverability verification."
      },
      {
        name: "geocoding_lookup",
        label: "Geocoding Address Lookup",
        category: "native",
        status: "active",
        description: "Converts physical addresses to latitude and longitude coordinates."
      },
      {
        name: "financial_math_calculator",
        label: "Financial Math Calculator",
        category: "native",
        status: "active",
        description: "Evaluates mathematical and financial expressions safely."
      },
      {
        name: "analytics_dashboard_generator",
        label: "Analytics Dashboard Generator",
        category: "native",
        status: "active",
        description: "Generates structured event summaries and analytical data dashboards."
      },
      {
        name: "postgres_query_tool",
        label: "PostgreSQL Database Query Tool",
        category: "native",
        status: "active",
        description: "Queries external PostgreSQL databases to retrieve or update structured records."
      },
      {
        name: "sqlite_query_tool",
        label: "SQLite Database Query Tool",
        category: "native",
        status: "active",
        description: "Queries external SQLite databases locally."
      },
      {
        name: "mongodb_query_tool",
        label: "MongoDB Document Query Tool",
        category: "native",
        status: "active",
        description: "Queries external MongoDB document databases locally."
      },
      {
        name: "google_docs_writer",
        label: "Google Docs Writer",
        category: "native",
        status: hasGmail ? "active" : "needs_key",
        description: "Creates and appends structured records directly to Google Documents."
      },
      {
        name: "google_sheets_sync",
        label: "Google Sheets Sync",
        category: "native",
        status: hasGmail ? "active" : "needs_key",
        description: "Synchronizes data rows directly to Google Sheets spreadsheets."
      },
      {
        name: "google_drive_uploader",
        label: "Google Drive Uploader",
        category: "native",
        status: hasGmail ? "active" : "needs_key",
        description: "Uploads report files and logs directly to Google Drive storage."
      }
    ];

    // Add custom dynamic webhook/API registrations
    if (Array.isArray(customSkills)) {
      for (const skill of customSkills) {
        if (skill && skill.name) {
          const formattedLabel = skill.name
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          toolsList.push({
            name: skill.name,
            label: formattedLabel,
            category: "custom",
            status: "active",
            description: skill.description || "Custom registered webhook/API tool."
          });
        }
      }
    }

    // Add registered external database connections
    let dbConnections: any[] = [];
    if (tokens.dbConnections) {
      try {
        dbConnections = typeof tokens.dbConnections === "string" ? JSON.parse(tokens.dbConnections) : tokens.dbConnections;
      } catch (e) {
        console.error("Failed to parse dbConnections:", e);
      }
    }

    if (Array.isArray(dbConnections)) {
      for (const conn of dbConnections) {
        if (conn && conn.alias) {
          const engineLabelMap: Record<string, string> = {
            postgres: "PostgreSQL",
            mysql: "MySQL",
            mariadb: "MariaDB",
            mongodb: "MongoDB",
            sqlite: "SQLite",
            oracle: "Oracle"
          };
          const engineName = engineLabelMap[conn.engine] || conn.engine || "Database";
          toolsList.push({
            name: `db_query_${conn.alias.toLowerCase().replace(/\s+/g, "-")}`,
            label: `DB Connection: ${conn.alias} (${engineName})`,
            category: "database",
            status: conn.active ? "active" : "inactive",
            description: `Execute queries on the external ${conn.alias} (${engineName}) database connection.`
          });
        }
      }
    }

    // Add registered social connections
    let socialConnections: any[] = [];
    if (tokens.socialConnections) {
      try {
        socialConnections = typeof tokens.socialConnections === "string" ? JSON.parse(tokens.socialConnections) : tokens.socialConnections;
      } catch (e) {
        console.error("Failed to parse socialConnections:", e);
      }
    }

    if (Array.isArray(socialConnections)) {
      for (const conn of socialConnections) {
        if (conn && conn.name) {
          const presetLabelMap: Record<string, string> = {
            youtube: "YouTube",
            instagram: "Instagram",
            facebook: "Facebook",
            linkedin: "LinkedIn",
            tiktok: "TikTok",
            x: "X (Twitter)",
            pinterest: "Pinterest",
            custom: "Custom Connection"
          };
          const presetName = presetLabelMap[conn.preset] || conn.preset || "Social Media";
          toolsList.push({
            name: `social_${conn.preset.toLowerCase()}_${conn.name.toLowerCase().replace(/\s+/g, "_")}`,
            label: `Social Hub: ${conn.name} (${presetName})`,
            category: "social_media",
            status: conn.active ? "active" : "inactive",
            description: `Execute social media publishing, queries, and integrations on the ${conn.name} (${presetName}) connection.`
          });
        }
      }
    }

    res.json({ tools: toolsList });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/* ── Settings (LLM Providers) ── */
app.get("/api/settings", async (_req, res) => {
  try {
    const configs = await db.select().from(systemConfigurations).limit(1);
    if (configs.length === 0) {
      res.json({ llmProviders: [] });
      return;
    }
    const tokens = configs[0].designTokens || {};
    const raw = tokens.llmProviders;
    let llmProviders: Record<string, { apiKey?: string; endpoint?: string; defaultModel?: string; active?: boolean; models?: string[]; discoveredModels?: string[] }> = {};
    if (typeof raw === "string") {
      try { llmProviders = JSON.parse(raw); } catch { llmProviders = {}; }
    } else if (raw && typeof raw === "object") {
      llmProviders = raw as typeof llmProviders;
    }
    const masked = Object.entries(llmProviders).map(([id, cfg]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      endpoint: cfg.endpoint,
      defaultModel: cfg.defaultModel,
      models: cfg.models,
      discoveredModels: cfg.discoveredModels,
      active: cfg.active !== false,
      hasKeyConfigured: !!cfg.apiKey,
    }));
    res.json({ llmProviders: masked });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/* ── Agentflows CRUD ── */
app.get("/api/agentflows", async (_req, res) => {
  try {
    const rows = await db.select().from(agentflows).orderBy(agentflows.createdAt);
    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/agentflows/:id", async (req, res) => {
  try {
    const row = await db.select().from(agentflows).where(eq(agentflows.id, req.params.id)).limit(1);
    if (row.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/agentflows", async (req, res) => {
  try {
    const { name, description, workspaceMode, canvasDefinition } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name (string) required" });
      return;
    }
    const row = await db.insert(agentflows).values({
      name,
      description: description || null,
      workspaceMode: workspaceMode || "interactive",
      canvasDefinition: canvasDefinition || {},
    }).returning();
    res.status(201).json(row[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.put("/api/agentflows/:id", async (req, res) => {
  try {
    const updates: Record<string, any> = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.workspaceMode !== undefined) updates.workspaceMode = req.body.workspaceMode;
    if (req.body.canvasDefinition !== undefined) {
      updates.canvasDefinition = typeof req.body.canvasDefinition === "string"
        ? JSON.parse(req.body.canvasDefinition)
        : req.body.canvasDefinition;
    }
    if (req.body.status !== undefined) updates.status = req.body.status;
    updates.updatedAt = req.body.updatedAt ? new Date(req.body.updatedAt) : new Date();
    const row = await db.update(agentflows).set(updates).where(eq(agentflows.id, req.params.id)).returning();
    if (row.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.delete("/api/agentflows/:id", async (req, res) => {
  try {
    const row = await db.delete(agentflows).where(eq(agentflows.id, req.params.id)).returning();
    if (row.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ deleted: true, id: row[0].id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

console.log("[savazai-harness] Service initialized");

async function startServer() {
  try {
    await seed();
  } catch (err) {
    console.error("[savazai-harness] Background seed warning:", err);
  }

  app.listen(PORT, () => {
    console.log(`[savazai-harness] Listening on port ${PORT}`);
  });
}

startServer();
